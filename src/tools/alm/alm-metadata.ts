import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listDashboardsQuery } from "../../queries/dashboard-queries.js";
import { listFormsByIdsQuery } from "../../queries/form-queries.js";
import {
  listAppModulesQuery,
  listConnectionReferencesQuery,
  listEnvironmentVariableDefinitionsQuery,
  listEnvironmentVariableValuesForDefinitionsQuery,
} from "../../queries/alm-queries.js";
import {
  fetchSolutionComponentSets,
  fetchSolutionInventory,
} from "../solutions/solution-inventory.js";
import {
  getAppModuleStateLabel,
  getConnectionReferenceStateLabel,
  getConnectionStatus,
  getConnectorName,
  getDashboardTypeLabel,
  getEnvironmentVariableTypeLabel,
  normalizeAppModule,
  normalizeConnectionReference,
  normalizeDashboard,
  normalizeEnvironmentVariableDefinition,
  normalizeEnvironmentVariableValue,
  type AppModuleRecord,
  type ConnectionReferenceRecord,
  type DashboardRecord,
  type EnvironmentVariableDefinitionRecord,
  type EnvironmentVariableValueRecord,
} from "./alm-shared.js";
import {
  queryRecordsByFieldValuesInChunks,
  queryRecordsByIdsInChunks,
} from "../../utils/query-batching.js";

export interface EnvironmentVariableRecord extends EnvironmentVariableDefinitionRecord {
  typeLabel: string;
  currentValue: string;
  currentValueRecordId: string | null;
  currentValueModifiedOn: string | null;
  hasCurrentValue: boolean;
  effectiveValue: string;
  values: EnvironmentVariableValueRecord[];
}

export interface ConnectionReferenceSummaryRecord extends ConnectionReferenceRecord {
  connectorName: string;
  stateLabel: string;
  connectionStatus: string;
  hasConnection: boolean;
}

export interface AppModuleSummaryRecord extends AppModuleRecord {
  stateLabel: string;
}

export interface DashboardSummaryRecord extends DashboardRecord {
  typeLabel: string;
}

export async function listEnvironmentVariables(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<EnvironmentVariableRecord[]> {
  const definitions = options?.solution
    ? (await fetchSolutionInventory(env, client, options.solution)).environmentVariableDefinitions
    : (
        await client.query<Record<string, unknown>>(
          env,
          "environmentvariabledefinitions",
          listEnvironmentVariableDefinitionsQuery(options?.nameFilter),
        )
      ).map(normalizeEnvironmentVariableDefinition);

  const filteredDefinitions = options?.solution
    ? filterEnvironmentVariableDefinitions(definitions, options?.nameFilter)
    : definitions;

  if (filteredDefinitions.length === 0) {
    return [];
  }

  const values = (
    await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
      env,
      client,
      "environmentvariablevalues",
      filteredDefinitions.map((definition) => definition.environmentvariabledefinitionid),
      "_environmentvariabledefinitionid_value",
      listEnvironmentVariableValuesForDefinitionsQuery,
    )
  ).map(normalizeEnvironmentVariableValue);

  return mergeEnvironmentVariables(filteredDefinitions, values);
}

export async function fetchEnvironmentVariableDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  variableRef: string,
  solution?: string,
): Promise<EnvironmentVariableRecord> {
  const variables = await listEnvironmentVariables(env, client, { solution });
  return resolveByName(
    variables,
    variableRef,
    (item) => [item.schemaname, item.displayname],
    (item) => item.schemaname,
    "Environment variable",
    env.name,
  );
}

export async function listConnectionReferences(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<ConnectionReferenceSummaryRecord[]> {
  const records = options?.solution
    ? (await fetchSolutionInventory(env, client, options.solution)).connectionReferences
    : (
        await client.query<Record<string, unknown>>(
          env,
          "connectionreferences",
          listConnectionReferencesQuery(options?.nameFilter),
        )
      ).map(normalizeConnectionReference);

  const filteredRecords = options?.solution
    ? filterConnectionReferences(records, options?.nameFilter)
    : records;

  return filteredRecords.map(extendConnectionReference).sort(compareConnectionReferences);
}

export async function fetchConnectionReferenceDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  referenceRef: string,
  solution?: string,
): Promise<ConnectionReferenceSummaryRecord> {
  const references = await listConnectionReferences(env, client, { solution });
  return resolveByName(
    references,
    referenceRef,
    (item) => [item.displayname, item.connectionreferencelogicalname],
    (item) => item.connectionreferencelogicalname || item.displayname,
    "Connection reference",
    env.name,
  );
}

