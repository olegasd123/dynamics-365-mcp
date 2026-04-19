import { and, contains, eq, query } from "../utils/odata-builder.js";

const DASHBOARD_SELECT = [
  "formid",
  "name",
  "description",
  "objecttypecode",
  "type",
  "ismanaged",
  "publishedon",
  "modifiedon",
];

export function listDashboardsQuery(nameFilter?: string): string {
  return query()
    .select(DASHBOARD_SELECT)
    .filter(and(eq("type", 0), nameFilter ? contains("name", nameFilter) : undefined))
    .orderby("name asc")
    .toString();
}
