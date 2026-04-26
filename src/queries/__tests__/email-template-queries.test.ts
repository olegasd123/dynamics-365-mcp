import { describe, expect, it } from "vitest";
import {
  getEmailTemplateByIdentityQuery,
  listEmailTemplateDetailsByIdsQuery,
  listEmailTemplatesByIdsQuery,
  listEmailTemplatesQuery,
} from "../email-template-queries.js";

describe("email template queries", () => {
  it("builds the email template list query", () => {
    const query = listEmailTemplatesQuery({
      nameFilter: "Welcome",
      templateTypeCode: "contact",
      scope: "organization",
      languageCode: 1033,
    });

    expect(query).toContain("contains(title,'Welcome')");
    expect(query).toContain("templatetypecode eq 'contact'");
    expect(query).toContain("ispersonal eq false");
    expect(query).toContain("languagecode eq 1033");
    expect(query).toContain("templateid");
    expect(query).toContain("$orderby=templatetypecode asc,title asc");
  });

  it("builds identity queries", () => {
    const query = getEmailTemplateByIdentityQuery({
      templateName: "O'Hara Welcome",
      templateTypeCode: "contact",
    });

    expect(query).toContain("$filter=title eq 'O''Hara Welcome'");
    expect(query).toContain("templatetypecode eq 'contact'");
    expect(query).toContain("body");
    expect(query).toContain("safehtml");
    expect(query).toContain("subjectpresentationxml");
  });

  it("builds bulk email template queries", () => {
    const listQuery = listEmailTemplatesByIdsQuery(["template-1", "template-2"]);
    const detailsQuery = listEmailTemplateDetailsByIdsQuery(["template-1"]);

    expect(listQuery).toContain("templateid eq 'template-1' or templateid eq 'template-2'");
    expect(detailsQuery).toContain("templateid eq 'template-1'");
    expect(detailsQuery).toContain("presentationxml");
  });
});
