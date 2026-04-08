import { buildQueryString, odataContains } from "../utils/odata-helpers.js";

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
  const filters = ["type eq 0"];

  if (nameFilter) {
    filters.push(odataContains("name", nameFilter));
  }

  return buildQueryString({
    select: DASHBOARD_SELECT,
    filter: filters.join(" and "),
    orderby: "name asc",
  });
}