export async function listAppModules(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<AppModuleSummaryRecord[]> {
  const records = options?.solution
    ? (await fetchSolutionInventory(env, client, options.solution)).appModules
    : (
        await client.query<Record<string, unknown>>(
          env,
          "appmodules",
          listAppModulesQuery(options?.nameFilter),
        )
      ).map(normalizeAppModule);

  const filteredRecords = options?.solution
    ? filterAppModules(records, options?.nameFilter)
    : records;

  return filteredRecords.map(extendAppModule).sort(compareAppModules);
}

export async function fetchAppModuleDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  appRef: string,
  solution?: string,
): Promise<AppModuleSummaryRecord> {
  const apps = await listAppModules(env, client, { solution });
  return resolveByName(
    apps,
    appRef,
    (item) => [item.name, item.uniquename],
    (item) => item.uniquename || item.name,
    "App module",
    env.name,
  );
}

export async function listDashboards(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<DashboardSummaryRecord[]> {
  const records = options?.solution
    ? await fetchSolutionDashboards(env, client, options.solution)
    : (
        await client.query<Record<string, unknown>>(
          env,
          "systemforms",
          listDashboardsQuery(options?.nameFilter),
        )
      ).map(normalizeDashboard);

  const filteredRecords = options?.solution
    ? filterDashboards(records, options?.nameFilter)
    : records;

  return filteredRecords.map(extendDashboard).sort(compareDashboards);
}

export async function fetchDashboardDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  dashboardName: string,
  solution?: string,
): Promise<DashboardSummaryRecord> {
  const dashboards = await listDashboards(env, client, { solution });
  return resolveByName(
    dashboards,
    dashboardName,
    (item) => [item.name],
    (item) => item.name,
    "Dashboard",
    env.name,
  );
}

function mergeEnvironmentVariables(
  definitions: EnvironmentVariableDefinitionRecord[],
  values: EnvironmentVariableValueRecord[],
): EnvironmentVariableRecord[] {
  const valuesByDefinitionId = new Map<string, EnvironmentVariableValueRecord[]>();

  for (const value of values) {
    const group = valuesByDefinitionId.get(value.environmentvariabledefinitionid) || [];
    group.push(value);
    valuesByDefinitionId.set(value.environmentvariabledefinitionid, group);
  }

  return definitions
    .map((definition) => {
      const definitionValues = (
        valuesByDefinitionId.get(definition.environmentvariabledefinitionid) || []
      )
        .slice()
        .sort((left, right) => right.modifiedon.localeCompare(left.modifiedon));
      const currentValue = definitionValues[0] || null;

      return {
        ...definition,
        typeLabel: getEnvironmentVariableTypeLabel(definition.type),
        currentValue: currentValue?.value || "",
        currentValueRecordId: currentValue?.environmentvariablevalueid || null,
        currentValueModifiedOn: currentValue?.modifiedon || null,
        hasCurrentValue: currentValue !== null,
        effectiveValue: currentValue?.value || definition.defaultvalue || "",
        values: definitionValues,
      };
    })
    .sort(compareEnvironmentVariables);
}

function extendConnectionReference(
  record: ConnectionReferenceRecord,
): ConnectionReferenceSummaryRecord {
  return {
    ...record,
    connectorName: getConnectorName(record.connectorid),
    stateLabel: getConnectionReferenceStateLabel(record.statecode),
    connectionStatus: getConnectionStatus(record),
    hasConnection: Boolean(record.connectionid),
  };
}

function extendAppModule(record: AppModuleRecord): AppModuleSummaryRecord {
  return {
    ...record,
    stateLabel: getAppModuleStateLabel(record.statecode),
  };
}

function extendDashboard(record: DashboardRecord): DashboardSummaryRecord {
  return {
    ...record,
    typeLabel: getDashboardTypeLabel(record.type),
  };
}

