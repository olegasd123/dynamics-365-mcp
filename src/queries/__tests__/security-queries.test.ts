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
  it("builds the roles query", () => {
    const query = listSecurityRolesQuery("Admin");

    expect(query).toContain(
      "$select=roleid,name,_businessunitid_value,_parentrootroleid_value,_roletemplateid_value,ismanaged,modifiedon",
    );
    expect(query).toContain("$filter=contains(name,'Admin')");
  });

  it("builds role privilege queries", () => {
    expect(listRolePrivilegesQuery("role-1")).toContain("$filter=roleid eq 'role-1'");
    expect(listRolePrivilegesForRolesQuery(["role-1", "role-2"])).toContain(
      "roleid eq 'role-1' or roleid eq 'role-2'",
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
    const query = listPrivilegesByIdsQuery(["priv-1", "priv-2"]);

    expect(query).toContain("privilegeid eq 'priv-1' or privilegeid eq 'priv-2'");
    expect(query).toContain("canbeglobal");
  });

  it("builds field security profile and permission queries", () => {
    const profileQuery = listFieldSecurityProfilesQuery("Finance");
    const permissionQuery = listFieldPermissionsQuery(["profile-1"], {
      tableLogicalName: "account",
      columnLogicalName: "creditlimit",
    });

    expect(profileQuery).toContain("fieldsecurityprofileid,name,description,ismanaged");
    expect(profileQuery).toContain("$filter=contains(name,'Finance')");
    expect(profileQuery).toContain("systemuserprofiles_association");
    expect(profileQuery).toContain("teamprofiles_association");
    expect(permissionQuery).toContain("_fieldsecurityprofileid_value eq 'profile-1'");
    expect(permissionQuery).toContain("entityname eq 'account'");
    expect(permissionQuery).toContain("attributelogicalname eq 'creditlimit'");
  });
});
