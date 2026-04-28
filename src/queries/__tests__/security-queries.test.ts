import { describe, expect, it } from "vitest";
import {
  listFieldPermissionsQuery,
  listFieldSecurityProfilesQuery,
  listBusinessUnitsQuery,
  listPrivilegesByIdsQuery,
  listRolePrivilegesForRolesQuery,
  listRolePrivilegesQuery,
  listRootBusinessUnitsQuery,
  listSecurityRolesQuery,
} from "../security-queries.js";

describe("security queries", () => {
  const roleId1 = "11111111-1111-1111-1111-111111111111";
  const roleId2 = "22222222-2222-2222-2222-222222222222";
  const privilegeId1 = "33333333-3333-3333-3333-333333333333";
  const privilegeId2 = "44444444-4444-4444-4444-444444444444";
  const profileId = "55555555-5555-5555-5555-555555555555";

  it("builds the roles query", () => {
    const query = listSecurityRolesQuery("Admin");

    expect(query).toContain(
      "$select=roleid,name,_businessunitid_value,_parentrootroleid_value,_roletemplateid_value,ismanaged,modifiedon",
    );
    expect(query).toContain("$filter=contains(name,'Admin')");
  });

  it("builds role privilege queries", () => {
    expect(listRolePrivilegesQuery(roleId1)).toContain(`$filter=roleid eq ${roleId1}`);
    expect(listRolePrivilegesForRolesQuery([roleId1, roleId2])).toContain(
      `roleid eq ${roleId1} or roleid eq ${roleId2}`,
    );
  });

  it("builds the root business unit query", () => {
    const query = listRootBusinessUnitsQuery();

    expect(query).toContain("$select=businessunitid,name,_parentbusinessunitid_value");
    expect(query).toContain("$filter=_parentbusinessunitid_value eq null");
    expect(query).toContain("$top=2");
  });

  it("builds the business units query", () => {
    const query = listBusinessUnitsQuery("Sales");

    expect(query).toContain(
      "$select=businessunitid,name,_parentbusinessunitid_value,_organizationid_value,isdisabled,createdon,modifiedon",
    );
    expect(query).toContain("$filter=contains(name,'Sales')");
  });

  it("builds the privileges query", () => {
    const query = listPrivilegesByIdsQuery([privilegeId1, privilegeId2]);

    expect(query).toContain(`privilegeid eq ${privilegeId1} or privilegeid eq ${privilegeId2}`);
    expect(query).toContain("canbeglobal");
  });

  it("builds field security profile and permission queries", () => {
    const profileQuery = listFieldSecurityProfilesQuery("Finance");
    const permissionQuery = listFieldPermissionsQuery([profileId], {
      tableLogicalName: "account",
      columnLogicalName: "creditlimit",
    });

    expect(profileQuery).toContain("fieldsecurityprofileid,name,description,ismanaged");
    expect(profileQuery).toContain("$filter=contains(name,'Finance')");
    expect(profileQuery).toContain("systemuserprofiles_association");
    expect(profileQuery).toContain("teamprofiles_association");
    expect(permissionQuery).toContain(`_fieldsecurityprofileid_value eq ${profileId}`);
    expect(permissionQuery).toContain("entityname eq 'account'");
    expect(permissionQuery).toContain("attributelogicalname eq 'creditlimit'");
  });
});
