import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listFormsByIdsQuery } from "../../queries/form-queries.js";
import { listPluginAssembliesByIdsQuery } from "../../queries/plugin-queries.js";
import { listSolutionsQuery, listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { listSavedViewsByIdsQuery } from "../../queries/view-queries.js";
import { listWebResourcesByIdsQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsByIdsQuery } from "../../queries/workflow-queries.js";
import {
  listAppModulesByIdsQuery,
  listConnectionReferencesByIdsQuery,
  listEnvironmentVariableDefinitionsByIdsQuery,
  listEnvironmentVariableValuesByIdsQuery,
} from "../../queries/alm-queries.js";
import { listSecurityRolesByIdsQuery } from "../../queries/security-queries.js";
import {
  fetchPluginInventory,
  type PluginImageRecord,
  type PluginStepRecord,
} from "../plugins/plugin-inventory.js";
import {
  listColumnsByMetadataIds,
  listTables,
  listTablesByMetadataIds,
  type TableColumnWithTableRecord,
  type TableRecord,
} from "../tables/table-metadata.js";
import { listSecurityRoles, type SecurityRoleRecord } from "../security/role-metadata.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";

export const SOLUTION_COMPONENT_TYPE = {
  table: 1,
  column: 2,
  securityRole: 20,
  form: 24,
  view: 26,
  workflow: 29,
  dashboard: 60,
  webResource: 61,
  appModule: 80,
  pluginAssembly: 91,
  pluginStep: 92,
  pluginImage: 93,
  connectionReference: 371,
  environmentVariableDefinition: 380,
  environmentVariableValue: 381,
} as const;

const COMPONENT_TYPE_LABELS: Record<number, string> = {
  1: "Table",
  2: "Column",
  20: "Security Role",
  24: "Form",
  26: "View",
  29: "Workflow",
  60: "Dashboard",
  61: "Web Resource",
  80: "App Module",
  91: "Plugin Assembly",
  92: "Plugin Step",
  93: "Plugin Image",
  371: "Connection Reference",
  380: "Environment Variable Definition",
  381: "Environment Variable Value",
};

const SUPPORTED_COMPONENT_TYPES = new Set<number>(Object.values(SOLUTION_COMPONENT_TYPE));

export interface SolutionRecord extends Record<string, unknown> {
  solutionid: string;
  friendlyname: string;
  uniquename: string;
  version?: string;
  ismanaged?: boolean;
  modifiedon?: string;
}

export interface SolutionComponentRecord extends Record<string, unknown> {
  solutioncomponentid: string;
  objectid: string;
  componenttype: number;
  rootsolutioncomponentid?: string;
  rootcomponentbehavior?: number;
}

export interface EnvironmentVariableDefinitionRecord extends Record<string, unknown> {
  environmentvariabledefinitionid: string;
  schemaname: string;
  displayname: string;
  type: number;
  defaultvalue: string;
  valueschema: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface EnvironmentVariableValueRecord extends Record<string, unknown> {
  environmentvariablevalueid: string;
  environmentvariabledefinitionid: string;
  value: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface ConnectionReferenceRecord extends Record<string, unknown> {
  connectionreferenceid: string;
  connectionreferencelogicalname: string;
  displayname: string;
  connectorid: string;
  connectionid: string;
  ismanaged: boolean;
  modifiedon: string;
  statecode: number;
}

export interface AppModuleRecord extends Record<string, unknown> {
  appmoduleid: string;
  name: string;
  uniquename: string;
  ismanaged: boolean;
  modifiedon: string;
  statecode: number;
}

export interface DashboardRecord extends Record<string, unknown> {
  formid: string;
  name: string;
  objecttypecode: string;
  type: number;
  ismanaged: boolean;
  modifiedon: string;
}

export interface SolutionComponentSets {
  solution: SolutionRecord;
  components: SolutionComponentRecord[];
  rootComponents: SolutionComponentRecord[];
  childComponents: SolutionComponentRecord[];
  tableIds: Set<string>;
  columnIds: Set<string>;
  pluginAssemblyIds: Set<string>;
  securityRoleIds: Set<string>;
  formIds: Set<string>;
  viewIds: Set<string>;
  workflowIds: Set<string>;
  dashboardIds: Set<string>;
  webResourceIds: Set<string>;
  appModuleIds: Set<string>;
  pluginStepIds: Set<string>;
  pluginImageIds: Set<string>;
  connectionReferenceIds: Set<string>;
  environmentVariableDefinitionIds: Set<string>;
  environmentVariableValueIds: Set<string>;
  unsupportedRootComponents: SolutionComponentRecord[];
  unsupportedChildComponents: SolutionComponentRecord[];
}

export interface SolutionInventory extends SolutionComponentSets {
  tables: TableRecord[];
  columns: TableColumnWithTableRecord[];
  pluginAssemblies: Record<string, unknown>[];
  securityRoles: SecurityRoleRecord[];
  forms: Record<string, unknown>[];
  views: Record<string, unknown>[];
  workflows: Record<string, unknown>[];
  dashboards: DashboardRecord[];
  webResources: Record<string, unknown>[];
  appModules: AppModuleRecord[];
  pluginSteps: PluginStepRecord[];
  pluginImages: PluginImageRecord[];
  connectionReferences: ConnectionReferenceRecord[];
  environmentVariableDefinitions: EnvironmentVariableDefinitionRecord[];
  environmentVariableValues: EnvironmentVariableValueRecord[];
}

export async function listSolutions(
  env: EnvironmentConfig,
  client: DynamicsClient,
  nameFilter?: string,
): Promise<SolutionRecord[]> {
  const solutions = await client.query<Record<string, unknown>>(
    env,
    "solutions",
    listSolutionsQuery(nameFilter),
  );

  return solutions.map(normalizeSolution);
}

export async function resolveSolution(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<SolutionRecord> {
  const allSolutions = await listSolutions(env, client);
  const exactUnique = allSolutions.filter((solution) => solution.uniquename === solutionRef);

  if (exactUnique.length === 1) {
    return exactUnique[0];
  }

  const exactFriendly = allSolutions.filter((solution) => solution.friendlyname === solutionRef);
  if (exactFriendly.length === 1) {
    return exactFriendly[0];
  }

  const needle = solutionRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueSolutions(
    allSolutions.filter(
      (solution) =>
        solution.uniquename.toLowerCase() === needle ||
        solution.friendlyname.toLowerCase() === needle,
    ),
  );

  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueSolutions(
    allSolutions.filter(
      (solution) =>
        solution.uniquename.toLowerCase().includes(needle) ||
        solution.friendlyname.toLowerCase().includes(needle),
    ),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const ambiguousMatches = [
    ...exactUnique,
    ...exactFriendly,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ];

  if (uniqueSolutions(ambiguousMatches).length > 1) {
    throw new Error(
      `Solution '${solutionRef}' is ambiguous in '${env.name}'. Matches: ${formatSolutionMatches(uniqueSolutions(ambiguousMatches))}.`,
    );
  }

  throw new Error(`Solution '${solutionRef}' not found in '${env.name}'.`);
}

export async function fetchSolutionComponentSets(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<SolutionComponentSets> {
  const solution = await resolveSolution(env, client, solutionRef);
  const rawComponents = await client.query<Record<string, unknown>>(
    env,
    "solutioncomponents",
    listSolutionComponentsQuery(solution.solutionid),
  );
  const components = rawComponents.map(normalizeSolutionComponent);
  const rootComponents = components.filter((component) => isRootComponent(component));
  const childComponents = components.filter((component) => !isRootComponent(component));

  return {
    solution,
    components,
    rootComponents,
    childComponents,
    tableIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.table),
    columnIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.column),
    pluginAssemblyIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.pluginAssembly),
    securityRoleIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.securityRole),
    formIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.form),
    viewIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.view),
    workflowIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.workflow),
    dashboardIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.dashboard),
    webResourceIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.webResource),
    appModuleIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.appModule),
    pluginStepIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.pluginStep),
    pluginImageIds: collectObjectIds(components, SOLUTION_COMPONENT_TYPE.pluginImage),
    connectionReferenceIds: collectObjectIds(
      components,
      SOLUTION_COMPONENT_TYPE.connectionReference,
    ),
    environmentVariableDefinitionIds: collectObjectIds(
      components,
      SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
    ),
    environmentVariableValueIds: collectObjectIds(
      components,
      SOLUTION_COMPONENT_TYPE.environmentVariableValue,
    ),
    unsupportedRootComponents: rootComponents.filter(
      (component) => !SUPPORTED_COMPONENT_TYPES.has(component.componenttype),
    ),
    unsupportedChildComponents: childComponents.filter(
      (component) => !SUPPORTED_COMPONENT_TYPES.has(component.componenttype),
    ),
  };
}

