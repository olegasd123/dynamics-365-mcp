import { contains, eq, inList, isNull, query } from "../utils/odata-helpers.js";

const SECURITY_ROLE_SELECT = [
  "roleid",
  "name",
  "_businessunitid_value",
  "_parentrootroleid_value",
  "_roletemplateid_value",
  "ismanaged",
  "modifiedon",
];

const BUSINESS_UNIT_SELECT = [
  "businessunitid",
  "name",
  "_parentbusinessunitid_value",
  "_organizationid_value",
  "isdisabled",
  "createdon",
  "modifiedon",
];

const ROOT_BUSINESS_UNIT_SELECT = ["businessunitid", "name", "_parentbusinessunitid_value"];

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
  return query()
    .select(SECURITY_ROLE_SELECT)
    .filter(nameFilter ? contains("name", nameFilter) : undefined)
    .orderby("name asc")
    .toString();
}

export function listSecurityRolesByIdsQuery(roleIds: string[]): string {
  return query()
    .select(SECURITY_ROLE_SELECT)
    .filter(inList("roleid", roleIds))
    .orderby("name asc")
    .toString();
}

export function listRootBusinessUnitsQuery(): string {
  return query()
    .select(ROOT_BUSINESS_UNIT_SELECT)
    .filter(isNull("_parentbusinessunitid_value"))
    .orderby("name asc")
    .top(2)
    .toString();
}

export function listBusinessUnitsQuery(nameFilter?: string): string {
  return query()
    .select(BUSINESS_UNIT_SELECT)
    .filter(nameFilter ? contains("name", nameFilter) : undefined)
    .orderby("name asc")
    .toString();
}

export function listRolePrivilegesQuery(roleId: string): string {
  return query()
    .select(ROLE_PRIVILEGE_SELECT)
    .filter(eq("roleid", roleId))
    .orderby("privilegeid asc")
    .toString();
}

export function listRolePrivilegesForRolesQuery(roleIds: string[]): string {
  return query()
    .select(ROLE_PRIVILEGE_SELECT)
    .filter(inList("roleid", roleIds))
    .orderby("roleid asc")
    .toString();
}

export function listPrivilegesByIdsQuery(privilegeIds: string[]): string {
  return query()
    .select(PRIVILEGE_SELECT)
    .filter(inList("privilegeid", privilegeIds))
    .orderby("name asc")
    .toString();
}
