import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listAppModuleSitemapComponentsQuery,
  listSitemapsByIdsQuery,
  listSitemapsQuery,
} from "../../queries/alm-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";
import { fetchAppModuleDetails, type AppModuleSummaryRecord } from "../alm/alm-metadata.js";
import { summarizeSitemapXml, type SitemapXmlSummary } from "./sitemap-parser.js";

export const SITEMAP_APP_COMPONENT_TYPE = 62;

export interface SitemapRecord extends Record<string, unknown> {
  sitemapid: string;
  sitemapidunique: string;
  sitemapname: string;
  sitemapnameunique: string;
  sitemapxml: string;
  sitemapxmlmanaged: string;
  isappaware: boolean;
  ismanaged: boolean;
  modifiedon: string;
  componentstate: number;
  showhome: boolean;
  showpinned: boolean;
  showrecents: boolean;
  enablecollapsiblegroups: boolean;
}

export interface AppModuleSitemapComponent extends Record<string, unknown> {
  appmodulecomponentid: string;
  appmoduleidunique: string;
  componenttype: number;
  objectid: string;
  isdefault: boolean;
  ismetadata: boolean;
  rootcomponentbehavior: number | null;
}

export interface SitemapSummaryRecord extends SitemapRecord {
  summary: SitemapXmlSummary;
}

export interface SitemapDetailsRecord extends SitemapSummaryRecord {
  appModule?: AppModuleSummaryRecord;
}

export async function listSitemaps(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
    appName?: string;
  },
): Promise<SitemapSummaryRecord[]> {
  const records = options?.appName
    ? await fetchAppSitemaps(env, client, options.appName, options.solution)
    : options?.solution
      ? await fetchSolutionSitemaps(env, client, options.solution)
      : (
          await client.query<Record<string, unknown>>(
            env,
            "sitemaps",
            listSitemapsQuery(options?.nameFilter),
          )
        ).map(normalizeSitemap);

  return filterSitemaps(records, options?.nameFilter).map(extendSitemap).sort(compareSitemaps);
}

export async function fetchSitemapDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: {
    sitemapName?: string;
    appName?: string;
    solution?: string;
  },
): Promise<SitemapDetailsRecord> {
  if (!options.sitemapName && !options.appName) {
    throw new Error("Set either sitemapName or appName.");
  }

  if (options.appName) {
    const app = await fetchAppModuleDetails(env, client, options.appName, options.solution);
    const sitemaps = await fetchAppSitemapsForResolvedApp(env, client, app);
    const sitemap = options.sitemapName
      ? resolveSitemapFromList(sitemaps, options.sitemapName, env.name)
      : resolveSingleAppSitemap(sitemaps, app, env.name);

    return {
      ...extendSitemap(sitemap),
      appModule: app,
    };
  }

  return extendSitemap(
    resolveSitemapFromList(
      await listSitemaps(env, client, { solution: options.solution }),
      options.sitemapName || "",
      env.name,
    ),
  );
}

export async function fetchAppSitemaps(
  env: EnvironmentConfig,
  client: DynamicsClient,
  appRef: string,
  solution?: string,
): Promise<SitemapRecord[]> {
  const app = await fetchAppModuleDetails(env, client, appRef, solution);
  return fetchAppSitemapsForResolvedApp(env, client, app);
}

function extendSitemap(record: SitemapRecord): SitemapSummaryRecord {
  return {
    ...record,
    summary: summarizeSitemapXml(record.sitemapxml || record.sitemapxmlmanaged),
  };
}

async function fetchAppSitemapsForResolvedApp(
  env: EnvironmentConfig,
  client: DynamicsClient,
  app: AppModuleSummaryRecord,
): Promise<SitemapRecord[]> {
  const components = (
    await client.query<Record<string, unknown>>(
      env,
      "appmodulecomponents",
      listAppModuleSitemapComponentsQuery(app.appmoduleidunique || app.appmoduleid),
    )
  ).map(normalizeAppModuleSitemapComponent);

  const sitemapIds = components.map((component) => component.objectid).filter(Boolean);
  if (sitemapIds.length === 0) {
    return [];
  }

  return fetchSitemapsByIds(env, client, sitemapIds);
}