export async function fetchSolutionInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<SolutionInventory> {
  const componentSets = await fetchSolutionComponentSets(env, client, solutionRef);
  const tables = await listTablesByMetadataIds(env, client, [...componentSets.tableIds]);
  const fallbackTables =
    componentSets.columnIds.size > 0 && tables.length === 0
      ? await listTables(env, client)
      : tables;
  const columns = await listColumnsByMetadataIds(
    env,
    client,
    [...componentSets.columnIds],
    fallbackTables,
  );

  const [
    pluginAssemblies,
    securityRoles,
    forms,
    views,
    workflows,
    dashboards,
    webResources,
    appModules,
    connectionReferences,
    environmentVariableDefinitions,
    environmentVariableValues,
  ] = await Promise.all([
    fetchRecordsByIds(
      env,
      client,
      "pluginassemblies",
      "pluginassemblyid",
      [...componentSets.pluginAssemblyIds],
      listPluginAssembliesByIdsQuery,
    ),
    fetchSecurityRolesByIds(env, client, componentSets.securityRoleIds),
    fetchRecordsByIds(
      env,
      client,
      "systemforms",
      "formid",
      [...componentSets.formIds],
      listFormsByIdsQuery,
    ),
    fetchRecordsByIds(
      env,
      client,
      "savedqueries",
      "savedqueryid",
      [...componentSets.viewIds],
      listSavedViewsByIdsQuery,
    ),
    fetchRecordsByIds(
      env,
      client,
      "workflows",
      "workflowid",
      [...componentSets.workflowIds],
      listWorkflowsByIdsQuery,
    ),
    fetchRecordsByIds(
      env,
      client,
      "systemforms",
      "formid",
      [...componentSets.dashboardIds],
      listFormsByIdsQuery,
    ).then((records) =>
      records.filter((record) => Number(record.type || 0) === 0).map(normalizeDashboard),
    ),
    fetchRecordsByIds(
      env,
      client,
      "webresourceset",
      "webresourceid",
      [...componentSets.webResourceIds],
      listWebResourcesByIdsQuery,
    ),
    fetchRecordsByIds(
      env,
      client,
      "appmodules",
      "appmoduleid",
      [...componentSets.appModuleIds],
      listAppModulesByIdsQuery,
    ).then((records) => records.map(normalizeAppModule)),
    fetchRecordsByIds(
      env,
      client,
      "connectionreferences",
      "connectionreferenceid",
      [...componentSets.connectionReferenceIds],
      listConnectionReferencesByIdsQuery,
    ).then((records) => records.map(normalizeConnectionReference)),
    fetchRecordsByIds(
      env,
      client,
      "environmentvariabledefinitions",
      "environmentvariabledefinitionid",
      [...componentSets.environmentVariableDefinitionIds],
      listEnvironmentVariableDefinitionsByIdsQuery,
    ).then((records) => records.map(normalizeEnvironmentVariableDefinition)),
    fetchRecordsByIds(
      env,
      client,
      "environmentvariablevalues",
      "environmentvariablevalueid",
      [...componentSets.environmentVariableValueIds],
      listEnvironmentVariableValuesByIdsQuery,
    ).then((records) => records.map(normalizeEnvironmentVariableValue)),
  ]);

  const pluginInventory = await fetchPluginInventory(env, client, pluginAssemblies);
  const pluginSteps = pluginInventory.steps.filter((step) =>
    componentSets.pluginStepIds.has(step.sdkmessageprocessingstepid),
  );
  const pluginImages = pluginInventory.images.filter((image) =>
    componentSets.pluginImageIds.has(String(image.sdkmessageprocessingstepimageid || "")),
  );

  return {
    ...componentSets,
    tables,
    columns,
    pluginAssemblies,
    securityRoles,
    forms,
    views,
    workflows,
    dashboards,
    webResources,
    appModules,
    pluginSteps,
    pluginImages,
    connectionReferences,
    environmentVariableDefinitions,
    environmentVariableValues,
  };
}

