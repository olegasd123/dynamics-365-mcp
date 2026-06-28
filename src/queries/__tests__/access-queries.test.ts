import { describe, expect, it } from "vitest";
import {
  appModuleRolesPath,
  listAccessTeamsQuery,
  listAccessUsersQuery,
  listAuditActivityForUsersQuery,
  roleTeamsPath,
  roleUsersPath,
  teamUsersPath,
} from "../access-queries.js";

describe("access queries", () => {
  const roleId = "11111111-1111-1111-1111-111111111111";
  const teamId = "22222222-2222-2222-2222-222222222222";
  const appModuleId = "33333333-3333-3333-3333-333333333333";
  const userId = "44444444-4444-4444-4444-444444444444";

  it("builds access navigation paths", () => {
    expect(roleUsersPath(roleId)).toBe(`roles(${roleId})/systemuserroles_association`);
    expect(roleTeamsPath(roleId)).toBe(`roles(${roleId})/teamroles_association`);
    expect(teamUsersPath(teamId)).toBe(`teams(${teamId})/teammembership_association`);
    expect(appModuleRolesPath(appModuleId)).toBe(
      `appmodules(${appModuleId})/appmoduleroles_association`,
    );
  });

  it("builds user, team, and audit queries", () => {
    expect(listAccessUsersQuery()).toContain("systemuserid,fullname,domainname");
    expect(listAccessTeamsQuery()).toContain("teamid,name,teamtype");

    const auditQuery = listAuditActivityForUsersQuery([userId], "2026-01-01T00:00:00.000Z");
    expect(auditQuery).toContain(`_userid_value eq ${userId}`);
    expect(auditQuery).toContain("createdon ge 2026-01-01T00:00:00.000Z");
  });
});
