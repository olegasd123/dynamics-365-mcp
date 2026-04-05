import {
  buildQueryString,
  odataContains,
  odataEq,
} from "../utils/odata-helpers.js";

function buildOrFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

const SECURITY_ROLE_SELECT = [
  "roleid",
  "name",
  "_businessunitid_value",
  "_parentrootroleid_value",
  "_roletemplateid_value",
  "ismanaged",
  "modifiedon",
];

const ROLE_PRIVILEGE_SELECT = [
  "roleprivilegeid",
  "roleid",
  "privilegeid",
  "privilegedepthmask",
  "_recordfilterid_value",
  "ismanaged",
];

const PRIVILEGE_SELECT = [
  "privilegeid",
  "name",
  "accessright",
  "canbebasic",
  "canbelocal",
  "canbedeep",
  "canbeglobal",
];

export function listSecurityRolesQuery(nameFilter?: string): string {
  const filter = nameFilter ? odataContains("name", nameFilter) : undefined;

  return buildQueryString({
    select: SECURITY_ROLE_SELECT,
    filter,
    orderby: "name asc",
  });
}

export function listRolePrivilegesQuery(roleId: string): string {
  return buildQueryString({
    select: ROLE_PRIVILEGE_SELECT,
    filter: odataEq("roleid", roleId),
    orderby: "privilegeid asc",
  });
}

export function listRolePrivilegesForRolesQuery(roleIds: string[]): string {
  return buildQueryString({
    select: ROLE_PRIVILEGE_SELECT,
    filter: buildOrFilter("roleid", roleIds),
    orderby: "roleid asc",
  });
}

export function listPrivilegesByIdsQuery(privilegeIds: string[]): string {
  return buildQueryString({
    select: PRIVILEGE_SELECT,
    filter: buildOrFilter("privilegeid", privilegeIds),
    orderby: "name asc",
  });
}
