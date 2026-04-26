import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getPersonalChartByIdentityQuery,
  getSystemChartByIdentityQuery,
  listPersonalChartsQuery,
  listSystemChartsByIdsQuery,
  listSystemChartsQuery,
  type ChartScope,
} from "../../queries/chart-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { summarizeChartXml, type ChartXmlSummary } from "../../utils/xml-metadata.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

const SYSTEM_CHART_COMPONENT_TYPE = 59;

const CHART_TYPE_LABELS: Record<number, string> = {
  0: "ASP.NET Chart",
  1: "Power BI",
};

export interface ChartRecord extends Record<string, unknown> {
  chartid: string;
  name: string;
  description: string;
  primaryentitytypecode: string;
  charttype: number;
  chartTypeLabel: string;
  type: number;
  isdefault: boolean;
  ismanaged: boolean;
  modifiedon: string;
  scope: "system" | "personal";
}

export interface ChartDetails extends ChartRecord {
  datadescription: string;
  presentationdescription: string;
  summary: ChartXmlSummary;
  dataSummaryHash: string;
  presentationSummaryHash: string;
}

export async function listCharts(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    table?: string;
    scope?: ChartScope;
    nameFilter?: string;
    solution?: string;
  },
): Promise<ChartRecord[]> {
  const scope = options?.scope || "system";
  const systemPromise =
    scope === "personal"
      ? Promise.resolve<ChartRecord[]>([])
      : options?.solution
        ? fetchSolutionSystemCharts(env, client, options)
        : client
            .query<
              Record<string, unknown>
            >(env, "savedqueryvisualizations", listSystemChartsQuery(options))
            .then((records) => records.map((record) => normalizeChart(record, "system")));

  const personalPromise =
    scope === "system"
      ? Promise.resolve<ChartRecord[]>([])
      : client
          .query<
            Record<string, unknown>
          >(env, "userqueryvisualizations", listPersonalChartsQuery(options))
          .then((records) => records.map((record) => normalizeChart(record, "personal")));

  const [systemCharts, personalCharts] = await Promise.all([systemPromise, personalPromise]);
  return [...systemCharts, ...personalCharts].sort(compareCharts);
}

