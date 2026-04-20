import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listCustomApis, type CustomApiRecord } from "../custom-apis/custom-api-metadata.js";
import { listCloudFlows, type CloudFlowRecord } from "../flows/flow-metadata.js";
import { listForms, type FormRecord } from "../forms/form-metadata.js";
import {
  fetchPluginMetadata,
  type PluginMetadataInventory,
} from "../plugins/plugin-class-metadata.js";
import type { PluginClassRecord } from "../plugins/plugin-inventory.js";
import { listSolutions, type SolutionRecord } from "../solutions/solution-inventory.js";
import {
  listTables,
  searchColumnsByLogicalName,
  type TableColumnRecord,
  type TableRecord,
} from "../tables/table-metadata.js";
import { listViews, type ViewRecord } from "../views/view-metadata.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import { searchWebResourcesQuery } from "../../queries/web-resource-queries.js";
import { listSolutionComponentsByObjectIdsQuery } from "../../queries/solution-queries.js";
import { queryRecordsByFieldValuesInChunks } from "../../utils/query-batching.js";

export const METADATA_COMPONENT_TYPES = [
  "table",
  "column",
  "form",
  "view",
  "workflow",
  "action",
  "cloud_flow",
  "plugin_assembly",
  "plugin_class",
  "web_resource",
  "solution",
  "custom_api",
] as const;

export type MetadataComponentType = (typeof METADATA_COMPONENT_TYPES)[number];

export interface FindMetadataOptions {
  query: string;
  componentType?: MetadataComponentType;
  limit?: number;
}

export interface MetadataMatch {
  componentType: MetadataComponentType;
  displayName: string;
  uniqueName: string | null;
  solution: string | null;
  id: string | null;
  matchReason: string;
  suggestedNextTools: string[];
  parentName: string | null;
}

interface SearchField {
  label: string;
  value: string;
  priority: "primary" | "secondary";
}

interface CandidateMatch {
  componentType: MetadataComponentType;
  displayName: string;
  uniqueName: string | null;
  id: string | null;
  parentName: string | null;
  solutionObjectId: string | null;
  solutionComponentType: number | null;
  suggestedNextTools: string[];
  fields: SearchField[];
}

interface RankedCandidate {
  candidate: CandidateMatch;
  score: number;
  matchReason: string;
}

interface SolutionComponentRecord extends Record<string, unknown> {
  objectid: string;
  componenttype: number;
  solutionid: string;
}

type WorkflowDiscoveryType = "workflow" | "action" | "cloud_flow";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const WORKFLOW_CATEGORY_LABELS: Record<number, WorkflowDiscoveryType | null> = {
  0: "workflow",
  1: "workflow",
  2: "workflow",
  3: "action",
  4: "workflow",
  5: "cloud_flow",
};

const NEXT_TOOLS: Record<MetadataComponentType, string[]> = {
  table: ["get_table_schema", "list_table_columns", "find_table_usage"],
  column: ["find_column_usage", "analyze_impact", "analyze_update_triggers"],
  form: ["get_form_details", "list_forms"],
  view: ["get_view_details", "get_view_fetchxml", "list_views"],
  workflow: ["get_workflow_details", "list_workflows"],
  action: ["get_workflow_details", "list_actions"],
  cloud_flow: ["get_flow_details", "list_cloud_flows"],
  plugin_assembly: [
    "get_plugin_assembly_details",
    "list_plugin_assembly_steps",
    "list_plugin_assembly_images",
  ],
  plugin_class: ["get_plugin_details", "list_plugin_steps"],
  web_resource: ["get_web_resource_content", "find_web_resource_usage", "list_web_resources"],
  solution: [
    "get_solution_details",
    "get_solution_dependencies",
    "get_solution_layers",
    "list_solutions",
  ],
  custom_api: ["get_custom_api_details", "list_custom_apis"],
};

export async function findMetadata(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: FindMetadataOptions,
): Promise<MetadataMatch[]> {
  const query = options.query.trim();
  if (!query) {
    return [];
  }

  const limit = normalizeLimit(options.limit);
  const candidates = await loadCandidates(env, client, query, options.componentType);
  const ranked = candidates
    .map((candidate) => rankCandidate(candidate, query))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort(compareRankedCandidates)
    .slice(0, limit);

  if (ranked.length === 0) {
    return [];
  }

  const solutionsByKey = await loadSolutionsForMatches(env, client, ranked);

  return ranked.map(({ candidate, matchReason }) => ({
    componentType: candidate.componentType,
    displayName: candidate.displayName,
    uniqueName: candidate.uniqueName,
    solution: getSolutionName(candidate, solutionsByKey),
    id: candidate.id,
    matchReason,
    suggestedNextTools: candidate.suggestedNextTools,
    parentName: candidate.parentName,
  }));
}

