import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPrivilegesByIdsQuery,
  listRolePrivilegesForRolesQuery,
  listRolePrivilegesQuery,
  listSecurityRolesQuery,
} from "../../queries/security-queries.js";
import {
  queryRecordsByFieldValuesInChunks,
  queryRecordsByIdsInChunks,
} from "../../utils/query-batching.js";
import {
  fetchDefaultGlobalBusinessUnitName as fetchDefaultGlobalBusinessUnitNameMetadata,
  resolveBusinessUnit,
} from "./business-unit-metadata.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

const DEPTH_MASK_LABELS: Array<{ mask: number; label: string }> = [
  { mask: 1, label: "Basic" },
  { mask: 2, label: "Local" },
  { mask: 4, label: "Deep" },
  { mask: 8, label: "Global" },
];

const ACCESS_RIGHT_LABELS: Record<number, string> = {
  1: "Create",
  2: "Read",
  3: "Write",
  4: "Delete",
  5: "Assign",
  6: "Share",
  7: "Append",
  8: "Append To",
};

export interface SecurityRoleRecord extends Record<string, unknown> {
  roleid: string;
  name: string;
  businessunitid: string;
  businessUnitName: string;
  parentrootroleid: string;
  roletemplateid: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface RolePrivilegeRecord extends Record<string, unknown> {
  roleprivilegeid: string;
  roleid: string;
  privilegeid: string;
  privilegeName: string;
  accessright: number;
  accessRightLabel: string;
  privilegedepthmask: number;
  depthLabels: string[];
  depthDisplay: string;
  recordfilterid: string;
  ismanaged: boolean;
  canbebasic: boolean;
  canbelocal: boolean;
  canbedeep: boolean;
  canbeglobal: boolean;
}

export interface RolePrivilegeDetails {
  role: SecurityRoleRecord;
  privileges: RolePrivilegeRecord[];
}

export interface RoleResolutionResult {
  role: SecurityRoleRecord;
  warnings: string[];
}

interface ResolvedRoleMatches {
  exactId: SecurityRoleRecord[];
  narrowedExact: SecurityRoleRecord[];
  matches: SecurityRoleRecord[];
  ambiguous: SecurityRoleRecord[];
}

interface ResolvedRoleBusinessUnit {
  businessunitid: string;
  name: string;
}

export interface RolePrivilegeInventory {
  roles: SecurityRoleRecord[];
  privilegesByRoleId: Map<string, RolePrivilegeRecord[]>;
}

export async function listSecurityRoles(
  env: EnvironmentConfig,
  client: DynamicsClient,
  nameFilter?: string,
): Promise<SecurityRoleRecord[]> {
  const records = await client.query<Record<string, unknown>>(
    env,
    "roles",
    listSecurityRolesQuery(nameFilter),
  );

  return records.map(normalizeRole);
}

export async function resolveSecurityRole(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleRef: string,
  businessUnit?: string,
): Promise<SecurityRoleRecord> {
  const resolvedMatches = await collectResolvedRoleMatches(env, client, roleRef, businessUnit);
  if (resolvedMatches.exactId.length === 1) {
    return resolvedMatches.exactId[0];
  }

  if (resolvedMatches.narrowedExact.length === 1) {
    return resolvedMatches.narrowedExact[0];
  }

  if (resolvedMatches.matches.length === 1) {
    return resolvedMatches.matches[0];
  }

  if (resolvedMatches.ambiguous.length > 1) {
    throw createAmbiguousSecurityRoleError(roleRef, env.name, resolvedMatches.ambiguous);
  }

  throw new Error(`Security role '${roleRef}' not found in '${env.name}'.`);
}

export async function resolveSecurityRoleForComparison(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleRef: string,
  businessUnit?: string,
): Promise<RoleResolutionResult> {
  const role = await resolveSecurityRole(env, client, roleRef, businessUnit);
  return { role, warnings: [] };
}

export async function fetchRolePrivileges(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleRef: string,
  businessUnit?: string,
): Promise<RolePrivilegeDetails> {
  const role = await resolveSecurityRole(env, client, roleRef, businessUnit);
  const privileges = await fetchPrivilegesForRoleIds(env, client, [role.roleid]);

  return {
    role,
    privileges: privileges.get(role.roleid) || [],
  };
}

export async function fetchRolePrivilegesForComparison(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleRef: string,
  businessUnit?: string,
): Promise<RolePrivilegeDetails & { warnings: string[] }> {
  const { role, warnings } = await resolveSecurityRoleForComparison(
    env,
    client,
    roleRef,
    businessUnit,
  );
  const privileges = await fetchPrivilegesForRoleIds(env, client, [role.roleid]);

  return {
    role,
    privileges: privileges.get(role.roleid) || [],
    warnings,
  };
}

export async function fetchRolePrivilegeInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roles: SecurityRoleRecord[],
): Promise<RolePrivilegeInventory> {
  const privilegesByRoleId = await fetchPrivilegesForRoleIds(
    env,
    client,
    roles.map((role) => role.roleid),
  );

  return {
    roles,
    privilegesByRoleId,
  };
}

