import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listFieldPermissionsQuery,
  listFieldSecurityProfilesQuery,
} from "../../queries/security-queries.js";
import {
  listSolutionComponentsByObjectIdsQuery,
  listSolutionsByIdsQuery,
} from "../../queries/solution-queries.js";
import {
  queryRecordsByFieldValuesInChunks,
  queryRecordsByIdsInChunks,
} from "../../utils/query-batching.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { resolveTable } from "../tables/table-metadata.js";

export interface FieldSecurityMemberRecord {
  id: string;
  name: string;
  type: "user" | "team";
  domainName?: string;
}

export interface FieldPermissionRecord {
  fieldpermissionid: string;
  profileId: string;
  tableLogicalName: string;
  columnLogicalName: string;
  canRead: FieldPermissionGrant;
  canCreate: FieldPermissionGrant;
  canUpdate: FieldPermissionGrant;
  ismanaged: boolean;
  solutionid: string;
}

export interface FieldSecuritySolutionMembership {
  solutionid: string;
  friendlyname: string;
  uniquename: string;
}

export interface FieldSecurityProfileRecord {
  fieldsecurityprofileid: string;
  name: string;
  description: string;
  ismanaged: boolean;
  modifiedon: string;
  solutionid: string;
  permissions: FieldPermissionRecord[];
  memberCounts: {
    users: number;
    teams: number;
  };
  users: FieldSecurityMemberRecord[];
  teams: FieldSecurityMemberRecord[];
  solutionMemberships: FieldSecuritySolutionMembership[];
}

export interface ListFieldSecurityProfilesOptions {
  profileName?: string;
  table?: string;
  column?: string;
  solution?: string;
  includeMembers?: boolean;
}

export type FieldPermissionGrant = "AllowedAlways" | "NotAllowed";

interface SolutionComponentRecord {
  objectid: string;
  componenttype: number;
  solutionid: string;
}

const FIELD_SECURITY_PROFILE_COMPONENT_TYPE = 70;

export async function listFieldSecurityProfilesData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: ListFieldSecurityProfilesOptions = {},
): Promise<{
  filters: {
    profileName: string | null;
    table: string | null;
    column: string | null;
    solution: string | null;
  };
  items: FieldSecurityProfileRecord[];
}> {
  const table = options.table ? await resolveTable(env, client, options.table) : null;
  const columnLogicalName = normalizeLogicalName(options.column);
  const solution = options.solution ? await resolveSolution(env, client, options.solution) : null;
  const rawProfiles = await client.query<Record<string, unknown>>(
    env,
    "fieldsecurityprofiles",
    listFieldSecurityProfilesQuery(options.profileName),
  );
  let profiles = rawProfiles.map((profile) =>
    normalizeFieldSecurityProfile(profile, Boolean(options.includeMembers)),
  );

  if (profiles.length === 0) {
    return {
      filters: buildFilters(options, table?.logicalName || null, columnLogicalName),
      items: [],
    };
  }

  const profileIds = profiles.map((profile) => profile.fieldsecurityprofileid);
  const [components, permissions] = await Promise.all([
    fetchProfileSolutionComponents(env, client, profileIds),
    fetchProfilePermissions(env, client, profileIds, {
      tableLogicalName: table?.logicalName,
      columnLogicalName,
    }),
  ]);
  const membershipsByProfileId = await buildSolutionMembershipsByProfileId(env, client, components);
  const permissionsByProfileId = groupPermissionsByProfileId(permissions);

  profiles = profiles.map((profile) => ({
    ...profile,
    permissions: permissionsByProfileId.get(profile.fieldsecurityprofileid) || [],
    solutionMemberships: membershipsByProfileId.get(profile.fieldsecurityprofileid) || [],
  }));

  if (solution) {
    profiles = profiles.filter(
      (profile) =>
        profile.solutionMemberships.some(
          (membership) => membership.solutionid === solution.solutionid,
        ) || profile.solutionid === solution.solutionid,
    );
  }

  if (table || columnLogicalName) {
    profiles = profiles.filter((profile) => profile.permissions.length > 0);
  }

  return {
    filters: buildFilters(options, table?.logicalName || null, columnLogicalName),
    items: profiles.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function buildFilters(
  options: ListFieldSecurityProfilesOptions,
  tableLogicalName: string | null,
  columnLogicalName: string,
) {
  return {
    profileName: options.profileName || null,
    table: tableLogicalName,
    column: columnLogicalName || null,
    solution: options.solution || null,
  };
}

async function fetchProfilePermissions(
  env: EnvironmentConfig,
  client: DynamicsClient,
  profileIds: string[],
  options: {
    tableLogicalName?: string;
    columnLogicalName?: string;
  },
): Promise<FieldPermissionRecord[]> {
  const records = await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
    env,
    client,
    "fieldpermissions",
    profileIds,
    "_fieldsecurityprofileid_value",
    (chunkIds) => listFieldPermissionsQuery(chunkIds, options),
    { chunkSize: 20 },
  );

  return records.map(normalizeFieldPermission).filter((permission) => {
    if (options.tableLogicalName && permission.tableLogicalName !== options.tableLogicalName) {
      return false;
    }

    if (options.columnLogicalName && permission.columnLogicalName !== options.columnLogicalName) {
      return false;
    }

    return true;
  });
}

async function fetchProfileSolutionComponents(
  env: EnvironmentConfig,
  client: DynamicsClient,
  profileIds: string[],
): Promise<SolutionComponentRecord[]> {
  const records = await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
    env,
    client,
    "solutioncomponents",
    profileIds,
    "objectid",
    (chunkIds) =>
      listSolutionComponentsByObjectIdsQuery(FIELD_SECURITY_PROFILE_COMPONENT_TYPE, chunkIds),
  );

  return records
    .map(normalizeSolutionComponent)
    .filter((component) => component.componenttype === FIELD_SECURITY_PROFILE_COMPONENT_TYPE);
}