async function loadCandidates(
  env: EnvironmentConfig,
  client: DynamicsClient,
  query: string,
  componentType?: MetadataComponentType,
): Promise<CandidateMatch[]> {
  const tablesNeeded =
    componentType === undefined || componentType === "table" || componentType === "column";
  const pluginNeeded =
    componentType === undefined ||
    componentType === "plugin_assembly" ||
    componentType === "plugin_class";
  const workflowsNeeded =
    componentType === undefined || componentType === "workflow" || componentType === "action";

  const tablesPromise = tablesNeeded ? listTables(env, client) : Promise.resolve<TableRecord[]>([]);
  const pluginPromise = pluginNeeded
    ? fetchPluginMetadata(env, client, { includeSteps: false, includeImages: false })
    : Promise.resolve<PluginMetadataInventory>({
        assemblies: [],
        types: [],
        pluginClasses: [],
        workflowActivities: [],
        steps: [],
        images: [],
      });
  const workflowsPromise = workflowsNeeded
    ? client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery())
    : Promise.resolve<Record<string, unknown>[]>([]);

  const [
    tables,
    pluginInventory,
    workflowRecords,
    forms,
    views,
    flows,
    webResources,
    solutions,
    customApis,
  ] = await Promise.all([
    tablesPromise,
    pluginPromise,
    workflowsPromise,
    shouldLoad("form", componentType) ? listForms(env, client) : Promise.resolve<FormRecord[]>([]),
    shouldLoad("view", componentType) ? listViews(env, client) : Promise.resolve<ViewRecord[]>([]),
    shouldLoad("cloud_flow", componentType)
      ? listCloudFlows(env, client)
      : Promise.resolve<CloudFlowRecord[]>([]),
    shouldLoad("web_resource", componentType)
      ? client.query<Record<string, unknown>>(env, "webresourceset", searchWebResourcesQuery(query))
      : Promise.resolve<Record<string, unknown>[]>([]),
    shouldLoad("solution", componentType)
      ? listSolutions(env, client)
      : Promise.resolve<SolutionRecord[]>([]),
    shouldLoad("custom_api", componentType)
      ? listCustomApis(env, client)
      : Promise.resolve<CustomApiRecord[]>([]),
  ]);

  const candidates: CandidateMatch[] = [];

  if (shouldLoad("table", componentType)) {
    candidates.push(...tables.map(toTableCandidate));
  }

  if (shouldLoad("column", componentType)) {
    const columnSearchTables = selectColumnSearchTables(tables, query, componentType);
    const columnGroups = await Promise.all(
      columnSearchTables.map(async (table) => ({
        table,
        columns: await searchColumnsByLogicalName(env, client, table.logicalName, query),
      })),
    );

    candidates.push(
      ...columnGroups.flatMap(({ table, columns }) =>
        columns.map((column) => toColumnCandidate(table, column)),
      ),
    );
  }

  if (shouldLoad("form", componentType)) {
    candidates.push(...forms.map(toFormCandidate));
  }

  if (shouldLoad("view", componentType)) {
    candidates.push(...views.map(toViewCandidate));
  }

  if (shouldLoad("workflow", componentType) || shouldLoad("action", componentType)) {
    for (const workflow of workflowRecords) {
      const category = Number(workflow.category || 0);
      const resolvedType = WORKFLOW_CATEGORY_LABELS[category];

      if (!resolvedType) {
        continue;
      }

      if (resolvedType === "cloud_flow") {
        continue;
      }

      if (!shouldLoad(resolvedType, componentType)) {
        continue;
      }

      candidates.push(toWorkflowCandidate(resolvedType, workflow));
    }
  }

  if (shouldLoad("cloud_flow", componentType)) {
    candidates.push(...flows.map(toCloudFlowCandidate));
  }

  if (shouldLoad("plugin_assembly", componentType)) {
    candidates.push(...pluginInventory.assemblies.map(toPluginAssemblyCandidate));
  }

  if (shouldLoad("plugin_class", componentType)) {
    candidates.push(...pluginInventory.pluginClasses.map(toPluginClassCandidate));
  }

  if (shouldLoad("web_resource", componentType)) {
    candidates.push(...webResources.map(toWebResourceCandidate));
  }

  if (shouldLoad("solution", componentType)) {
    candidates.push(...solutions.map(toSolutionCandidate));
  }

  if (shouldLoad("custom_api", componentType)) {
    candidates.push(...customApis.map(toCustomApiCandidate));
  }

  return candidates;
}

