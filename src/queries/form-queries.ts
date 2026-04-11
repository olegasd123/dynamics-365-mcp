import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";

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

function buildOrNumberFilter(field: string, values: number[]): string {
  return values.map((value) => `${field} eq ${value}`).join(" or ");
}

function buildOrStringFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

export function listFormsQuery(options?: {
  table?: string;
  type?: FormType;
  nameFilter?: string;
}): string {
  const filters: string[] = [];

  if (options?.table) {
    filters.push(odataEq("objecttypecode", options.table));
  }
  if (options?.type) {
    filters.push(`(${buildOrNumberFilter("type", [...FORM_TYPE[options.type]])})`);
  }
  if (options?.nameFilter) {
    filters.push(
      `(${odataContains("name", options.nameFilter)} or ${odataContains("uniquename", options.nameFilter)})`,
    );
  }

  return buildQueryString({
    select: FORM_SELECT,
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
    orderby: "objecttypecode asc,name asc",
  });
}

export function getFormDetailsByIdentityQuery(options: {
  formId?: string;
  table?: string;
  formName?: string;
  uniqueName?: string;
}): string {
  const filters: string[] = [];

  if (options.formId) {
    filters.push(odataEq("formid", options.formId));
  } else if (options.uniqueName) {
    filters.push(odataEq("uniquename", options.uniqueName));
  } else if (options.formName) {
    filters.push(odataEq("name", options.formName));
  }

  if (options.table) {
    filters.push(odataEq("objecttypecode", options.table));
  }

  return buildQueryString({
    select: FORM_DETAILS_SELECT,
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
  });
}

export function listFormsByIdsQuery(formIds: string[]): string {
  return buildQueryString({
    select: FORM_SELECT,
    filter: buildOrStringFilter("formid", formIds),
    orderby: "objecttypecode asc,name asc",
  });
}

export function listFormDetailsByIdsQuery(formIds: string[]): string {
  return buildQueryString({
    select: FORM_DETAILS_SELECT,
    filter: buildOrStringFilter("formid", formIds),
    orderby: "objecttypecode asc,name asc",
  });
}
