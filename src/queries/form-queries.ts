import { and, contains, eq, inList, or, query } from "../utils/odata-helpers.js";

export const FORM_TYPE = {
  main: [2, 12],
  quickCreate: [7],
  card: [11],
} as const;

export type FormType = keyof typeof FORM_TYPE;

const FORM_SELECT = [
  "formid",
  "name",
  "description",
  "objecttypecode",
  "type",
  "uniquename",
  "formactivationstate",
  "isdefault",
  "ismanaged",
  "publishedon",
];

const FORM_DETAILS_SELECT = [...FORM_SELECT, "formxml"];

export function listFormsQuery(options?: {
  table?: string;
  type?: FormType;
  nameFilter?: string;
}): string {
  return query()
    .select(FORM_SELECT)
    .filter(
      and(
        options?.table ? eq("objecttypecode", options.table) : undefined,
        options?.type ? inList("type", [...FORM_TYPE[options.type]]) : undefined,
        options?.nameFilter
          ? or(contains("name", options.nameFilter), contains("uniquename", options.nameFilter))
          : undefined,
      ),
    )
    .orderby("objecttypecode asc,name asc")
    .toString();
}

export function getFormDetailsByIdentityQuery(options: {
  formId?: string;
  table?: string;
  formName?: string;
  uniqueName?: string;
}): string {
  const filter = options.formId
    ? eq("formid", options.formId)
    : and(
        options.uniqueName
          ? eq("uniquename", options.uniqueName)
          : options.formName
            ? eq("name", options.formName)
            : undefined,
        options.table ? eq("objecttypecode", options.table) : undefined,
      );

  return query().select(FORM_DETAILS_SELECT).filter(filter).toString();
}

export function listFormsByIdsQuery(formIds: string[]): string {
  return query()
    .select(FORM_SELECT)
    .filter(inList("formid", formIds))
    .orderby("objecttypecode asc,name asc")
    .toString();
}

export function listFormDetailsByIdsQuery(formIds: string[]): string {
  return query()
    .select(FORM_DETAILS_SELECT)
    .filter(inList("formid", formIds))
    .orderby("objecttypecode asc,name asc")
    .toString();
}