function shouldLoad(type: MetadataComponentType, filter?: MetadataComponentType): boolean {
  return filter === undefined || filter === type;
}

function toTableCandidate(table: TableRecord): CandidateMatch {
  return {
    componentType: "table",
    displayName: table.displayName || table.logicalName,
    uniqueName: table.logicalName || table.schemaName || null,
    id: table.metadataId || null,
    parentName: null,
    solutionObjectId: table.metadataId || null,
    solutionComponentType: 1,
    suggestedNextTools: NEXT_TOOLS.table,
    fields: [
      primaryField("display name", table.displayName),
      primaryField("logical name", table.logicalName),
      primaryField("schema name", table.schemaName),
      secondaryField("entity set name", table.entitySetName),
      secondaryField("description", table.description),
    ],
  };
}

function toColumnCandidate(table: TableRecord, column: TableColumnRecord): CandidateMatch {
  return {
    componentType: "column",
    displayName: column.displayName || `${table.logicalName}.${column.logicalName}`,
    uniqueName: `${table.logicalName}.${column.logicalName}`,
    id: column.metadataId || null,
    parentName: table.logicalName,
    solutionObjectId: column.metadataId || null,
    solutionComponentType: 2,
    suggestedNextTools: NEXT_TOOLS.column,
    fields: [
      primaryField("logical name", column.logicalName),
      primaryField("schema name", column.schemaName),
      primaryField("display name", column.displayName),
      primaryField("table and column name", `${table.logicalName}.${column.logicalName}`),
      secondaryField("table name", table.logicalName),
      secondaryField("table display name", table.displayName),
      secondaryField("description", column.description),
    ],
  };
}

function toFormCandidate(form: FormRecord): CandidateMatch {
  return {
    componentType: "form",
    displayName: form.name,
    uniqueName: form.uniquename || null,
    id: form.formid || null,
    parentName: form.objecttypecode || null,
    solutionObjectId: form.formid || null,
    solutionComponentType: 24,
    suggestedNextTools: NEXT_TOOLS.form,
    fields: [
      primaryField("form name", form.name),
      primaryField("unique name", form.uniquename),
      secondaryField("table name", form.objecttypecode),
      secondaryField("description", form.description),
    ],
  };
}

function toViewCandidate(view: ViewRecord): CandidateMatch {
  return {
    componentType: "view",
    displayName: view.name,
    uniqueName: null,
    id: view.viewid || null,
    parentName: view.returnedtypecode || null,
    solutionObjectId: view.scope === "system" ? view.viewid || null : null,
    solutionComponentType: view.scope === "system" ? 26 : null,
    suggestedNextTools: NEXT_TOOLS.view,
    fields: [
      primaryField("view name", view.name),
      secondaryField("table name", view.returnedtypecode),
      secondaryField("description", view.description),
    ],
  };
}

function toWorkflowCandidate(
  componentType: "workflow" | "action",
  workflow: Record<string, unknown>,
): CandidateMatch {
  return {
    componentType,
    displayName: String(workflow.name || ""),
    uniqueName: String(workflow.uniquename || "") || null,
    id: String(workflow.workflowid || "") || null,
    parentName: String(workflow.primaryentity || "") || null,
    solutionObjectId: String(workflow.workflowid || "") || null,
    solutionComponentType: 29,
    suggestedNextTools: NEXT_TOOLS[componentType],
    fields: [
      primaryField(componentType === "action" ? "action name" : "workflow name", workflow.name),
      primaryField("unique name", workflow.uniquename),
      secondaryField("primary table", workflow.primaryentity),
      secondaryField("description", workflow.description),
    ],
  };
}