export async function resolveRoleBusinessUnitName(
  env: EnvironmentConfig,
  client: DynamicsClient,
  businessUnit?: string,
): Promise<string> {
  const resolvedBusinessUnit = await resolveRoleBusinessUnit(env, client, businessUnit);
  return resolvedBusinessUnit.name;
}

export async function resolveRoleBusinessUnit(
  env: EnvironmentConfig,
  client: DynamicsClient,
  businessUnit?: string,
): Promise<ResolvedRoleBusinessUnit> {
  const trimmedBusinessUnit = businessUnit?.trim();
  if (trimmedBusinessUnit) {
    const resolvedBusinessUnit = await resolveBusinessUnit(env, client, trimmedBusinessUnit);
    return {
      businessunitid: resolvedBusinessUnit.businessunitid,
      name: resolvedBusinessUnit.name,
    };
  }

  return {
    businessunitid: "",
    name: await fetchDefaultGlobalBusinessUnitName(env, client),
  };
}

async function fetchDefaultGlobalBusinessUnitName(
  env: EnvironmentConfig,
  client: DynamicsClient,
): Promise<string> {
  return fetchDefaultGlobalBusinessUnitNameMetadata(env, client);
}

async function collectResolvedRoleMatches(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleRef: string,
  businessUnit?: string,
): Promise<ResolvedRoleMatches> {
  const resolvedBusinessUnit = await resolveRoleBusinessUnit(env, client, businessUnit);
  const roles = await listSecurityRoles(env, client);
  const exactId = roles.filter((role) => role.roleid === roleRef);
  const exactName = roles.filter((role) => role.name === roleRef);
  const narrowedExact = resolvedBusinessUnit
    ? exactName.filter((role) => roleMatchesBusinessUnit(role, resolvedBusinessUnit))
    : exactName;
  const needle = roleRef.trim().toLowerCase();
  const matches = uniqueRoles(
    roles.filter(
      (role) =>
        role.name.toLowerCase().includes(needle) &&
        (!resolvedBusinessUnit || roleMatchesBusinessUnit(role, resolvedBusinessUnit)),
    ),
  );

  return {
    exactId,
    narrowedExact,
    matches,
    ambiguous: uniqueRoles([...matches, ...narrowedExact]),
  };
}

function roleMatchesBusinessUnit(
  role: SecurityRoleRecord,
  businessUnit: ResolvedRoleBusinessUnit,
): boolean {
  if (businessUnit.businessunitid) {
    return role.businessunitid === businessUnit.businessunitid;
  }

  return role.businessUnitName.toLowerCase() === businessUnit.name.toLowerCase();
}

