import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import { listSecurityRolesQuery } from "../../queries/security-queries.js";
import {
  appModuleRolesPath,
  listAccessTeamsQuery,
  listAccessUsersQuery,
  listAuditActivityForUsersQuery,
  roleTeamsPath,
  roleUsersPath,
  teamUsersPath,
} from "../../queries/access-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { queryRecordsByFieldValuesInChunks } from "../../utils/query-batching.js";
import { fetchAppModuleDetails, type AppModuleSummaryRecord } from "../alm/alm-metadata.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { normalizeRole, resolveSecurityRole, type SecurityRoleRecord } from "./role-metadata.js";

const DEFAULT_ACTIVE_WITHIN_DAYS = 90;
const DEFAULT_MAX_USERS = 100;

const accessUtilizationReportSchema = {
  environment: z.string().optional().describe("Environment name"),
  roleName: z.string().optional().describe("Optional security role name or role id"),
  appName: z.string().optional().describe("Optional app module name or unique name"),
  businessUnit: z
    .string()
    .optional()
    .describe("Optional business unit name or id used when resolving roleName."),
  includeTeams: z
    .boolean()
    .optional()
    .describe("Include users who get access through teams. Default: true."),
  activeWithinDays: z
    .number()
    .int()
    .min(1)
    .max(3650)
    .optional()
    .describe(`Audit activity lookback window in days. Defaults to ${DEFAULT_ACTIVE_WITHIN_DAYS}.`),
  maxUsers: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(`Maximum user rows to include in the response. Defaults to ${DEFAULT_MAX_USERS}.`),
};

type AccessUtilizationReportParams = ToolParams<typeof accessUtilizationReportSchema>;

interface AccessUserRecord extends Record<string, unknown> {
  systemuserid: string;
  fullname: string;
  domainname: string;
  internalEmailAddress: string;
  businessUnitId: string;
  businessUnitName: string;
  isDisabled: boolean;
  isLicensed: boolean | null;
  accessMode: number;
  accessModeLabel: string;
}

interface AccessTeamRecord extends Record<string, unknown> {
  teamid: string;
  name: string;
  businessUnitId: string;
  businessUnitName: string;
  teamType: number;
  teamTypeLabel: string;
  isDefault: boolean;
}

interface UserAccessSummary extends AccessUserRecord {
  assignmentTypes: string[];
  roles: Array<{
    roleid: string;
    name: string;
    businessUnitName: string;
  }>;
  teams: Array<{
    teamid: string;
    name: string;
  }>;
  lastAuditActivityOn: string | null;
  activityStatus: "active" | "no_recent_audit_activity" | "unknown";
}

interface RoleAccessSource {
  role: SecurityRoleRecord;
  source: "role" | "app_module";
}

interface ActivityResult {
  lastActivityByUserId: Map<string, string>;
  auditAvailable: boolean;
  warning: string | null;
}

export async function handleAccessUtilizationReport(
  params: AccessUtilizationReportParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, params.environment);
    const activeWithinDays = params.activeWithinDays ?? DEFAULT_ACTIVE_WITHIN_DAYS;
    const includeTeams = params.includeTeams ?? true;
    const maxUsers = params.maxUsers ?? DEFAULT_MAX_USERS;

    if (!params.roleName?.trim() && !params.appName?.trim()) {
      throw new Error("Provide roleName, appName, or both.");
    }

    const target = await resolveAccessTarget(env, client, params);
    const access = await collectAccessUsers(env, client, target.roles, includeTeams);
    const activity = await fetchAuditActivity(env, client, access.users, activeWithinDays);
    const users = buildUserSummaries(access.users, activity);
    const sortedUsers = sortUsersForReport(users);
    const displayedUsers = sortedUsers.slice(0, maxUsers);
    const counts = buildCounts(users, activity.auditAvailable);
    const warnings = [
      "User activity depends on Dataverse audit data. If auditing is disabled, limited, or not readable, activity can be missing.",
      ...(target.type === "app_module" && target.roles.length === 0
        ? [
            "No linked security roles were found for the app module. This report cannot infer users from app role links.",
          ]
        : []),
      ...(activity.warning ? [activity.warning] : []),
      ...(sortedUsers.length > displayedUsers.length
        ? [`Showing ${displayedUsers.length} of ${sortedUsers.length} user row(s).`]
        : []),
    ];
    const text = renderReport({
      env,
      target,
      activeWithinDays,
      includeTeams,
      counts,
      users: displayedUsers,
      warnings,
    });

    return createToolSuccessResponse(
      "access_utilization_report",
      text,
      `Built access utilization report for '${target.name}' in '${env.name}'.`,
      {
        environment: env.name,
        target,
        options: {
          includeTeams,
          activeWithinDays,
          maxUsers,
        },
        counts,
        warnings,
        users: displayedUsers,
      },
    );
  } catch (error) {
    return createToolErrorResponse("access_utilization_report", error);
  }
}