export async function resolveChart(
  env: EnvironmentConfig,
  client: DynamicsClient,
  chartRef: string,
  options?: {
    table?: string;
    scope?: ChartScope;
    solution?: string;
  },
): Promise<ChartRecord> {
  const charts = await listCharts(env, client, options);
  const exactMatches = uniqueCharts(
    charts.filter((chart) => chart.chartid === chartRef || chart.name === chartRef),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const needle = chartRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueCharts(
    charts.filter(
      (chart) => chart.name.toLowerCase() === needle || chart.chartid.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueCharts(
    charts.filter(
      (chart) =>
        chart.name.toLowerCase().includes(needle) || chart.chartid.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueCharts([...exactMatches, ...caseInsensitiveMatches, ...partialMatches]);
  if (matches.length > 1) {
    throw createAmbiguousChartError(chartRef, env.name, matches);
  }

  throw new Error(`Chart '${chartRef}' not found in '${env.name}'.`);
}

export async function fetchChartDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  chartRef: string,
  options?: {
    table?: string;
    scope?: ChartScope;
    solution?: string;
  },
): Promise<ChartDetails> {
  const chart = await resolveChart(env, client, chartRef, options);
  const records =
    chart.scope === "system"
      ? await client.query<Record<string, unknown>>(
          env,
          "savedqueryvisualizations",
          getSystemChartByIdentityQuery({
            table: chart.primaryentitytypecode,
            chartName: chart.name,
          }),
        )
      : await client.query<Record<string, unknown>>(
          env,
          "userqueryvisualizations",
          getPersonalChartByIdentityQuery({
            table: chart.primaryentitytypecode,
            chartName: chart.name,
          }),
        );

  const details = records.find((record) => getChartId(record) === chart.chartid);
  if (!details) {
    throw new Error(`Chart '${chart.name}' not found in '${env.name}'.`);
  }

  return normalizeChartDetails(details, chart.scope);
}

function normalizeChart(
  record: Record<string, unknown>,
  scope: "system" | "personal",
): ChartRecord {
  const charttype = Number(record.charttype || 0);

  return {
    ...record,
    chartid: getChartId(record),
    name: String(record.name || ""),
    description: String(record.description || ""),
    primaryentitytypecode: String(record.primaryentitytypecode || ""),
    charttype,
    chartTypeLabel: CHART_TYPE_LABELS[charttype] || String(charttype),
    type: Number(record.type || 0),
    isdefault: scope === "system" ? Boolean(record.isdefault) : false,
    ismanaged: scope === "system" ? Boolean(record.ismanaged) : false,
    modifiedon: String(record.modifiedon || ""),
    scope,
  };
}

function normalizeChartDetails(
  record: Record<string, unknown>,
  scope: "system" | "personal",
): ChartDetails {
  const base = normalizeChart(record, scope);
  const datadescription = String(record.datadescription || "");
  const presentationdescription = String(record.presentationdescription || "");
  const summary = summarizeChartXml(datadescription, presentationdescription);

  return {
    ...base,
    datadescription,
    presentationdescription,
    summary,
    dataSummaryHash: summary.dataHash,
    presentationSummaryHash: summary.presentationHash,
  };
}

async function fetchSolutionSystemChartIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<Set<string>> {
  const solution = await resolveSolution(env, client, solutionRef);
  const components = await client.query<Record<string, unknown>>(
    env,
    "solutioncomponents",
    listSolutionComponentsQuery(solution.solutionid),
  );

  return new Set(
    components
      .filter((component) => Number(component.componenttype || 0) === SYSTEM_CHART_COMPONENT_TYPE)
      .map((component) => String(component.objectid || ""))
      .filter(Boolean),
  );
}

async function fetchSolutionSystemCharts(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    table?: string;
    scope?: ChartScope;
    nameFilter?: string;
    solution?: string;
  },
): Promise<ChartRecord[]> {
  const chartIds = await fetchSolutionSystemChartIds(env, client, String(options?.solution || ""));
  const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "savedqueryvisualizations",
    [...chartIds],
    "savedqueryvisualizationid",
    listSystemChartsByIdsQuery,
  );

  return records
    .map((record) => normalizeChart(record, "system"))
    .filter((chart) => matchesChartFilter(chart, options));
}

function matchesChartFilter(
  chart: ChartRecord,
  options?: {
    table?: string;
    scope?: ChartScope;
    nameFilter?: string;
    solution?: string;
  },
): boolean {
  if (options?.table && chart.primaryentitytypecode !== options.table) {
    return false;
  }

  if (options?.nameFilter) {
    return chart.name.toLowerCase().includes(options.nameFilter.toLowerCase());
  }

  return true;
}

function getChartId(record: Record<string, unknown>): string {
  return String(record.savedqueryvisualizationid || record.userqueryvisualizationid || "");
}

function uniqueCharts(charts: ChartRecord[]): ChartRecord[] {
  const seen = new Set<string>();

  return charts.filter((chart) => {
    const key = `${chart.scope}:${chart.chartid}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function compareCharts(left: ChartRecord, right: ChartRecord): number {
  return (
    left.primaryentitytypecode.localeCompare(right.primaryentitytypecode) ||
    left.scope.localeCompare(right.scope) ||
    left.name.localeCompare(right.name)
  );
}

function formatChartMatch(chart: ChartRecord): string {
  return `${chart.primaryentitytypecode}/${chart.scope}/${chart.name}`;
}

function createAmbiguousChartError(
  chartRef: string,
  environmentName: string,
  matches: ChartRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Chart '${chartRef}' is ambiguous in '${environmentName}'. Choose a matching chart and try again. Matches: ${matches.map(formatChartMatch).join(", ")}.`,
    {
      parameter: "chartName",
      options: matches.map((chart) => createChartOption(chart)),
    },
  );
}

function createChartOption(chart: ChartRecord): AmbiguousMatchOption {
  return {
    value: chart.chartid,
    label: `${chart.primaryentitytypecode}/${chart.scope}/${chart.name} (${chart.chartid})`,
  };
}
