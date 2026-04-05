import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getPersonalViewByIdentityQuery,
  getSavedViewByIdentityQuery,
  listPersonalViewsQuery,
  listSavedViewsQuery,
  type ViewScope,
} from "../../queries/view-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { summarizeViewXml, type ViewXmlSummary } from "../../utils/xml-metadata.js";

const SAVED_VIEW_COMPONENT_TYPE = 26;

const QUERY_TYPE_LABELS: Record<number, string> = {
  0: "Public",
  1: "Advanced Find",
  2: "Associated",
  4: "Quick Find",
  64: "Lookup",
};

export interface ViewRecord extends Record<string, unknown> {
  viewid: string;
  name: string;
  description: string;
  returnedtypecode: string;
  querytype: number;
  queryTypeLabel: string;
  isdefault: boolean;
  isquickfindquery: boolean;
  ismanaged: boolean;
  statecode: number;
  modifiedon: string;
  scope: "system" | "personal";
  fetchxml: string;
  layoutxml: string;
}

export interface ViewDetails extends ViewRecord {
  summary: ViewXmlSummary;
  fetchSummaryHash: string;
  layoutSummaryHash: string;
}

export async function listViews(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    table?: string;
    scope?: ViewScope;
    nameFilter?: string;
    solution?: string;
  },
): Promise<ViewRecord[]> {
  const scope = options?.scope || "system";
  const systemPromise =
    scope === "personal"
      ? Promise.resolve<ViewRecord[]>([])
      : client
          .query<Record<string, unknown>>(env, "savedqueries", listSavedViewsQuery(options))
          .then((records) => records.map((record) => normalizeView(record, "system")));

  const personalPromise =
    scope === "system"
      ? Promise.resolve<ViewRecord[]>([])
      : client
          .query<Record<string, unknown>>(env, "userqueries", listPersonalViewsQuery(options))
          .then((records) => records.map((record) => normalizeView(record, "personal")));

  const [systemViewsResult, personalViews] = await Promise.all([systemPromise, personalPromise]);
  let systemViews = systemViewsResult;

  if (options?.solution) {
    const viewIds = await fetchSolutionSavedViewIds(env, client, options.solution);
    systemViews = systemViews.filter((view) => viewIds.has(view.viewid));
  }

  return [...systemViews, ...personalViews].sort(compareViews);
}

export async function resolveView(
  env: EnvironmentConfig,
  client: DynamicsClient,
  viewRef: string,
  options?: {
    table?: string;
    scope?: ViewScope;
    solution?: string;
  },
): Promise<ViewRecord> {
  const views = await listViews(env, client, options);
  const exactMatches = views.filter((view) => view.name === viewRef);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const needle = viewRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueViews(
    views.filter((view) => view.name.toLowerCase() === needle),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueViews(
    views.filter((view) => view.name.toLowerCase().includes(needle)),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueViews([...exactMatches, ...caseInsensitiveMatches, ...partialMatches]);
  if (matches.length > 1) {
    throw new Error(
      `View '${viewRef}' is ambiguous in '${env.name}'. Matches: ${matches.map(formatViewMatch).join(", ")}.`,
    );
  }

  throw new Error(`View '${viewRef}' not found in '${env.name}'.`);
}

export async function fetchViewDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  viewRef: string,
  options?: {
    table?: string;
    scope?: ViewScope;
    solution?: string;
  },
): Promise<ViewDetails> {
  const view = await resolveView(env, client, viewRef, options);
  const records =
    view.scope === "system"
      ? await client.query<Record<string, unknown>>(
          env,
          "savedqueries",
          getSavedViewByIdentityQuery({
            table: view.returnedtypecode,
            viewName: view.name,
          }),
        )
      : await client.query<Record<string, unknown>>(
          env,
          "userqueries",
          getPersonalViewByIdentityQuery({
            table: view.returnedtypecode,
            viewName: view.name,
          }),
        );

  const details = records.find((record) => getViewId(record) === view.viewid);
  if (!details) {
    throw new Error(`View '${view.name}' not found in '${env.name}'.`);
  }

  return normalizeViewDetails(details, view.scope);
}

function normalizeView(record: Record<string, unknown>, scope: "system" | "personal"): ViewRecord {
  const querytype = Number(record.querytype || 0);

  return {
    ...record,
    viewid: getViewId(record),
    name: String(record.name || ""),
    description: String(record.description || ""),
    returnedtypecode: String(record.returnedtypecode || ""),
    querytype,
    queryTypeLabel: QUERY_TYPE_LABELS[querytype] || String(querytype),
    isdefault: Boolean(record.isdefault),
    isquickfindquery: Boolean(record.isquickfindquery),
    ismanaged: scope === "system" ? Boolean(record.ismanaged) : false,
    statecode: Number(record.statecode || 0),
    modifiedon: String(record.modifiedon || ""),
    scope,
    fetchxml: String(record.fetchxml || ""),
    layoutxml: String(record.layoutxml || ""),
  };
}

function normalizeViewDetails(
  record: Record<string, unknown>,
  scope: "system" | "personal",
): ViewDetails {
  const base = normalizeView(record, scope);
  const summary = summarizeViewXml(base.fetchxml, base.layoutxml);

  return {
    ...base,
    summary,
    fetchSummaryHash: summary.fetchHash,
    layoutSummaryHash: summary.layoutHash,
  };
}

async function fetchSolutionSavedViewIds(
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
      .filter((component) => Number(component.componenttype || 0) === SAVED_VIEW_COMPONENT_TYPE)
      .map((component) => String(component.objectid || ""))
      .filter(Boolean),
  );
}

function getViewId(record: Record<string, unknown>): string {
  return String(record.savedqueryid || record.userqueryid || "");
}

function uniqueViews(views: ViewRecord[]): ViewRecord[] {
  const seen = new Set<string>();

  return views.filter((view) => {
    if (seen.has(view.viewid)) {
      return false;
    }
    seen.add(view.viewid);
    return true;
  });
}

function compareViews(left: ViewRecord, right: ViewRecord): number {
  return (
    left.returnedtypecode.localeCompare(right.returnedtypecode) ||
    left.scope.localeCompare(right.scope) ||
    left.name.localeCompare(right.name)
  );
}

function formatViewMatch(view: ViewRecord): string {
  return `${view.returnedtypecode}/${view.scope}/${view.name}`;
}