async function buildSolutionMembershipsByProfileId(
  env: EnvironmentConfig,
  client: DynamicsClient,
  components: SolutionComponentRecord[],
): Promise<Map<string, FieldSecuritySolutionMembership[]>> {
  const solutionIds = [
    ...new Set(components.map((component) => component.solutionid).filter(Boolean)),
  ];
  const solutions = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "solutions",
    solutionIds,
    "solutionid",
    listSolutionsByIdsQuery,
  );
  const solutionById = new Map(
    solutions.map((solutionRecord) => [
      String(solutionRecord.solutionid || ""),
      {
        solutionid: String(solutionRecord.solutionid || ""),
        friendlyname: String(solutionRecord.friendlyname || ""),
        uniquename: String(solutionRecord.uniquename || ""),
      },
    ]),
  );
  const membershipsByProfileId = new Map<string, FieldSecuritySolutionMembership[]>();

  for (const component of components) {
    const membership = solutionById.get(component.solutionid) || {
      solutionid: component.solutionid,
      friendlyname: component.solutionid,
      uniquename: component.solutionid,
    };
    const memberships = membershipsByProfileId.get(component.objectid) || [];
    memberships.push(membership);
    membershipsByProfileId.set(component.objectid, memberships);
  }

  return membershipsByProfileId;
}

function groupPermissionsByProfileId(
  permissions: FieldPermissionRecord[],
): Map<string, FieldPermissionRecord[]> {
  const grouped = new Map<string, FieldPermissionRecord[]>();

  for (const permission of permissions) {
    const items = grouped.get(permission.profileId) || [];
    items.push(permission);
    grouped.set(permission.profileId, items);
  }

  return grouped;
}

function normalizeFieldSecurityProfile(
  profile: Record<string, unknown>,
  includeMembers: boolean,
): FieldSecurityProfileRecord {
  const users = readExpandedMembers(profile.systemuserprofiles_association, "user", includeMembers);
  const teams = readExpandedMembers(profile.teamprofiles_association, "team", includeMembers);

  return {
    fieldsecurityprofileid: String(profile.fieldsecurityprofileid || ""),
    name: String(profile.name || ""),
    description: String(profile.description || ""),
    ismanaged: Boolean(profile.ismanaged),
    modifiedon: String(profile.modifiedon || ""),
    solutionid: String(profile.solutionid || ""),
    permissions: [],
    memberCounts: {
      users: users.count,
      teams: teams.count,
    },
    users: users.items,
    teams: teams.items,
    solutionMemberships: [],
  };
}

function readExpandedMembers(
  value: unknown,
  type: FieldSecurityMemberRecord["type"],
  includeMembers: boolean,
): { count: number; items: FieldSecurityMemberRecord[] } {
  const records = Array.isArray(value) ? value : [];
  const items = includeMembers
    ? records.map((record) => normalizeMember(record as Record<string, unknown>, type))
    : [];

  return {
    count: records.length,
    items,
  };
}

function normalizeMember(
  record: Record<string, unknown>,
  type: FieldSecurityMemberRecord["type"],
): FieldSecurityMemberRecord {
  return {
    id: String(record.systemuserid || record.teamid || record.ownerid || ""),
    name: String(record.fullname || record.name || ""),
    type,
    domainName: record.domainname ? String(record.domainname) : undefined,
  };
}

function normalizeFieldPermission(record: Record<string, unknown>): FieldPermissionRecord {
  return {
    fieldpermissionid: String(record.fieldpermissionid || ""),
    profileId: String(record._fieldsecurityprofileid_value || record.fieldsecurityprofileid || ""),
    tableLogicalName: String(record.entityname || ""),
    columnLogicalName: String(record.attributelogicalname || ""),
    canRead: normalizeGrant(record.canread),
    canCreate: normalizeGrant(record.cancreate),
    canUpdate: normalizeGrant(record.canupdate),
    ismanaged: Boolean(record.ismanaged),
    solutionid: String(record.solutionid || ""),
  };
}

function normalizeSolutionComponent(record: Record<string, unknown>): SolutionComponentRecord {
  return {
    objectid: String(record.objectid || ""),
    componenttype: Number(record.componenttype || 0),
    solutionid: String(record._solutionid_value || record.solutionid || ""),
  };
}

function normalizeGrant(value: unknown): FieldPermissionGrant {
  return Number(value || 0) === 4 ? "AllowedAlways" : "NotAllowed";
}

function normalizeLogicalName(value?: string): string {
  return value?.trim().toLowerCase() || "";
}
