import { describe, expect, it } from "vitest";
import {
  getFormDetailsByIdentityQuery,
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
      formId: "form-1",
      table: "account",
    });

    expect(query).toContain("$filter=formid eq 'form-1' and objecttypecode eq 'account'");
  });

  it("builds the bulk form query", () => {
    const query = listFormsByIdsQuery(["id-1", "id-2"]);

    expect(query).toContain("formid eq 'id-1' or formid eq 'id-2'");
  });
});