export const accessUtilizationReportTool = defineTool({
  name: "access_utilization_report",
  description: "Report assigned versus audit-active users by security role or app module access.",
  schema: accessUtilizationReportSchema,
  handler: handleAccessUtilizationReport,
});

export function registerAccessUtilizationReport(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, accessUtilizationReportTool, { config, client });
}

async function resolveAccessTarget(
  env: EnvironmentConfig,
  client: DynamicsClient,
  params: AccessUtilizationReportParams,
): Promise<{
  type: "security_role" | "app_module";
  name: string;
  id: string;
  app: AppModuleSummaryRecord | null;
  roles: RoleAccessSource[];
}> {
  const app = params.appName?.trim()
    ? await fetchAppModuleDetails(env, client, params.appName, undefined)
    : null;
  const selectedRole = params.roleName?.trim()
    ? await resolveSecurityRole(env, client, params.roleName, params.businessUnit)
    : null;

  if (!app && selectedRole) {
    return {
      type: "security_role",
      name: selectedRole.name,
      id: selectedRole.roleid,
      app: null,
      roles: [{ role: selectedRole, source: "role" }],
    };
  }

  if (!app) {
    throw new Error("Provide roleName, appName, or both.");
  }

  const appRoles = (
    await client.queryPath<Record<string, unknown>>(
      env,
      appModuleRolesPath(app.appmoduleid),
      listSecurityRolesQuery(),
    )
  ).map(normalizeRole);
  const allRoles = (
    await client.query<Record<string, unknown>>(env, "roles", listSecurityRolesQuery())
  ).map(normalizeRole);
  const expandedRoles = expandRoleFamilies(appRoles, allRoles);
  const filteredRoles = selectedRole
    ? expandedRoles.filter((role) => rolesShareRoot(role, selectedRole))
    : expandedRoles;

  return {
    type: "app_module",
    name: app.name,
    id: app.appmoduleid,
    app,
    roles: filteredRoles.map((role) => ({ role, source: "app_module" })),
  };
}

async function collectAccessUsers(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleSources: RoleAccessSource[],
  includeTeams: boolean,
): Promise<{ users: UserAccessSummary[] }> {
  const usersById = new Map<string, UserAccessSummary>();

  for (const roleSource of roleSources) {
    const directUsers = (
      await client.queryPath<Record<string, unknown>>(
        env,
        roleUsersPath(roleSource.role.roleid),
        listAccessUsersQuery(),
      )
    ).map(normalizeAccessUser);

    for (const user of directUsers) {
      mergeUser(usersById, user, roleSource.role, null, "direct_role");
    }

    if (!includeTeams) {
      continue;
    }

    const teams = (
      await client.queryPath<Record<string, unknown>>(
        env,
        roleTeamsPath(roleSource.role.roleid),
        listAccessTeamsQuery(),
      )
    ).map(normalizeAccessTeam);

    for (const team of teams) {
      const teamUsers = (
        await client.queryPath<Record<string, unknown>>(
          env,
          teamUsersPath(team.teamid),
          listAccessUsersQuery(),
        )
      ).map(normalizeAccessUser);

      for (const user of teamUsers) {
        mergeUser(usersById, user, roleSource.role, team, "team_role");
      }
    }
  }

  return { users: [...usersById.values()] };
}

async function fetchAuditActivity(
  env: EnvironmentConfig,
  client: DynamicsClient,
  users: UserAccessSummary[],
  activeWithinDays: number,
): Promise<ActivityResult> {
  const userIds = users.map((user) => user.systemuserid).filter(Boolean);
  if (userIds.length === 0) {
    return { lastActivityByUserId: new Map(), auditAvailable: true, warning: null };
  }

  const createdAfter = new Date(Date.now() - activeWithinDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const audits = await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
      env,
      client,
      "audits",
      userIds,
      "_userid_value",
      (chunkUserIds) => listAuditActivityForUsersQuery(chunkUserIds, createdAfter),
      {
        chunkSize: 15,
        requestOptions: {
          cacheTier: CACHE_TIERS.NONE,
          maxPages: 10,
        },
      },
    );
    const lastActivityByUserId = new Map<string, string>();

    for (const audit of audits) {
      const userId = String(audit._userid_value || "");
      const createdOn = String(audit.createdon || "");
      const current = lastActivityByUserId.get(userId);
      if (userId && createdOn && (!current || createdOn > current)) {
        lastActivityByUserId.set(userId, createdOn);
      }
    }

    return { lastActivityByUserId, auditAvailable: true, warning: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      lastActivityByUserId: new Map(),
      auditAvailable: false,
      warning: `Audit activity could not be read: ${message}`,
    };
  }
}

