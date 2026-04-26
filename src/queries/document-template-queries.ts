import { and, contains, eq, inList, or, query } from "../utils/odata-builder.js";

export const DOCUMENT_TEMPLATE_TYPE = {
  excel: 1,
  word: 2,
} as const;

export type DocumentTemplateType = keyof typeof DOCUMENT_TEMPLATE_TYPE;

export const DOCUMENT_TEMPLATE_STATUS = {
  draft: true,
  activated: false,
} as const;

export type DocumentTemplateStatus = keyof typeof DOCUMENT_TEMPLATE_STATUS;

const DOCUMENT_TEMPLATE_SELECT = [
  "documenttemplateid",
  "name",
  "description",
  "associatedentitytypecode",
  "documenttype",
  "languagecode",
  "status",
  "createdon",
  "modifiedon",
  "_createdby_value",
  "_modifiedby_value",
];

const DOCUMENT_TEMPLATE_DETAILS_SELECT = [
  ...DOCUMENT_TEMPLATE_SELECT,
  "clientdata",
  "content",
  "versionnumber",
];

function buildDocumentTemplateFilter(options?: {
  nameFilter?: string;
  associatedEntityTypeCode?: string;
  documentType?: DocumentTemplateType;
  status?: DocumentTemplateStatus;
  languageCode?: number;
}) {
  return and(
    options?.nameFilter ? contains("name", options.nameFilter) : undefined,
    options?.associatedEntityTypeCode
      ? eq("associatedentitytypecode", options.associatedEntityTypeCode)
      : undefined,
    options?.documentType
      ? eq("documenttype", DOCUMENT_TEMPLATE_TYPE[options.documentType])
      : undefined,
    options?.status ? eq("status", DOCUMENT_TEMPLATE_STATUS[options.status]) : undefined,
    options?.languageCode !== undefined ? eq("languagecode", options.languageCode) : undefined,
  );
}

export function listDocumentTemplatesQuery(options?: {
  nameFilter?: string;
  associatedEntityTypeCode?: string;
  documentType?: DocumentTemplateType;
  status?: DocumentTemplateStatus;
  languageCode?: number;
}): string {
  return query()
    .select(DOCUMENT_TEMPLATE_SELECT)
    .filter(buildDocumentTemplateFilter(options))
    .orderby("associatedentitytypecode asc,name asc")
    .toString();
}

export function getDocumentTemplateByIdentityQuery(templateRef: string): string {
  return query()
    .select(DOCUMENT_TEMPLATE_DETAILS_SELECT)
    .filter(or(eq("name", templateRef), eq("documenttemplateid", templateRef)))
    .toString();
}

export function listDocumentTemplatesByIdsQuery(templateIds: string[]): string {
  return query()
    .select(DOCUMENT_TEMPLATE_SELECT)
    .filter(inList("documenttemplateid", templateIds))
    .orderby("associatedentitytypecode asc,name asc")
    .toString();
}

export function listDocumentTemplateDetailsByIdsQuery(templateIds: string[]): string {
  return query()
    .select(DOCUMENT_TEMPLATE_DETAILS_SELECT)
    .filter(inList("documenttemplateid", templateIds))
    .orderby("associatedentitytypecode asc,name asc")
    .toString();
}

export function listDocumentTemplatesWithContentQuery(options?: {
  nameFilter?: string;
  associatedEntityTypeCode?: string;
  documentType?: DocumentTemplateType;
  status?: DocumentTemplateStatus;
  languageCode?: number;
}): string {
  return query()
    .select(DOCUMENT_TEMPLATE_DETAILS_SELECT)
    .filter(buildDocumentTemplateFilter(options))
    .orderby("associatedentitytypecode asc,name asc")
    .toString();
}
