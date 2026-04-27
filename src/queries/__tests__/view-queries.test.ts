import { describe, expect, it } from "vitest";
import {
  getPersonalViewByIdentityQuery,
  getSavedViewByIdentityQuery,
  listPersonalViewsQuery,
  listSavedViewsByIdsQuery,
  listSavedViewsQuery,
} from "../view-queries.js";

describe("view queries", () => {
  const viewId1 = "11111111-1111-1111-1111-111111111111";
  const viewId2 = "22222222-2222-2222-2222-222222222222";

  it("builds the saved views query", () => {
    const query = listSavedViewsQuery({ table: "account", nameFilter: "Active" });

    expect(query).toContain("$filter=returnedtypecode eq 'account' and contains(name,'Active')");
    expect(query).toContain("$orderby=returnedtypecode asc,name asc");
  });

  it("builds the personal views query", () => {
    const query = listPersonalViewsQuery({ table: "account" });

    expect(query).toContain("$filter=returnedtypecode eq 'account'");
    expect(query).toContain("userqueryid");
  });

  it("builds identity queries", () => {
    expect(
      getSavedViewByIdentityQuery({ table: "account", viewName: "Active Accounts" }),
    ).toContain("$filter=name eq 'Active Accounts' and returnedtypecode eq 'account'");
    expect(
      getPersonalViewByIdentityQuery({ table: "account", viewName: "My O'Hara View" }),
    ).toContain("$filter=name eq 'My O''Hara View' and returnedtypecode eq 'account'");
  });

  it("builds the bulk saved views query", () => {
    const query = listSavedViewsByIdsQuery([viewId1, viewId2]);

    expect(query).toContain(`savedqueryid eq ${viewId1} or savedqueryid eq ${viewId2}`);
  });
});