function buildUserSummaries(
  users: UserAccessSummary[],
  activity: ActivityResult,
): UserAccessSummary[] {
  return users.map((user) => {
    const lastAuditActivityOn = activity.lastActivityByUserId.get(user.systemuserid) || null;
    return {
      ...user,
      lastAuditActivityOn,
      activityStatus: activity.auditAvailable
        ? lastAuditActivityOn
          ? "active"
          : "no_recent_audit_activity"
        : "unknown",
    };
  });
}

function mergeUser(
  usersById: Map<string, UserAccessSummary>,
  user: AccessUserRecord,
  role: SecurityRoleRecord,
  team: AccessTeamRecord | null,
  assignmentType: "direct_role" | "team_role",
): void {
  const existing = usersById.get(user.systemuserid);
  const summary =
    existing ||
    ({
      ...user,
      assignmentTypes: [],
      roles: [],
      teams: [],
      lastAuditActivityOn: null,
      activityStatus: "unknown",
    } satisfies UserAccessSummary);

  addUnique(summary.assignmentTypes, assignmentType);
  addUniqueObject(summary.roles, {
    roleid: role.roleid,
    name: role.name,
    businessUnitName: role.businessUnitName,
  });

  if (team) {
    addUniqueObject(summary.teams, {
      teamid: team.teamid,
      name: team.name,
    });
  }

  usersById.set(user.systemuserid, summary);
}

function buildCounts(users: UserAccessSummary[], auditAvailable: boolean) {
  const enabledUsers = users.filter((user) => !user.isDisabled);
  const licensedUsers = users.filter((user) => user.isLicensed === true);

  return {
    assignedUsers: users.length,
    enabledUsers: enabledUsers.length,
    disabledUsers: users.length - enabledUsers.length,
    licensedUsers: licensedUsers.length,
    usersWithUnknownLicense: users.filter((user) => user.isLicensed === null).length,
    interactiveUsers: users.filter((user) => user.accessMode !== 4).length,
    nonInteractiveUsers: users.filter((user) => user.accessMode === 4).length,
    directRoleUsers: users.filter((user) => user.assignmentTypes.includes("direct_role")).length,
    teamRoleUsers: users.filter((user) => user.assignmentTypes.includes("team_role")).length,
    activeUsers: auditAvailable
      ? users.filter((user) => user.activityStatus === "active").length
      : null,
    noRecentAuditActivityUsers: auditAvailable
      ? users.filter((user) => user.activityStatus === "no_recent_audit_activity").length
      : null,
    unknownActivityUsers: auditAvailable
      ? 0
      : users.filter((user) => user.activityStatus === "unknown").length,
    auditAvailable,
  };
}

