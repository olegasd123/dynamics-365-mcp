import { and, contains, eq, guidInList, query } from "../utils/odata-builder.js";

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

function buildViewFilter(options?: { table?: string; nameFilter?: string }) {
  return and(
    options?.table ? eq("returnedtypecode", options.table) : undefined,
    options?.nameFilter ? contains("name", options.nameFilter) : undefined,
  );
}

export function listSavedViewsQuery(options?: { table?: string; nameFilter?: string }): string {
  return query()
    .select(VIEW_SELECT)
    .filter(buildViewFilter(options))
    .orderby("returnedtypecode asc,name asc")
    .toString();
}

export function listPersonalViewsQuery(options?: { table?: string; nameFilter?: string }): string {
  return query()
    .select(PERSONAL_VIEW_SELECT)
    .filter(buildViewFilter(options))
    .orderby("returnedtypecode asc,name asc")
    .toString();
}

export function getSavedViewByIdentityQuery(options: {
  table?: string;
  viewName?: string;
}): string {
  return query()
    .select(VIEW_DETAILS_SELECT)
    .filter(
      and(
        options.viewName ? eq("name", options.viewName) : undefined,
        options.table ? eq("returnedtypecode", options.table) : undefined,
      ),
    )
    .toString();
}

export function getPersonalViewByIdentityQuery(options: {
  table?: string;
  viewName?: string;
}): string {
  return query()
    .select(PERSONAL_VIEW_DETAILS_SELECT)
    .filter(
      and(
        options.viewName ? eq("name", options.viewName) : undefined,
        options.table ? eq("returnedtypecode", options.table) : undefined,
      ),
    )
    .toString();
}

export function listSavedViewsByIdsQuery(viewIds: string[]): string {
  return query()
    .select(VIEW_SELECT)
    .filter(guidInList("savedqueryid", viewIds))
    .orderby("returnedtypecode asc,name asc")
    .toString();
}
