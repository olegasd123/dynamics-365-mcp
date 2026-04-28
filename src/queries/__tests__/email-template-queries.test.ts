import { describe, expect, it } from "vitest";
import {
  getEmailTemplateByIdentityQuery,
  listEmailTemplateDetailsByIdsQuery,
  listEmailTemplatesByIdsQuery,
  listEmailTemplatesQuery,
} from "../email-template-queries.js";

describe("email template queries", () => {
  const templateId1 = "11111111-1111-1111-1111-111111111111";
  const templateId2 = "22222222-2222-2222-2222-222222222222";

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
    const listQuery = listEmailTemplatesByIdsQuery([templateId1, templateId2]);
    const detailsQuery = listEmailTemplateDetailsByIdsQuery([templateId1]);

    expect(listQuery).toContain(`templateid eq ${templateId1} or templateid eq ${templateId2}`);
    expect(detailsQuery).toContain(`templateid eq ${templateId1}`);
    expect(detailsQuery).toContain("presentationxml");
  });
});
