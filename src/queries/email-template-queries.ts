import { and, contains, eq, guidInList, query } from "../utils/odata-builder.js";

export const EMAIL_TEMPLATE_SCOPE = {
  personal: "personal",
  organization: "organization",
  all: "all",
} as const;

export type EmailTemplateScope = keyof typeof EMAIL_TEMPLATE_SCOPE;

const EMAIL_TEMPLATE_SELECT = [
  "templateid",
  "title",
  "description",
  "templatetypecode",
  "subject",
  "mimetype",
  "languagecode",
  "ispersonal",
  "ismanaged",
  "isrecommended",
  "usedcount",
  "createdon",
  "modifiedon",
  "_ownerid_value",
];

const EMAIL_TEMPLATE_DETAILS_SELECT = [
  ...EMAIL_TEMPLATE_SELECT,
  "body",
  "safehtml",
  "presentationxml",
  "subjectsafehtml",
  "subjectpresentationxml",
  "generationtypecode",
  "componentstate",
  "versionnumber",
];

function buildEmailTemplateFilter(options?: {
  nameFilter?: string;
  templateTypeCode?: string;
  scope?: EmailTemplateScope;
  languageCode?: number;
}) {
  return and(
    options?.nameFilter ? contains("title", options.nameFilter) : undefined,
    options?.templateTypeCode ? eq("templatetypecode", options.templateTypeCode) : undefined,
    options?.scope === "personal" ? eq("ispersonal", true) : undefined,
    options?.scope === "organization" ? eq("ispersonal", false) : undefined,
    options?.languageCode !== undefined ? eq("languagecode", options.languageCode) : undefined,
  );
}

export function listEmailTemplatesQuery(options?: {
  nameFilter?: string;
  templateTypeCode?: string;
  scope?: EmailTemplateScope;
  languageCode?: number;
}): string {
  return query()
    .select(EMAIL_TEMPLATE_SELECT)
    .filter(buildEmailTemplateFilter(options))
    .orderby("templatetypecode asc,title asc")
    .toString();
}

export function getEmailTemplateByIdentityQuery(options: {
  templateName?: string;
  templateTypeCode?: string;
}): string {
  return query()
    .select(EMAIL_TEMPLATE_DETAILS_SELECT)
    .filter(
      and(
        options.templateName ? eq("title", options.templateName) : undefined,
        options.templateTypeCode ? eq("templatetypecode", options.templateTypeCode) : undefined,
      ),
    )
    .toString();
}

export function listEmailTemplatesByIdsQuery(templateIds: string[]): string {
  return query()
    .select(EMAIL_TEMPLATE_SELECT)
    .filter(guidInList("templateid", templateIds))
    .orderby("templatetypecode asc,title asc")
    .toString();
}

export function listEmailTemplateDetailsByIdsQuery(templateIds: string[]): string {
  return query()
    .select(EMAIL_TEMPLATE_DETAILS_SELECT)
    .filter(guidInList("templateid", templateIds))
    .orderby("templatetypecode asc,title asc")
    .toString();
}
