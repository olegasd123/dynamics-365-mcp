import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";

export const VIEW_SCOPE = {
  system: "system",
  personal: "personal",
  all: "all",
} as const;

export type ViewScope = keyof typeof VIEW_SCOPE;

const VIEW_SELECT = [
  "savedqueryid",
  "name",
  "description",
  "returnedtypecode",
  "querytype",
  "isdefault",
  "isquickfindquery",
  "ismanaged",
  "statecode",
  "modifiedon",
];

const PERSONAL_VIEW_SELECT = [
  "userqueryid",
  "name",
  "description",
  "returnedtypecode",
  "querytype",
  "isdefault",
  "isquickfindquery",
  "statecode",
  "modifiedon",
];

const VIEW_DETAILS_SELECT = [...VIEW_SELECT, "fetchxml", "layoutxml"];

const PERSONAL_VIEW_DETAILS_SELECT = [...PERSONAL_VIEW_SELECT, "fetchxml", "layoutxml"];

function buildOrStringFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

function buildViewFilter(options?: { table?: string; nameFilter?: string }): string | undefined {
  const filters: string[] = [];

  if (options?.table) {
    filters.push(odataEq("returnedtypecode", options.table));
  }
  if (options?.nameFilter) {
    filters.push(odataContains("name", options.nameFilter));
  }

  return filters.length > 0 ? filters.join(" and ") : undefined;
}

export function listSavedViewsQuery(options?: { table?: string; nameFilter?: string }): string {
  return buildQueryString({
    select: VIEW_SELECT,
    filter: buildViewFilter(options),
    orderby: "returnedtypecode asc,name asc",
  });
}

export function listPersonalViewsQuery(options?: { table?: string; nameFilter?: string }): string {
  return buildQueryString({
    select: PERSONAL_VIEW_SELECT,
    filter: buildViewFilter(options),
    orderby: "returnedtypecode asc,name asc",
  });
}

export function getSavedViewByIdentityQuery(options: {
  table?: string;
  viewName?: string;
}): string {
  const filters: string[] = [];

  if (options.viewName) {
    filters.push(odataEq("name", options.viewName));
  }
  if (options.table) {
    filters.push(odataEq("returnedtypecode", options.table));
  }

  return buildQueryString({
    select: VIEW_DETAILS_SELECT,
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
  });
}

export function getPersonalViewByIdentityQuery(options: {
  table?: string;
  viewName?: string;
}): string {
  const filters: string[] = [];

  if (options.viewName) {
    filters.push(odataEq("name", options.viewName));
  }
  if (options.table) {
    filters.push(odataEq("returnedtypecode", options.table));
  }

  return buildQueryString({
    select: PERSONAL_VIEW_DETAILS_SELECT,
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
  });
}

export function listSavedViewsByIdsQuery(viewIds: string[]): string {
  return buildQueryString({
    select: VIEW_SELECT,
    filter: buildOrStringFilter("savedqueryid", viewIds),
    orderby: "returnedtypecode asc,name asc",
  });
}