async function fetchSolutionDashboards(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<DashboardRecord[]> {
  const componentSets = await fetchSolutionComponentSets(env, client, solutionRef);
  const dashboardIds = [...componentSets.dashboardIds];

  if (dashboardIds.length === 0) {
    return [];
  }

  const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "systemforms",
    dashboardIds,
    "formid",
    listFormsByIdsQuery,
  );

  return records.filter((record) => Number(record.type || 0) === 0).map(normalizeDashboard);
}

function filterEnvironmentVariableDefinitions(
  definitions: EnvironmentVariableDefinitionRecord[],
  nameFilter?: string,
): EnvironmentVariableDefinitionRecord[] {
  if (!nameFilter) {
    return definitions;
  }

  const needle = nameFilter.toLowerCase();
  return definitions.filter(
    (definition) =>
      definition.schemaname.toLowerCase().includes(needle) ||
      definition.displayname.toLowerCase().includes(needle),
  );
}

function filterConnectionReferences(
  references: ConnectionReferenceRecord[],
  nameFilter?: string,
): ConnectionReferenceRecord[] {
  if (!nameFilter) {
    return references;
  }

  const needle = nameFilter.toLowerCase();
  return references.filter(
    (reference) =>
      reference.displayname.toLowerCase().includes(needle) ||
      reference.connectionreferencelogicalname.toLowerCase().includes(needle),
  );
}

function filterAppModules(apps: AppModuleRecord[], nameFilter?: string): AppModuleRecord[] {
  if (!nameFilter) {
    return apps;
  }

  const needle = nameFilter.toLowerCase();
  return apps.filter(
    (app) =>
      app.name.toLowerCase().includes(needle) || app.uniquename.toLowerCase().includes(needle),
  );
}

function filterDashboards(dashboards: DashboardRecord[], nameFilter?: string): DashboardRecord[] {
  if (!nameFilter) {
    return dashboards;
  }

  const needle = nameFilter.toLowerCase();
  return dashboards.filter((dashboard) => dashboard.name.toLowerCase().includes(needle));
}

function compareEnvironmentVariables(
  left: EnvironmentVariableRecord,
  right: EnvironmentVariableRecord,
): number {
  return left.schemaname.localeCompare(right.schemaname);
}

function compareConnectionReferences(
  left: ConnectionReferenceSummaryRecord,
  right: ConnectionReferenceSummaryRecord,
): number {
  return (
    (left.displayname || left.connectionreferencelogicalname).localeCompare(
      right.displayname || right.connectionreferencelogicalname,
    ) || left.connectionreferencelogicalname.localeCompare(right.connectionreferencelogicalname)
  );
}

function compareAppModules(left: AppModuleSummaryRecord, right: AppModuleSummaryRecord): number {
  return left.name.localeCompare(right.name) || left.uniquename.localeCompare(right.uniquename);
}

function compareDashboards(left: DashboardSummaryRecord, right: DashboardSummaryRecord): number {
  return (
    left.name.localeCompare(right.name) || left.objecttypecode.localeCompare(right.objecttypecode)
  );
}

function resolveByName<T>(
  items: T[],
  itemRef: string,
  candidateNames: (item: T) => string[],
  displayName: (item: T) => string,
  itemLabel: string,
  environmentName: string,
): T {
  const exactMatches = uniqueByDisplayName(
    items.filter((item) => candidateNames(item).some((name) => name === itemRef)),
    displayName,
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const needle = itemRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueByDisplayName(
    items.filter((item) => candidateNames(item).some((name) => name.toLowerCase() === needle)),
    displayName,
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueByDisplayName(
    items.filter((item) =>
      candidateNames(item).some((name) => name.toLowerCase().includes(needle)),
    ),
    displayName,
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueByDisplayName(
    [...exactMatches, ...caseInsensitiveMatches, ...partialMatches],
    displayName,
  );

  if (matches.length > 1) {
    throw new Error(
      `${itemLabel} '${itemRef}' is ambiguous in '${environmentName}'. Matches: ${matches
        .map((item) => displayName(item))
        .join(", ")}.`,
    );
  }

  throw new Error(`${itemLabel} '${itemRef}' not found in '${environmentName}'.`);
}

function uniqueByDisplayName<T>(items: T[], displayName: (item: T) => string): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = displayName(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