function toCloudFlowCandidate(flow: CloudFlowRecord): CandidateMatch {
  return {
    componentType: "cloud_flow",
    displayName: flow.name,
    uniqueName: flow.uniquename || null,
    id: flow.workflowid || null,
    parentName: flow.primaryentity || null,
    solutionObjectId: flow.workflowid || null,
    solutionComponentType: 29,
    suggestedNextTools: NEXT_TOOLS.cloud_flow,
    fields: [
      primaryField("flow name", flow.name),
      primaryField("unique name", flow.uniquename),
      secondaryField("primary table", flow.primaryentity),
      secondaryField("description", flow.description),
    ],
  };
}

function toPluginAssemblyCandidate(assembly: Record<string, unknown>): CandidateMatch {
  const name = String(assembly.name || "");

  return {
    componentType: "plugin_assembly",
    displayName: name,
    uniqueName: name || null,
    id: String(assembly.pluginassemblyid || "") || null,
    parentName: null,
    solutionObjectId: String(assembly.pluginassemblyid || "") || null,
    solutionComponentType: 91,
    suggestedNextTools: NEXT_TOOLS.plugin_assembly,
    fields: [
      primaryField("assembly name", name),
      secondaryField("version", assembly.version),
      secondaryField("public key token", assembly.publickeytoken),
    ],
  };
}

function toPluginClassCandidate(pluginClass: PluginClassRecord): CandidateMatch {
  return {
    componentType: "plugin_class",
    displayName: pluginClass.fullName || pluginClass.name,
    uniqueName: pluginClass.fullName || pluginClass.name || null,
    id: pluginClass.pluginTypeId || null,
    parentName: pluginClass.assemblyName || null,
    solutionObjectId: null,
    solutionComponentType: null,
    suggestedNextTools: NEXT_TOOLS.plugin_class,
    fields: [
      primaryField("full name", pluginClass.fullName),
      primaryField("class name", pluginClass.name),
      secondaryField("friendly name", pluginClass.friendlyName),
      secondaryField("assembly name", pluginClass.assemblyName),
    ],
  };
}

function toWebResourceCandidate(resource: Record<string, unknown>): CandidateMatch {
  return {
    componentType: "web_resource",
    displayName: String(resource.displayname || resource.name || ""),
    uniqueName: String(resource.name || "") || null,
    id: String(resource.webresourceid || "") || null,
    parentName: null,
    solutionObjectId: String(resource.webresourceid || "") || null,
    solutionComponentType: 61,
    suggestedNextTools: NEXT_TOOLS.web_resource,
    fields: [
      primaryField("resource name", resource.name),
      primaryField("display name", resource.displayname),
      secondaryField("description", resource.description),
    ],
  };
}

function toSolutionCandidate(solution: SolutionRecord): CandidateMatch {
  return {
    componentType: "solution",
    displayName: solution.friendlyname,
    uniqueName: solution.uniquename || null,
    id: solution.solutionid || null,
    parentName: null,
    solutionObjectId: null,
    solutionComponentType: null,
    suggestedNextTools: NEXT_TOOLS.solution,
    fields: [
      primaryField("display name", solution.friendlyname),
      primaryField("unique name", solution.uniquename),
      secondaryField("version", solution.version),
    ],
  };
}

function toCustomApiCandidate(api: CustomApiRecord): CandidateMatch {
  return {
    componentType: "custom_api",
    displayName: api.name,
    uniqueName: api.uniquename || null,
    id: api.customapiid || null,
    parentName: api.boundentitylogicalname || null,
    solutionObjectId: null,
    solutionComponentType: null,
    suggestedNextTools: NEXT_TOOLS.custom_api,
    fields: [
      primaryField("API name", api.name),
      primaryField("unique name", api.uniquename),
      primaryField("display name", api.displayname),
      secondaryField("bound table", api.boundentitylogicalname),
      secondaryField("description", api.description),
    ],
  };
}

function primaryField(label: string, value: unknown): SearchField {
  return {
    label,
    value: String(value || ""),
    priority: "primary",
  };
}

function secondaryField(label: string, value: unknown): SearchField {
  return {
    label,
    value: String(value || ""),
    priority: "secondary",
  };
}