export function normalizeRole(record: Record<string, unknown>): SecurityRoleRecord {
  return {
    ...record,
    roleid: String(record.roleid || ""),
    name: String(record.name || ""),
    businessunitid: String(record._businessunitid_value || ""),
    businessUnitName: String(
      record["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._businessunitid_value ||
        "",
    ),
    parentrootroleid: String(record._parentrootroleid_value || ""),
    roletemplateid: String(record._roletemplateid_value || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

async function fetchPrivilegesForRoleIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  roleIds: string[],
): Promise<Map<string, RolePrivilegeRecord[]>> {
  const uniqueRoleIds = [...new Set(roleIds.filter(Boolean))];
  if (uniqueRoleIds.length === 0) {
    return new Map();
  }

  const rawRolePrivileges =
    uniqueRoleIds.length === 1
      ? await client.query<Record<string, unknown>>(
          env,
          "roleprivilegescollection",
          listRolePrivilegesQuery(uniqueRoleIds[0]),
        )
      : await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
          env,
          client,
          "roleprivilegescollection",
          uniqueRoleIds,
          "roleid",
          (chunkRoleIds) => listRolePrivilegesForRolesQuery(chunkRoleIds),
        );

  const privilegeIds = [
    ...new Set(rawRolePrivileges.map((item) => String(item.privilegeid || "")).filter(Boolean)),
  ];
  const privilegeRecords =
    privilegeIds.length === 0
      ? []
      : await queryRecordsByIdsInChunks<Record<string, unknown>>(
          env,
          client,
          "privileges",
          privilegeIds,
          "privilegeid",
          (chunkPrivilegeIds) => listPrivilegesByIdsQuery(chunkPrivilegeIds),
        );
  const privilegeMap = new Map(
    privilegeRecords.map((record) => [String(record.privilegeid || ""), record]),
  );

  const grouped = new Map<string, RolePrivilegeRecord[]>();
  for (const rolePrivilege of rawRolePrivileges) {
    const roleId = String(rolePrivilege.roleid || "");
    const privilege = privilegeMap.get(String(rolePrivilege.privilegeid || ""));
    const normalized = normalizeRolePrivilege(rolePrivilege, privilege);
    grouped.set(roleId, [...(grouped.get(roleId) || []), normalized]);
  }

  for (const [roleId, privileges] of grouped) {
    grouped.set(
      roleId,
      privileges.sort(
        (left, right) =>
          left.privilegeName.localeCompare(right.privilegeName) ||
          left.depthDisplay.localeCompare(right.depthDisplay),
      ),
    );
  }

  return grouped;
}

function normalizeRolePrivilege(
  rolePrivilege: Record<string, unknown>,
  privilege?: Record<string, unknown>,
): RolePrivilegeRecord {
  const depthMask = Number(rolePrivilege.privilegedepthmask || 0);
  const depthLabels = DEPTH_MASK_LABELS.filter((item) => (depthMask & item.mask) === item.mask).map(
    (item) => item.label,
  );
  const accessRight = Number(privilege?.accessright || 0);

  return {
    ...rolePrivilege,
    ...privilege,
    roleprivilegeid: String(rolePrivilege.roleprivilegeid || ""),
    roleid: String(rolePrivilege.roleid || ""),
    privilegeid: String(rolePrivilege.privilegeid || ""),
    privilegeName: String(privilege?.name || rolePrivilege.privilegeid || ""),
    accessright: accessRight,
    accessRightLabel: ACCESS_RIGHT_LABELS[accessRight] || String(accessRight || ""),
    privilegedepthmask: depthMask,
    depthLabels,
    depthDisplay: depthLabels.join(", ") || "None",
    recordfilterid: String(rolePrivilege._recordfilterid_value || ""),
    ismanaged: Boolean(rolePrivilege.ismanaged),
    canbebasic: Boolean(privilege?.canbebasic),
    canbelocal: Boolean(privilege?.canbelocal),
    canbedeep: Boolean(privilege?.canbedeep),
    canbeglobal: Boolean(privilege?.canbeglobal),
  };
}

function uniqueRoles(roles: SecurityRoleRecord[]): SecurityRoleRecord[] {
  const seen = new Set<string>();

  return roles.filter((role) => {
    if (seen.has(role.roleid)) {
      return false;
    }
    seen.add(role.roleid);
    return true;
  });
}

function createAmbiguousSecurityRoleError(
  roleRef: string,
  environmentName: string,
  matches: SecurityRoleRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Security role '${roleRef}' is ambiguous in '${environmentName}'. Choose a role and try again. Matches: ${matches.map((role) => `${role.name} [${role.businessUnitName}]`).join(", ")}.`,
    {
      parameter: "roleName",
      options: matches.map((role) => createSecurityRoleOption(role)),
    },
  );
}

function createSecurityRoleOption(role: SecurityRoleRecord): AmbiguousMatchOption {
  return {
    value: role.roleid,
    label: `${role.name} [${role.businessUnitName || "-"}] (${role.roleid})`,
  };
}