function renderReport(options: {
  env: EnvironmentConfig;
  target: {
    type: "security_role" | "app_module";
    name: string;
    roles: RoleAccessSource[];
  };
  activeWithinDays: number;
  includeTeams: boolean;
  counts: ReturnType<typeof buildCounts>;
  users: UserAccessSummary[];
  warnings: string[];
}): string {
  const { env, target, activeWithinDays, includeTeams, counts, users, warnings } = options;
  const lines: string[] = [];

  lines.push(`## Access Utilization Report: ${target.name}`);
  lines.push(`- Environment: ${env.name}`);
  lines.push(`- Target Type: ${target.type === "app_module" ? "App Module" : "Security Role"}`);
  lines.push(`- Included Roles: ${target.roles.length}`);
  lines.push(`- Include Teams: ${includeTeams ? "Yes" : "No"}`);
  lines.push(`- Activity Window: ${activeWithinDays} day(s)`);
  lines.push("");
  lines.push("### Summary");
  lines.push(`- Assigned Users: ${counts.assignedUsers}`);
  lines.push(`- Enabled Users: ${counts.enabledUsers}`);
  lines.push(`- Disabled Users: ${counts.disabledUsers}`);
  lines.push(`- Licensed Users: ${counts.licensedUsers}`);
  lines.push(`- Direct Role Users: ${counts.directRoleUsers}`);
  lines.push(`- Team Role Users: ${counts.teamRoleUsers}`);
  lines.push(
    `- Audit Active Users: ${counts.activeUsers === null ? "Unknown" : String(counts.activeUsers)}`,
  );
  lines.push(
    `- No Recent Audit Activity: ${
      counts.noRecentAuditActivityUsers === null
        ? "Unknown"
        : String(counts.noRecentAuditActivityUsers)
    }`,
  );

  if (warnings.length > 0) {
    lines.push("");
    lines.push("### Notes");
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (users.length > 0) {
    lines.push("");
    lines.push("### Users");
    lines.push(
      formatTable(
        ["User", "Status", "Access", "Activity", "Last Audit", "Roles", "Teams"],
        users.map((user) => [
          user.fullname || user.domainname || user.systemuserid,
          user.isDisabled ? "Disabled" : "Enabled",
          user.assignmentTypes.join(", "),
          formatActivityStatus(user.activityStatus),
          user.lastAuditActivityOn ? user.lastAuditActivityOn.slice(0, 10) : "-",
          user.roles.map((role) => role.name).join(", ") || "-",
          user.teams.map((team) => team.name).join(", ") || "-",
        ]),
      ),
    );
  }

  return lines.join("\n");
}

function expandRoleFamilies(
  appRoles: SecurityRoleRecord[],
  allRoles: SecurityRoleRecord[],
): SecurityRoleRecord[] {
  const roots = new Set(appRoles.map(roleRootId).filter(Boolean));
  const roleIds = new Set(appRoles.map((role) => role.roleid));
  const expanded = allRoles.filter(
    (role) => roleIds.has(role.roleid) || roots.has(roleRootId(role)),
  );
  const byId = new Map<string, SecurityRoleRecord>();

  for (const role of [...appRoles, ...expanded]) {
    if (role.roleid) {
      byId.set(role.roleid, role);
    }
  }

  return [...byId.values()].sort(compareRoles);
}

function rolesShareRoot(left: SecurityRoleRecord, right: SecurityRoleRecord): boolean {
  return roleRootId(left) === roleRootId(right);
}

function roleRootId(role: SecurityRoleRecord): string {
  return role.parentrootroleid || role.roleid;
}

function normalizeAccessUser(record: Record<string, unknown>): AccessUserRecord {
  const licenseValue = record.islicensed;

  return {
    ...record,
    systemuserid: String(record.systemuserid || ""),
    fullname: String(record.fullname || ""),
    domainname: String(record.domainname || ""),
    internalEmailAddress: String(record.internalemailaddress || ""),
    businessUnitId: String(record._businessunitid_value || ""),
    businessUnitName: String(
      record["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._businessunitid_value ||
        "",
    ),
    isDisabled: Boolean(record.isdisabled),
    isLicensed: typeof licenseValue === "boolean" ? licenseValue : null,
    accessMode: Number(record.accessmode || 0),
    accessModeLabel: ACCESS_MODE_LABELS[Number(record.accessmode || 0)] || "Unknown",
  };
}

function normalizeAccessTeam(record: Record<string, unknown>): AccessTeamRecord {
  return {
    ...record,
    teamid: String(record.teamid || ""),
    name: String(record.name || ""),
    businessUnitId: String(record._businessunitid_value || ""),
    businessUnitName: String(
      record["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._businessunitid_value ||
        "",
    ),
    teamType: Number(record.teamtype || 0),
    teamTypeLabel: TEAM_TYPE_LABELS[Number(record.teamtype || 0)] || "Unknown",
    isDefault: Boolean(record.isdefault),
  };
}

function sortUsersForReport(users: UserAccessSummary[]): UserAccessSummary[] {
  return [...users].sort((left, right) => {
    const riskCompare = userRiskScore(right) - userRiskScore(left);
    if (riskCompare !== 0) {
      return riskCompare;
    }

    return (left.fullname || left.domainname || left.systemuserid).localeCompare(
      right.fullname || right.domainname || right.systemuserid,
    );
  });
}

function userRiskScore(user: UserAccessSummary): number {
  return (
    (user.isDisabled ? 100 : 0) +
    (user.accessMode === 4 ? 20 : 0) +
    (user.activityStatus === "no_recent_audit_activity" ? 10 : 0) +
    (user.assignmentTypes.includes("team_role") ? 1 : 0)
  );
}

function compareRoles(left: SecurityRoleRecord, right: SecurityRoleRecord): number {
  return `${left.name}|${left.businessUnitName}`.localeCompare(
    `${right.name}|${right.businessUnitName}`,
  );
}

function formatActivityStatus(status: UserAccessSummary["activityStatus"]): string {
  if (status === "active") {
    return "Audit active";
  }

  if (status === "no_recent_audit_activity") {
    return "No recent audit";
  }

  return "Unknown";
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function addUniqueObject<T extends Record<string, string>>(values: T[], value: T): void {
  const key = JSON.stringify(value);
  if (!values.some((item) => JSON.stringify(item) === key)) {
    values.push(value);
  }
}

const ACCESS_MODE_LABELS: Record<number, string> = {
  0: "Read-Write",
  1: "Administrative",
  2: "Read",
  3: "Support User",
  4: "Non-interactive",
  5: "Delegated Admin",
};

const TEAM_TYPE_LABELS: Record<number, string> = {
  0: "Owner",
  1: "Access",
  2: "Security Group",
  3: "Office Group",
};