export function getSolutionComponentTypeLabel(componentType: number): string {
  return COMPONENT_TYPE_LABELS[componentType] || `Component Type ${componentType}`;
}

function normalizeSolution(solution: Record<string, unknown>): SolutionRecord {
  return {
    ...solution,
    solutionid: String(solution.solutionid || ""),
    friendlyname: String(solution.friendlyname || ""),
    uniquename: String(solution.uniquename || ""),
    version: String(solution.version || ""),
    ismanaged: Boolean(solution.ismanaged),
    modifiedon: String(solution.modifiedon || ""),
  };
}

function normalizeSolutionComponent(component: Record<string, unknown>): SolutionComponentRecord {
  return {
    ...component,
    solutioncomponentid: String(component.solutioncomponentid || ""),
    objectid: String(component.objectid || ""),
    componenttype: Number(component.componenttype || 0),
    rootsolutioncomponentid: String(component.rootsolutioncomponentid || ""),
    rootcomponentbehavior:
      component.rootcomponentbehavior === undefined
        ? undefined
        : Number(component.rootcomponentbehavior),
  };
}

function normalizeEnvironmentVariableDefinition(
  record: Record<string, unknown>,
): EnvironmentVariableDefinitionRecord {
  return {
    ...record,
    environmentvariabledefinitionid: String(record.environmentvariabledefinitionid || ""),
    schemaname: String(record.schemaname || ""),
    displayname: String(record.displayname || ""),
    type: Number(record.type || 0),
    defaultvalue: String(record.defaultvalue || ""),
    valueschema: String(record.valueschema || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

function normalizeEnvironmentVariableValue(
  record: Record<string, unknown>,
): EnvironmentVariableValueRecord {
  return {
    ...record,
    environmentvariablevalueid: String(record.environmentvariablevalueid || ""),
    environmentvariabledefinitionid: String(record._environmentvariabledefinitionid_value || ""),
    value: String(record.value || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

function normalizeConnectionReference(record: Record<string, unknown>): ConnectionReferenceRecord {
  return {
    ...record,
    connectionreferenceid: String(record.connectionreferenceid || ""),
    connectionreferencelogicalname: String(record.connectionreferencelogicalname || ""),
    displayname: String(record.displayname || ""),
    connectorid: String(record.connectorid || ""),
    connectionid: String(record.connectionid || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
    statecode: Number(record.statecode || 0),
  };
}

function normalizeAppModule(record: Record<string, unknown>): AppModuleRecord {
  return {
    ...record,
    appmoduleid: String(record.appmoduleid || ""),
    name: String(record.name || ""),
    uniquename: String(record.uniquename || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
    statecode: Number(record.statecode || 0),
  };
}

function normalizeDashboard(record: Record<string, unknown>): DashboardRecord {
  return {
    ...record,
    formid: String(record.formid || ""),
    name: String(record.name || ""),
    objecttypecode: String(record.objecttypecode || ""),
    type: Number(record.type || 0),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

function isRootComponent(component: SolutionComponentRecord): boolean {
  return !component.rootsolutioncomponentid;
}

function collectObjectIds(
  components: SolutionComponentRecord[],
  componentType: number,
): Set<string> {
  return new Set(
    components
      .filter((component) => component.componenttype === componentType)
      .map((component) => component.objectid)
      .filter(Boolean),
  );
}

async function fetchRecordsByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  entitySet: string,
  idField: string,
  ids: string[],
  buildQuery: (chunkIds: string[]) => string,
): Promise<Record<string, unknown>[]> {
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    entitySet,
    ids,
    idField,
    buildQuery,
  );
}

async function fetchSecurityRolesByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ids: Set<string>,
): Promise<SecurityRoleRecord[]> {
  if (ids.size === 0) {
    return [];
  }

  const requestedIds = [...ids];
  const directMatches = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "roles",
    requestedIds,
    "roleid",
    listSecurityRolesByIdsQuery,
  );
  const filteredMatches = directMatches
    .filter((record) => ids.has(String(record.roleid || "")))
    .map(normalizeSecurityRole);

  if (filteredMatches.length > 0) {
    return filteredMatches;
  }

  const allRoles = await listSecurityRoles(env, client);
  return allRoles.filter((role) => ids.has(role.roleid));
}

function normalizeSecurityRole(record: Record<string, unknown>): SecurityRoleRecord {
  return {
    ...record,
    roleid: String(record.roleid || ""),
    name: String(record.name || ""),
    businessunitid: String(record._businessunitid_value || ""),
    businessUnitName: String(
      record["_businessunitid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._businessunitid_value ||
        "",
    ),
    parentrootroleid: String(record._parentrootroleid_value || ""),
    roletemplateid: String(record._roletemplateid_value || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

function uniqueSolutions(solutions: SolutionRecord[]): SolutionRecord[] {
  const seen = new Set<string>();

  return solutions.filter((solution) => {
    if (seen.has(solution.solutionid)) {
      return false;
    }
    seen.add(solution.solutionid);
    return true;
  });
}

function formatSolutionMatches(solutions: SolutionRecord[]): string {
  return solutions
    .map((solution) => `${solution.friendlyname} (${solution.uniquename})`)
    .join(", ");
}
