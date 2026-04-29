import { and, guidInList, rawFilter, query } from "../utils/odata-builder.js";

const ACCESS_USER_SELECT = [
  "systemuserid",
  "fullname",
  "domainname",
  "internalemailaddress",
  "_businessunitid_value",
  "isdisabled",
  "islicensed",
  "accessmode",
];

const ACCESS_TEAM_SELECT = ["teamid", "name", "teamtype", "isdefault", "_businessunitid_value"];

const AUDIT_ACTIVITY_SELECT = ["auditid", "_userid_value", "createdon"];

export function roleUsersPath(roleId: string): string {
  return `roles(${roleId})/systemuserroles_association`;
}

export function roleTeamsPath(roleId: string): string {
  return `roles(${roleId})/teamroles_association`;
}

export function teamUsersPath(teamId: string): string {
  return `teams(${teamId})/teammembership_association`;
}

export function appModuleRolesPath(appModuleId: string): string {
  return `appmodules(${appModuleId})/appmoduleroles_association`;
}

export function listAccessUsersQuery(): string {
  return query().select(ACCESS_USER_SELECT).orderby("fullname asc").toString();
}

export function listAccessTeamsQuery(): string {
  return query().select(ACCESS_TEAM_SELECT).orderby("name asc").toString();
}

export function listAuditActivityForUsersQuery(userIds: string[], createdAfter: string): string {
  return query()
    .select(AUDIT_ACTIVITY_SELECT)
    .filter(and(guidInList("_userid_value", userIds), rawFilter(`createdon ge ${createdAfter}`)))
    .orderby("createdon desc")
    .toString();
}