async function fetchSolutionSitemaps(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<SitemapRecord[]> {
  const solution = await resolveSolution(env, client, solutionRef);
  const components = await client.query<Record<string, unknown>>(
    env,
    "solutioncomponents",
    listSolutionComponentsQuery(solution.solutionid),
  );
  const sitemapIds = components
    .filter((component) => Number(component.componenttype || 0) === SITEMAP_APP_COMPONENT_TYPE)
    .map((component) => String(component.objectid || ""))
    .filter(Boolean);

  return fetchSitemapsByIds(env, client, sitemapIds);
}

async function fetchSitemapsByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  sitemapIds: string[],
): Promise<SitemapRecord[]> {
  const uniqueIds = [...new Set(sitemapIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "sitemaps",
    uniqueIds,
    "sitemapid",
    listSitemapsByIdsQuery,
  );
  const wanted = new Set(uniqueIds.map((id) => id.toLowerCase()));
  const directMatches = records
    .map(normalizeSitemap)
    .filter(
      (sitemap) =>
        wanted.has(sitemap.sitemapid.toLowerCase()) ||
        wanted.has(sitemap.sitemapidunique.toLowerCase()),
    );

  if (directMatches.length === uniqueIds.length) {
    return directMatches;
  }

  const allSitemaps = (
    await client.query<Record<string, unknown>>(env, "sitemaps", listSitemapsQuery())
  ).map(normalizeSitemap);
  return allSitemaps.filter(
    (sitemap) =>
      wanted.has(sitemap.sitemapid.toLowerCase()) ||
      wanted.has(sitemap.sitemapidunique.toLowerCase()),
  );
}

function resolveSingleAppSitemap(
  sitemaps: SitemapRecord[],
  app: AppModuleSummaryRecord,
  environmentName: string,
): SitemapRecord {
  if (sitemaps.length === 1) {
    return sitemaps[0];
  }

  if (sitemaps.length > 1) {
    throw createAmbiguousSitemapError(app.name, environmentName, sitemaps, "sitemapName");
  }

  throw new Error(`No sitemap found for app module '${app.name}' in '${environmentName}'.`);
}

function resolveSitemapFromList(
  sitemaps: SitemapRecord[],
  sitemapRef: string,
  environmentName: string,
): SitemapRecord {
  const exactMatches = findExactSitemapMatches(sitemaps, sitemapRef);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throw createAmbiguousSitemapError(sitemapRef, environmentName, exactMatches, "sitemapName");
  }

  const partialMatches = findPartialSitemapMatches(sitemaps, sitemapRef);
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw createAmbiguousSitemapError(sitemapRef, environmentName, partialMatches, "sitemapName");
  }

  throw new Error(`Sitemap '${sitemapRef}' not found in '${environmentName}'.`);
}

function normalizeSitemap(record: Record<string, unknown>): SitemapRecord {
  return {
    ...record,
    sitemapid: String(record.sitemapid || ""),
    sitemapidunique: String(record.sitemapidunique || ""),
    sitemapname: String(record.sitemapname || ""),
    sitemapnameunique: String(record.sitemapnameunique || ""),
    sitemapxml: String(record.sitemapxml || ""),
    sitemapxmlmanaged: String(record.sitemapxmlmanaged || ""),
    isappaware: Boolean(record.isappaware),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
    componentstate: Number(record.componentstate || 0),
    showhome: Boolean(record.showhome),
    showpinned: Boolean(record.showpinned),
    showrecents: Boolean(record.showrecents),
    enablecollapsiblegroups: Boolean(record.enablecollapsiblegroups),
  };
}

function normalizeAppModuleSitemapComponent(
  record: Record<string, unknown>,
): AppModuleSitemapComponent {
  return {
    ...record,
    appmodulecomponentid: String(record.appmodulecomponentid || ""),
    appmoduleidunique: String(record._appmoduleidunique_value || ""),
    componenttype: Number(record.componenttype || 0),
    objectid: String(record.objectid || ""),
    isdefault: Boolean(record.isdefault),
    ismetadata: Boolean(record.ismetadata),
    rootcomponentbehavior:
      record.rootcomponentbehavior === undefined ? null : Number(record.rootcomponentbehavior),
  };
}

function filterSitemaps(records: SitemapRecord[], nameFilter?: string): SitemapRecord[] {
  if (!nameFilter) {
    return records;
  }

  const needle = nameFilter.trim().toLowerCase();
  return records.filter(
    (sitemap) =>
      sitemap.sitemapname.toLowerCase().includes(needle) ||
      sitemap.sitemapnameunique.toLowerCase().includes(needle),
  );
}

function findExactSitemapMatches(sitemaps: SitemapRecord[], sitemapRef: string): SitemapRecord[] {
  const needle = sitemapRef.trim().toLowerCase();

  return uniqueSitemaps(
    sitemaps.filter(
      (sitemap) =>
        sitemap.sitemapid.toLowerCase() === needle ||
        sitemap.sitemapidunique.toLowerCase() === needle ||
        sitemap.sitemapname.toLowerCase() === needle ||
        sitemap.sitemapnameunique.toLowerCase() === needle,
    ),
  );
}

function findPartialSitemapMatches(sitemaps: SitemapRecord[], sitemapRef: string): SitemapRecord[] {
  const needle = sitemapRef.trim().toLowerCase();

  return uniqueSitemaps(
    sitemaps.filter(
      (sitemap) =>
        sitemap.sitemapid.toLowerCase().includes(needle) ||
        sitemap.sitemapidunique.toLowerCase().includes(needle) ||
        sitemap.sitemapname.toLowerCase().includes(needle) ||
        sitemap.sitemapnameunique.toLowerCase().includes(needle),
    ),
  );
}

function uniqueSitemaps(sitemaps: SitemapRecord[]): SitemapRecord[] {
  const seen = new Set<string>();
  return sitemaps.filter((sitemap) => {
    const key = sitemap.sitemapid || sitemap.sitemapidunique || sitemap.sitemapnameunique;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createAmbiguousSitemapError(
  sitemapRef: string,
  environmentName: string,
  matches: SitemapRecord[],
  parameter: string,
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Multiple sitemaps matched '${sitemapRef}' in '${environmentName}'. Choose a matching sitemap.`,
    {
      parameter,
      options: matches.map(toSitemapOption),
    },
  );
}

function toSitemapOption(sitemap: SitemapRecord): AmbiguousMatchOption {
  return {
    value: sitemap.sitemapnameunique || sitemap.sitemapid,
    label: sitemap.sitemapnameunique
      ? `${sitemap.sitemapname} (${sitemap.sitemapnameunique})`
      : sitemap.sitemapname,
  };
}

function compareSitemaps(left: SitemapRecord, right: SitemapRecord): number {
  return (left.sitemapname || left.sitemapnameunique).localeCompare(
    right.sitemapname || right.sitemapnameunique,
  );
}