function rankCandidate(candidate: CandidateMatch, rawQuery: string): RankedCandidate | null {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return null;
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestReason = "";

  for (const field of candidate.fields) {
    const value = field.value.trim();
    if (!value) {
      continue;
    }

    const normalizedValue = value.toLowerCase();
    let score: number | null = null;
    let reasonPrefix = "";

    if (normalizedValue === query) {
      score = field.priority === "primary" ? 0 : 1;
      reasonPrefix = "Exact";
    } else if (normalizedValue.startsWith(query)) {
      score = field.priority === "primary" ? 2 : 3;
      reasonPrefix = "Starts with";
    } else if (normalizedValue.includes(query)) {
      score = field.priority === "primary" ? 4 : 5;
      reasonPrefix = "Partial";
    }

    if (score === null || score >= bestScore) {
      continue;
    }

    bestScore = score;
    bestReason = `${reasonPrefix} ${field.label} match`;
  }

  if (!Number.isFinite(bestScore)) {
    return null;
  }

  return {
    candidate,
    score: bestScore,
    matchReason: bestReason,
  };
}

function compareRankedCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return (
    left.score - right.score ||
    left.candidate.componentType.localeCompare(right.candidate.componentType) ||
    left.candidate.displayName.localeCompare(right.candidate.displayName) ||
    (left.candidate.uniqueName || "").localeCompare(right.candidate.uniqueName || "")
  );
}

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit))));
}

function selectColumnSearchTables(
  tables: TableRecord[],
  rawQuery: string,
  componentType?: MetadataComponentType,
): TableRecord[] {
  if (componentType === "column") {
    return tables;
  }

  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return [];
  }

  return tables.filter((table) => {
    const fields = [table.logicalName, table.schemaName, table.displayName, table.entitySetName]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return fields.some((value) => value.includes(query) || query.includes(value));
  });
}

async function loadSolutionsForMatches(
  env: EnvironmentConfig,
  client: DynamicsClient,
  matches: RankedCandidate[],
): Promise<Map<string, string[]>> {
  const scopedMatches = matches.filter(
    ({ candidate }) => candidate.solutionComponentType !== null && candidate.solutionObjectId,
  );

  if (scopedMatches.length === 0) {
    return new Map();
  }

  const groupedIds = new Map<number, string[]>();

  for (const { candidate } of scopedMatches) {
    const componentType = Number(candidate.solutionComponentType);
    const objectId = String(candidate.solutionObjectId || "");

    if (!objectId) {
      continue;
    }

    const group = groupedIds.get(componentType) || [];
    if (!group.includes(objectId)) {
      group.push(objectId);
    }
    groupedIds.set(componentType, group);
  }

  const [solutions, componentGroups] = await Promise.all([
    listSolutions(env, client),
    Promise.all(
      [...groupedIds.entries()].map(async ([componentType, objectIds]) => ({
        componentType,
        objectIds,
        components: await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
          env,
          client,
          "solutioncomponents",
          objectIds,
          "objectid",
          (chunkObjectIds) => listSolutionComponentsByObjectIdsQuery(componentType, chunkObjectIds),
        ),
      })),
    ),
  ]);

  const solutionsById = new Map(
    solutions.map((solution) => [
      solution.solutionid,
      solution.friendlyname || solution.uniquename,
    ]),
  );
  const solutionsByKey = new Map<string, string[]>();

  for (const group of componentGroups) {
    const scopedObjectIds = new Set(group.objectIds);
    const normalizedComponents = group.components
      .map(normalizeSolutionComponent)
      .filter(
        (component) =>
          component.componenttype === group.componentType &&
          scopedObjectIds.has(component.objectid),
      );

    for (const component of normalizedComponents) {
      const solutionName = solutionsById.get(component.solutionid);
      if (!solutionName) {
        continue;
      }

      const key = `${component.componenttype}:${component.objectid}`;
      const current = solutionsByKey.get(key) || [];
      if (!current.includes(solutionName)) {
        current.push(solutionName);
      }
      current.sort((left, right) => left.localeCompare(right));
      solutionsByKey.set(key, current);
    }
  }

  return solutionsByKey;
}

function normalizeSolutionComponent(record: Record<string, unknown>): SolutionComponentRecord {
  return {
    ...record,
    objectid: String(record.objectid || ""),
    componenttype: Number(record.componenttype || 0),
    solutionid: String(record._solutionid_value || ""),
  };
}

function getSolutionName(
  candidate: CandidateMatch,
  solutionsByKey: Map<string, string[]>,
): string | null {
  if (!candidate.solutionComponentType || !candidate.solutionObjectId) {
    return null;
  }

  const key = `${candidate.solutionComponentType}:${candidate.solutionObjectId}`;
  const solutions = solutionsByKey.get(key);
  if (!solutions || solutions.length === 0) {
    return null;
  }

  return solutions.join(", ");
}
