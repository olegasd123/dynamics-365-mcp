import { describe, expect, it } from "vitest";
import {
  getFormDetailsByIdentityQuery,
  listFormDetailsByIdsQuery,
  listFormsByIdsQuery,
  listFormsQuery,
} from "../form-queries.js";

describe("form queries", () => {
  it("builds the forms query", () => {
    const query = listFormsQuery({ table: "account", type: "main", nameFilter: "Main" });

    expect(query).toContain("$filter=objecttypecode eq 'account'");
    expect(query).toContain("type eq 2 or type eq 12");
    expect(query).toContain("contains(name,'Main')");
    expect(query).toContain(
      "$select=formid,name,description,objecttypecode,type,uniquename,formactivationstate,isdefault,ismanaged,publishedon",
    );
    expect(query).not.toContain("modifiedon");
    expect(query).toContain("$orderby=objecttypecode asc,name asc");
  });

  it("builds the form details query", () => {
    const query = getFormDetailsByIdentityQuery({
      table: "account",
      uniqueName: "contoso_account_main",
    });

    expect(query).toContain(
      "$filter=uniquename eq 'contoso_account_main' and objecttypecode eq 'account'",
    );
    expect(query).toContain("formxml");
  });

  it("builds the form details query by form id", () => {
    const query = getFormDetailsByIdentityQuery({
      formId: "11111111-1111-1111-1111-111111111111",
      table: "account",
    });

    expect(query).toContain("$filter=formid eq 11111111-1111-1111-1111-111111111111");
    expect(query).not.toContain("objecttypecode eq 'account'");
  });

  it("builds the bulk form query", () => {
    const query = listFormsByIdsQuery([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);

    expect(query).toContain(
      "formid eq 11111111-1111-1111-1111-111111111111 or formid eq 22222222-2222-2222-2222-222222222222",
    );
  });

  it("builds the bulk form details query", () => {
    const query = listFormDetailsByIdsQuery([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);

    expect(query).toContain(
      "formid eq 11111111-1111-1111-1111-111111111111 or formid eq 22222222-2222-2222-2222-222222222222",
    );
    expect(query).toContain("formxml");
  });
});
