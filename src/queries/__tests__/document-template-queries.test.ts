import { describe, expect, it } from "vitest";
import {
  getDocumentTemplateByIdentityQuery,
  listDocumentTemplateDetailsByIdsQuery,
  listDocumentTemplatesByIdsQuery,
  listDocumentTemplatesQuery,
  listDocumentTemplatesWithContentQuery,
} from "../document-template-queries.js";

describe("document template queries", () => {
  it("builds the document template list query", () => {
    const query = listDocumentTemplatesQuery({
      nameFilter: "Quote",
      associatedEntityTypeCode: "account",
      documentType: "word",
      status: "activated",
      languageCode: 1033,
    });

    expect(query).toContain("contains(name,'Quote')");
    expect(query).toContain("associatedentitytypecode eq 'account'");
    expect(query).toContain("documenttype eq 2");
    expect(query).toContain("status eq false");
    expect(query).toContain("languagecode eq 1033");
    expect(query).toContain("documenttemplateid");
    expect(query).toContain("$orderby=associatedentitytypecode asc,name asc");
  });

  it("builds identity and bulk detail queries", () => {
    const identityQuery = getDocumentTemplateByIdentityQuery("Quote Template");
    const listQuery = listDocumentTemplatesByIdsQuery(["template-1", "template-2"]);
    const detailsQuery = listDocumentTemplateDetailsByIdsQuery(["template-1"]);

    expect(identityQuery).toContain("name eq 'Quote Template'");
    expect(identityQuery).toContain("documenttemplateid eq 'Quote Template'");
    expect(identityQuery).toContain("content");
    expect(listQuery).toContain("documenttemplateid eq 'template-1'");
    expect(listQuery).toContain("documenttemplateid eq 'template-2'");
    expect(detailsQuery).toContain("documenttemplateid eq 'template-1'");
    expect(detailsQuery).toContain("clientdata");
    expect(detailsQuery).toContain("content");
  });

  it("builds document template content comparison query", () => {
    const query = listDocumentTemplatesWithContentQuery({
      associatedEntityTypeCode: "account",
      documentType: "excel",
      status: "draft",
    });

    expect(query).toContain("associatedentitytypecode eq 'account'");
    expect(query).toContain("documenttype eq 1");
    expect(query).toContain("status eq true");
    expect(query).toContain("clientdata");
    expect(query).toContain("content");
  });
});
