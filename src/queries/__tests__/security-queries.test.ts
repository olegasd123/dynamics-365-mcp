import { describe, expect, it } from "vitest";
import {
  listPrivilegesByIdsQuery,
  listRolePrivilegesForRolesQuery,
  listRolePrivilegesQuery,
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

  it("builds the privileges query", () => {
    const query = listPrivilegesByIdsQuery(["priv-1", "priv-2"]);

    expect(query).toContain("privilegeid eq 'priv-1' or privilegeid eq 'priv-2'");
    expect(query).toContain("canbeglobal");
  });
});
