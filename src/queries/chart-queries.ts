import { and, contains, eq, inList, query } from "../utils/odata-builder.js";

export const CHART_SCOPE = {
  system: "system",
  personal: "personal",
  all: "all",
} as const;

export type ChartScope = keyof typeof CHART_SCOPE;

const SYSTEM_CHART_SELECT = [
  "savedqueryvisualizationid",
  "name",
  "description",
  "primaryentitytypecode",
  "charttype",
  "type",
  "isdefault",
  "ismanaged",
  "modifiedon",
];

const PERSONAL_CHART_SELECT = [
  "userqueryvisualizationid",
  "name",
  "description",
  "primaryentitytypecode",
  "charttype",
  "type",
  "modifiedon",
];

const SYSTEM_CHART_DETAILS_SELECT = [
  ...SYSTEM_CHART_SELECT,
  "datadescription",
  "presentationdescription",
];

const PERSONAL_CHART_DETAILS_SELECT = [
  ...PERSONAL_CHART_SELECT,
  "datadescription",
  "presentationdescription",
];

function buildChartFilter(options?: { table?: string; nameFilter?: string }) {
  return and(
    options?.table ? eq("primaryentitytypecode", options.table) : undefined,
    options?.nameFilter ? contains("name", options.nameFilter) : undefined,
  );
}

export function listSystemChartsQuery(options?: { table?: string; nameFilter?: string }): string {
  return query()
    .select(SYSTEM_CHART_SELECT)
    .filter(buildChartFilter(options))
    .orderby("primaryentitytypecode asc,name asc")
    .toString();
}

export function listPersonalChartsQuery(options?: { table?: string; nameFilter?: string }): string {
  return query()
    .select(PERSONAL_CHART_SELECT)
    .filter(buildChartFilter(options))
    .orderby("primaryentitytypecode asc,name asc")
    .toString();
}

export function getSystemChartByIdentityQuery(options: {
  table?: string;
  chartName?: string;
}): string {
  return query()
    .select(SYSTEM_CHART_DETAILS_SELECT)
    .filter(
      and(
        options.chartName ? eq("name", options.chartName) : undefined,
        options.table ? eq("primaryentitytypecode", options.table) : undefined,
      ),
    )
    .toString();
}

export function getPersonalChartByIdentityQuery(options: {
  table?: string;
  chartName?: string;
}): string {
  return query()
    .select(PERSONAL_CHART_DETAILS_SELECT)
    .filter(
      and(
        options.chartName ? eq("name", options.chartName) : undefined,
        options.table ? eq("primaryentitytypecode", options.table) : undefined,
      ),
    )
    .toString();
}

export function listSystemChartsByIdsQuery(chartIds: string[]): string {
  return query()
    .select(SYSTEM_CHART_SELECT)
    .filter(inList("savedqueryvisualizationid", chartIds))
    .orderby("primaryentitytypecode asc,name asc")
    .toString();
}
