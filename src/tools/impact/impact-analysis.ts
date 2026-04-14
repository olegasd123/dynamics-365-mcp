import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPluginAssembliesByIdsQuery,
  listPluginAssembliesQuery,
} from "../../queries/plugin-queries.js";
import {
  dependencySelectQuery,
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../../queries/dependency-queries.js";
import { listSolutionComponentsByObjectIdsQuery } from "../../queries/solution-queries.js";
import { listFormsByIdsQuery } from "../../queries/form-queries.js";
import { listSavedViewsByIdsQuery } from "../../queries/view-queries.js";
import {
  listWebResourcesByIdsQuery,
  listWebResourcesQuery,
} from "../../queries/web-resource-queries.js";
import { listWorkflowsByIdsQuery, listWorkflowsQuery } from "../../queries/workflow-queries.js";
import {
  listAppModulesByIdsQuery,
  listConnectionReferencesByIdsQuery,
  listEnvironmentVariableDefinitionsByIdsQuery,
  listEnvironmentVariableValuesByIdsQuery,
} from "../../queries/alm-queries.js";
import { listSecurityRolesByIdsQuery } from "../../queries/security-queries.js";
import {
  queryRecordsByFieldValuesInChunks,
  queryRecordsByIdsInChunks,
} from "../../utils/query-batching.js";
import {
  fetchPluginImagesByIds,
  fetchPluginInventory,
  fetchPluginStepsByIds,
} from "../plugins/plugin-inventory.js";
import { fetchFlowDetails } from "../flows/flow-metadata.js";
import {
  fetchTableColumns,
  listColumnsByMetadataIds,
  listTablesByMetadataIds,
  resolveTable,
} from "../tables/table-metadata.js";
import {
  findColumnUsageData,
  findTableUsageData,
  findWebResourceUsageData,
} from "../usage/usage-analysis.js";
import {
  fetchSolutionInventory,
  getSolutionComponentTypeLabel,
  SOLUTION_COMPONENT_TYPE,
  type SolutionComponentRecord,
  type SolutionInventory,
} from "../solutions/solution-inventory.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

export type ImpactComponentType =
  | "table"
  | "column"
  | "plugin"
  | "workflow"
  | "flow"
  | "web_resource"
  | "solution";

export interface AnalyzeImpactOptions {
  componentType: ImpactComponentType;
  name: string;
  table?: string;
  solution?: string;
  maxDependencies?: number;
}

export interface ImpactSummary {
  riskLevel: "low" | "medium" | "high" | "critical";
  totalReferences: number;
  dependencyCount: number;
  externalDependencyCount: number;
  likelyAffectedAreas: string[];
}

export interface ImpactDependencyRow {
  relation: "required" | "dependent";
  sourceName: string;
  sourceType: string;
  otherName: string;
  otherType: string;
  dependencyType: number;
  dependencyTypeLabel: string;
  inScope: boolean | null;
}

export interface ImpactAnalysisResult {
  componentType: ImpactComponentType;
  target: {
    name: string;
    displayName: string;
    objectId?: string;
    componentTypeLabel: string;
    parentName?: string;
    solution?: string | null;
  };
  warnings: string[];
  summary: ImpactSummary;
  sections: Record<string, unknown[]>;
  metadata?: Record<string, unknown>;
  dependencyRows: ImpactDependencyRow[];
  dependencyCountTotal: number;
}

interface ImpactComponentRef {
  objectId: string;
  componentType: number;
  displayName: string;
  name: string;
  parentDisplayName?: string;
}

interface ImpactSourceComponent extends ImpactComponentRef {
  solutioncomponentid: string;
}

interface RawImpactDependencyRecord {
  relation: "required" | "dependent";
  sourceComponent: ImpactSourceComponent;
  otherObjectId: string;
  otherComponentType: number;
  otherDisplayName: string;
  dependencyType: number;
  inScope: boolean | null;
}

type NamedSolutionComponent = ImpactSourceComponent;

const MAX_SOLUTION_IMPACT_COMPONENTS = 75;

const DEPENDENCY_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Internal",
  2: "Published",
  4: "Unpublished",
};

const WORKFLOW_CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};

const WORKFLOW_STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

export async function analyzeImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  switch (options.componentType) {
    case "table":
      return analyzeTableImpact(env, client, options);
    case "column":
      return analyzeColumnImpact(env, client, options);
    case "plugin":
      return analyzePluginImpact(env, client, options);
    case "workflow":
      return analyzeWorkflowImpact(env, client, options);
    case "flow":
      return analyzeFlowImpact(env, client, options);
    case "web_resource":
      return analyzeWebResourceImpact(env, client, options);
    case "solution":
      return analyzeSolutionImpact(env, client, options);
  }
}

async function analyzeTableImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const table = await resolveTable(env, client, options.name);
  const usage = await findTableUsageData(env, client, options.name);
  const dependencies = await fetchDependencyRowsForComponents(
    env,
    client,
    [
      {
        objectId: table.metadataId,
        componentType: SOLUTION_COMPONENT_TYPE.table,
        displayName: usage.tableDisplayName
          ? `${usage.tableDisplayName} (${usage.tableLogicalName})`
          : usage.tableLogicalName,
        name: usage.tableLogicalName,
      },
    ],
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    pluginSteps: usage.pluginSteps,
    workflows: usage.workflows,
    forms: usage.forms,
    views: usage.views,
    customApis: usage.customApis,
    cloudFlows: usage.cloudFlows,
    relationships: usage.relationships,
    dependencies: dependencies.rows,
  };

  return {
    componentType: "table",
    target: {
      name: usage.tableLogicalName,
      displayName: usage.tableDisplayName
        ? `${usage.tableDisplayName} (${usage.tableLogicalName})`
        : usage.tableLogicalName,
      objectId: table.metadataId,
      componentTypeLabel: "Table",
    },
    warnings: usage.warnings || [],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      displayName: usage.tableDisplayName,
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzeColumnImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const warnings: string[] = [];
  const target = await resolveColumnTarget(env, client, options.name, options.table, warnings);
  const usage = await findColumnUsageData(env, client, target.columnName, target.tableLogicalName);
  const dependencies = target.metadataId
    ? await fetchDependencyRowsForComponents(
        env,
        client,
        [
          {
            objectId: target.metadataId,
            componentType: SOLUTION_COMPONENT_TYPE.column,
            displayName: `${target.tableLogicalName}.${target.columnName}`,
            name: `${target.tableLogicalName}.${target.columnName}`,
            parentDisplayName: target.tableLogicalName,
          },
        ],
        options.maxDependencies,
      )
    : createEmptyDependencyResult();

  const sections: Record<string, unknown[]> = {
    pluginSteps: usage.pluginSteps,
    pluginImages: usage.pluginImages,
    workflows: usage.workflows,
    forms: usage.forms,
    views: usage.views,
    relationships: usage.relationships,
    cloudFlows: usage.cloudFlows,
    dependencies: dependencies.rows,
  };

  return {
    componentType: "column",
    target: {
      name: `${target.tableLogicalName}.${target.columnName}`,
      displayName: `${target.tableLogicalName}.${target.columnName}`,
      objectId: target.metadataId || undefined,
      componentTypeLabel: "Column",
      parentName: target.tableLogicalName,
    },
    warnings: [...warnings, ...(usage.warnings || [])],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      table: target.tableLogicalName,
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzePluginImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const assembly = await resolvePluginAssembly(env, client, options.name);
  const inventory = await fetchPluginInventory(env, client, [assembly]);
  const dependencies = await fetchDependencyRowsForComponents(
    env,
    client,
    [
      {
        objectId: String(assembly.pluginassemblyid || ""),
        componentType: SOLUTION_COMPONENT_TYPE.pluginAssembly,
        displayName: String(assembly.name || ""),
        name: String(assembly.name || ""),
      },
      ...inventory.steps.map((step) => ({
        objectId: step.sdkmessageprocessingstepid,
        componentType: SOLUTION_COMPONENT_TYPE.pluginStep,
        displayName: step.displayName,
        name: step.name,
        parentDisplayName: step.assemblyName,
      })),
      ...inventory.images.map((image) => ({
        objectId: image.sdkmessageprocessingstepimageid,
        componentType: SOLUTION_COMPONENT_TYPE.pluginImage,
        displayName: image.displayName,
        name: image.name,
        parentDisplayName: image.stepName,
      })),
    ],
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    pluginSteps: inventory.steps.map((step) => ({
      name: step.name,
      messageName: step.messageName,
      primaryEntity: step.primaryEntity,
      assemblyName: step.assemblyName,
    })),
    pluginImages: inventory.images.map((image) => ({
      name: image.name,
      stepName: image.stepName,
      assemblyName: image.assemblyName,
    })),
    dependencies: dependencies.rows,
  };

  return {
    componentType: "plugin",
    target: {
      name: String(assembly.name || ""),
      displayName: String(assembly.name || ""),
      objectId: String(assembly.pluginassemblyid || ""),
      componentTypeLabel: "Plugin Assembly",
    },
    warnings: [],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      version: String(assembly.version || ""),
      isolationMode: Number(assembly.isolationmode || 0) === 2 ? "Sandbox" : "None",
      stepCount: inventory.steps.length,
      imageCount: inventory.images.length,
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzeWorkflowImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const workflow = await resolveWorkflow(env, client, options.name);
  const dependencies = await fetchDependencyRowsForComponents(
    env,
    client,
    [
      {
        objectId: String(workflow.workflowid || ""),
        componentType: SOLUTION_COMPONENT_TYPE.workflow,
        displayName: String(workflow.name || workflow.uniquename || ""),
        name: String(workflow.uniquename || workflow.name || ""),
      },
    ],
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    dependencies: dependencies.rows,
  };

  return {
    componentType: "workflow",
    target: {
      name: String(workflow.uniquename || workflow.name || ""),
      displayName: String(workflow.name || workflow.uniquename || ""),
      objectId: String(workflow.workflowid || ""),
      componentTypeLabel: "Workflow",
    },
    warnings: [],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      category:
        WORKFLOW_CATEGORY_LABELS[Number(workflow.category || 0)] || String(workflow.category || ""),
      state:
        WORKFLOW_STATE_LABELS[Number(workflow.statecode || 0)] || String(workflow.statecode || ""),
      primaryEntity: String(workflow.primaryentity || ""),
      triggerOnUpdateAttributes: String(workflow.triggeronupdateattributelist || ""),
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzeFlowImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const flow = await fetchFlowDetails(env, client, options.name, options.solution);
  const dependencies = await fetchDependencyRowsForComponents(
    env,
    client,
    [
      {
        objectId: flow.workflowid,
        componentType: SOLUTION_COMPONENT_TYPE.workflow,
        displayName: flow.name,
        name: flow.uniquename || flow.name,
      },
    ],
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    connections: flow.summary.connectionReferenceNames.map((name) => ({ name })),
    triggers: flow.summary.triggerNames.map((name) => ({ name })),
    actions: flow.summary.actionNames.map((name) => ({ name })),
    dependencies: dependencies.rows,
  };

  return {
    componentType: "flow",
    target: {
      name: flow.uniquename || flow.name,
      displayName: flow.name,
      objectId: flow.workflowid,
      componentTypeLabel: "Cloud Flow",
      solution: options.solution || null,
    },
    warnings: [],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      state: flow.stateLabel,
      type: flow.typeLabel,
      primaryEntity: flow.primaryentity,
      summaryHash: flow.summary.hash,
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzeWebResourceImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const resource = await resolveWebResource(env, client, options.name);
  const usage = await findWebResourceUsageData(env, client, options.name);
  const dependencies = await fetchDependencyRowsForComponents(
    env,
    client,
    [
      {
        objectId: String(resource.webresourceid || ""),
        componentType: SOLUTION_COMPONENT_TYPE.webResource,
        displayName: String(resource.name || ""),
        name: String(resource.name || ""),
      },
    ],
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    forms: usage.forms,
    webResources: usage.webResources,
    dependencies: dependencies.rows,
  };

  return {
    componentType: "web_resource",
    target: {
      name: String(resource.name || ""),
      displayName: String(resource.name || ""),
      objectId: String(resource.webresourceid || ""),
      componentTypeLabel: "Web Resource",
    },
    warnings: usage.warnings || [],
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      resourceType: Number(resource.webresourcetype || 0),
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function analyzeSolutionImpact(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: AnalyzeImpactOptions,
): Promise<ImpactAnalysisResult> {
  const inventory = await fetchSolutionInventory(env, client, options.name);
  const warnings: string[] = [];
  let components = listSupportedSolutionComponents(inventory);

  if (components.length > MAX_SOLUTION_IMPACT_COMPONENTS) {
    warnings.push(
      `Solution impact scan is limited to ${MAX_SOLUTION_IMPACT_COMPONENTS} components per request. Use get_solution_dependencies for a full solution dependency review.`,
    );
    components = components.slice(0, MAX_SOLUTION_IMPACT_COMPONENTS);
  }

  const scopeKeys = new Set(
    inventory.components.map((component) =>
      createComponentKey(component.componenttype, component.objectid),
    ),
  );
  const dependencies = await fetchDependencyRowsForSolutionComponents(
    env,
    client,
    components,
    scopeKeys,
    options.maxDependencies,
  );

  const sections: Record<string, unknown[]> = {
    componentSummary: buildSolutionComponentSummaryRows(inventory),
    dependencies: dependencies.rows,
  };

  return {
    componentType: "solution",
    target: {
      name: inventory.solution.uniquename,
      displayName: `${inventory.solution.friendlyname} (${inventory.solution.uniquename})`,
      objectId: inventory.solution.solutionid,
      componentTypeLabel: "Solution",
    },
    warnings,
    summary: buildImpactSummary(sections, dependencies),
    sections,
    metadata: {
      version: inventory.solution.version || "",
      managed: Boolean(inventory.solution.ismanaged),
      supportedComponentCount: listSupportedSolutionComponents(inventory).length,
      scannedComponentCount: components.length,
    },
    dependencyRows: dependencies.rows,
    dependencyCountTotal: dependencies.total,
  };
}

async function resolveColumnTarget(
  env: EnvironmentConfig,
  client: DynamicsClient,
  columnRef: string,
  tableRef: string | undefined,
  warnings: string[],
): Promise<{
  tableLogicalName: string;
  columnName: string;
  metadataId: string | null;
}> {
  let resolvedTableRef = tableRef;
  let columnName = columnRef;

  if (!resolvedTableRef && columnRef.includes(".")) {
    const [left, right] = columnRef.split(".", 2);
    resolvedTableRef = left;
    columnName = right;
  }

  if (!resolvedTableRef) {
    warnings.push(
      "Column dependency analysis needs a table filter. Usage search still ran, but dependency rows may be incomplete.",
    );
    return {
      tableLogicalName: "",
      columnName,
      metadataId: null,
    };
  }

  const { table, columns } = await fetchTableColumns(env, client, resolvedTableRef);
  const needle = columnName.trim().toLowerCase();
  const exactMatches = columns.filter((column) => column.logicalName.toLowerCase() === needle);
  const partialMatches = columns.filter((column) =>
    column.logicalName.toLowerCase().includes(needle),
  );
  const matches = exactMatches.length > 0 ? exactMatches : partialMatches;

  if (matches.length === 0) {
    throw new Error(
      `Column '${columnName}' not found on table '${table.logicalName}' in '${env.name}'.`,
    );
  }

  if (matches.length > 1) {
    const optionValuePrefix = tableRef ? "" : `${table.logicalName}.`;
    throw new AmbiguousMatchError(
      `Column '${columnName}' is ambiguous on table '${table.logicalName}' in '${env.name}'. Choose a matching column and try again. Matches: ${matches
        .map((column) => column.logicalName)
        .join(", ")}.`,
      {
        parameter: "name",
        options: matches.map((column) => ({
          value: `${optionValuePrefix}${column.logicalName}`,
          label: `${table.logicalName}.${column.logicalName}`,
        })),
      },
    );
  }

  return {
    tableLogicalName: table.logicalName,
    columnName: matches[0].logicalName,
    metadataId: matches[0].metadataId,
  };
}

async function resolvePluginAssembly(
  env: EnvironmentConfig,
  client: DynamicsClient,
  pluginRef: string,
): Promise<Record<string, unknown>> {
  const assemblies = await client.query<Record<string, unknown>>(
    env,
    "pluginassemblies",
    listPluginAssembliesQuery(),
  );
  const matches = findNamedMatches(assemblies, pluginRef, (assembly) => [
    String(assembly.pluginassemblyid || ""),
    String(assembly.name || ""),
  ]);

  if (matches.length === 0) {
    throw new Error(`Plugin assembly '${pluginRef}' not found in '${env.name}'.`);
  }

  if (matches.length > 1) {
    throw createAmbiguousImpactError({
      itemLabel: "Plugin assembly",
      itemRef: pluginRef,
      environmentName: env.name,
      matches,
      displayName: (assembly) => String(assembly.name || ""),
      option: (assembly) => ({
        value: String(assembly.pluginassemblyid || assembly.name || ""),
        label: `${String(assembly.name || "")} (${String(assembly.pluginassemblyid || "")})`,
      }),
    });
  }

  return matches[0];
}

async function resolveWorkflow(
  env: EnvironmentConfig,
  client: DynamicsClient,
  workflowRef: string,
): Promise<Record<string, unknown>> {
  const workflows = (
    await client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery())
  ).filter((workflow) => Number(workflow.category || 0) !== 5);
  const matches = findNamedMatches(workflows, workflowRef, (workflow) => [
    String(workflow.workflowid || ""),
    String(workflow.uniquename || ""),
    String(workflow.name || ""),
  ]);

  if (matches.length === 0) {
    throw new Error(`Workflow '${workflowRef}' not found in '${env.name}'.`);
  }

  if (matches.length > 1) {
    throw createAmbiguousImpactError({
      itemLabel: "Workflow",
      itemRef: workflowRef,
      environmentName: env.name,
      matches,
      displayName: (workflow) => String(workflow.name || workflow.uniquename || ""),
      option: (workflow) => ({
        value: String(workflow.uniquename || workflow.workflowid || workflow.name || ""),
        label: workflow.uniquename
          ? `${String(workflow.name || workflow.uniquename || "")} (${String(workflow.uniquename)})`
          : `${String(workflow.name || "")} (${String(workflow.workflowid || "")})`,
      }),
    });
  }

  return matches[0];
}

async function resolveWebResource(
  env: EnvironmentConfig,
  client: DynamicsClient,
  resourceRef: string,
): Promise<Record<string, unknown>> {
  const resources = await client.query<Record<string, unknown>>(
    env,
    "webresourceset",
    listWebResourcesQuery(),
  );
  const matches = findNamedMatches(resources, resourceRef, (resource) => [
    String(resource.webresourceid || ""),
    String(resource.name || ""),
  ]);

  if (matches.length === 0) {
    throw new Error(`Web resource '${resourceRef}' not found in '${env.name}'.`);
  }

  if (matches.length > 1) {
    throw createAmbiguousImpactError({
      itemLabel: "Web resource",
      itemRef: resourceRef,
      environmentName: env.name,
      matches,
      displayName: (resource) => String(resource.name || ""),
      option: (resource) => ({
        value: String(resource.webresourceid || resource.name || ""),
        label: `${String(resource.name || "")} (${String(resource.webresourceid || "")})`,
      }),
    });
  }

  return matches[0];
}

function findNamedMatches<T>(items: T[], ref: string, selectors: (item: T) => string[]): T[] {
  const exactMatches = items.filter((item) => selectors(item).some((value) => value === ref));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const needle = ref.trim().toLowerCase();
  const caseInsensitiveMatches = items.filter((item) =>
    selectors(item).some((value) => value.toLowerCase() === needle),
  );
  if (caseInsensitiveMatches.length > 0) {
    return caseInsensitiveMatches;
  }

  return items.filter((item) =>
    selectors(item).some((value) => value.toLowerCase().includes(needle)),
  );
}

function createAmbiguousImpactError<T>(options: {
  itemLabel: string;
  itemRef: string;
  environmentName: string;
  matches: T[];
  displayName: (item: T) => string;
  option: (item: T) => AmbiguousMatchOption;
}): AmbiguousMatchError {
  const { itemLabel, itemRef, environmentName, matches, displayName, option } = options;

  return new AmbiguousMatchError(
    `${itemLabel} '${itemRef}' is ambiguous in '${environmentName}'. Choose a matching ${itemLabel.toLowerCase()} and try again. Matches: ${matches
      .map((item) => displayName(item))
      .join(", ")}.`,
    {
      parameter: "name",
      options: matches.map((item) => option(item)),
    },
  );
}

async function fetchDependencyRowsForComponents(
  env: EnvironmentConfig,
  client: DynamicsClient,
  components: ImpactComponentRef[],
  maxDependencies?: number,
) {
  const sourceComponents = await expandToSolutionComponents(env, client, components);
  return fetchDependencyRowsForSolutionComponents(
    env,
    client,
    sourceComponents,
    undefined,
    maxDependencies,
  );
}

async function fetchDependencyRowsForSolutionComponents(
  env: EnvironmentConfig,
  client: DynamicsClient,
  components: ImpactSourceComponent[],
  scopeKeys?: Set<string>,
  maxDependencies?: number,
) {
  if (components.length === 0) {
    return createEmptyDependencyResult();
  }

  const namedMap = new Map(
    components.map((component) => [
      createComponentKey(component.componentType, component.objectId),
      component.displayName,
    ]),
  );

  const records = deduplicateDependencyRecords(
    (
      await Promise.all(
        components.map(async (component) => [
          ...(await fetchDependencyDirection(
            env,
            client,
            component,
            "required",
            namedMap,
            scopeKeys,
          )),
          ...(await fetchDependencyDirection(
            env,
            client,
            component,
            "dependent",
            namedMap,
            scopeKeys,
          )),
        ]),
      )
    ).flat(),
  );

  await resolveDependencyNames(env, client, records, namedMap);

  const rows = records.slice(0, maxDependencies ?? 100).map((record) => ({
    relation: record.relation,
    sourceName: record.sourceComponent.displayName,
    sourceType: getSolutionComponentTypeLabel(record.sourceComponent.componentType),
    otherName: record.otherDisplayName,
    otherType: getSolutionComponentTypeLabel(record.otherComponentType),
    dependencyType: record.dependencyType,
    dependencyTypeLabel:
      DEPENDENCY_TYPE_LABELS[record.dependencyType] || String(record.dependencyType),
    inScope: record.inScope,
  }));

  return {
    rows,
    total: records.length,
    external: records.filter((record) => record.inScope === false).length,
  };
}

async function expandToSolutionComponents(
  env: EnvironmentConfig,
  client: DynamicsClient,
  components: ImpactComponentRef[],
): Promise<ImpactSourceComponent[]> {
  const groups = new Map<number, ImpactComponentRef[]>();

  for (const component of components) {
    if (!component.objectId) {
      continue;
    }

    const group = groups.get(component.componentType) || [];
    group.push(component);
    groups.set(component.componentType, group);
  }

  const results: ImpactSourceComponent[] = [];

  for (const [componentType, refs] of groups) {
    const objectIds = [...new Set(refs.map((ref) => ref.objectId).filter(Boolean))];
    if (objectIds.length === 0) {
      continue;
    }

    const rawRecords = await queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
      env,
      client,
      "solutioncomponents",
      objectIds,
      "objectid",
      (chunkObjectIds) => listSolutionComponentsByObjectIdsQuery(componentType, chunkObjectIds),
    );
    const records = rawRecords
      .map(normalizeSolutionComponent)
      .filter(
        (record) => record.componenttype === componentType && objectIds.includes(record.objectid),
      );

    for (const record of records) {
      const ref = refs.find((item) => item.objectId === record.objectid);
      if (!ref) {
        continue;
      }

      results.push({
        solutioncomponentid: record.solutioncomponentid,
        objectId: record.objectid,
        componentType: record.componenttype,
        displayName: ref.displayName,
        name: ref.name,
        parentDisplayName: ref.parentDisplayName,
      });
    }
  }

  return results;
}

async function fetchDependencyDirection(
  env: EnvironmentConfig,
  client: DynamicsClient,
  component: ImpactSourceComponent,
  relation: "required" | "dependent",
  namedMap: Map<string, string>,
  scopeKeys?: Set<string>,
): Promise<RawImpactDependencyRecord[]> {
  const path =
    relation === "required"
      ? retrieveRequiredComponentsPath(component.solutioncomponentid, component.componentType)
      : retrieveDependentComponentsPath(component.solutioncomponentid, component.componentType);
  const dependencies = await client.query<Record<string, unknown>>(
    env,
    path,
    dependencySelectQuery(),
  );

  return dependencies.map((dependency) => {
    const otherComponentType =
      relation === "required"
        ? Number(dependency.requiredcomponenttype || 0)
        : Number(dependency.dependentcomponenttype || 0);
    const otherObjectId =
      relation === "required"
        ? String(dependency.requiredcomponentobjectid || "")
        : String(dependency.dependentcomponentobjectid || "");
    const key = createComponentKey(otherComponentType, otherObjectId);

    return {
      relation,
      sourceComponent: component,
      otherObjectId,
      otherComponentType,
      otherDisplayName: namedMap.get(key) || otherObjectId,
      dependencyType: Number(dependency.dependencytype || 0),
      inScope: scopeKeys ? scopeKeys.has(key) : null,
    };
  });
}

async function resolveDependencyNames(
  env: EnvironmentConfig,
  client: DynamicsClient,
  records: RawImpactDependencyRecord[],
  namedMap: Map<string, string>,
): Promise<void> {
  const unresolved = records.filter(
    (record) =>
      !namedMap.has(createComponentKey(record.otherComponentType, record.otherObjectId)) &&
      isSupportedDependencyComponentType(record.otherComponentType),
  );

  if (unresolved.length === 0) {
    return;
  }

  const [
    tables,
    columns,
    roles,
    formsAndDashboards,
    views,
    workflows,
    webResources,
    appModules,
    assemblies,
    steps,
    images,
    connectionReferences,
    envDefinitions,
    envValues,
  ] = await Promise.all([
    resolveTables(env, client, collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.table)),
    resolveColumns(env, client, collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.column)),
    resolveSecurityRoles(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.securityRole),
    ),
    resolveFormsAndDashboards(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.form),
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.dashboard),
    ),
    resolveViews(env, client, collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.view)),
    resolveWorkflows(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.workflow),
    ),
    resolveWebResources(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.webResource),
    ),
    resolveAppModules(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.appModule),
    ),
    resolvePluginAssemblies(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginAssembly),
    ),
    fetchPluginStepsByIds(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginStep),
    ),
    fetchPluginImagesByIds(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginImage),
    ),
    resolveConnectionReferences(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.connectionReference),
    ),
    resolveEnvironmentVariableDefinitions(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.environmentVariableDefinition),
    ),
    resolveEnvironmentVariableValues(
      env,
      client,
      collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.environmentVariableValue),
    ),
  ]);

  for (const table of tables) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.table, table.metadataId),
      table.displayName ? `${table.displayName} (${table.logicalName})` : table.logicalName,
    );
  }

  for (const column of columns) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.column, column.metadataId),
      `${column.tableLogicalName}.${column.logicalName}`,
    );
  }

  for (const role of roles) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.securityRole, String(role.roleid || "")),
      `${String(role.name || "")} [${String(role.businessUnitName || "-")}]`,
    );
  }

  for (const form of formsAndDashboards.forms) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.form, String(form.formid || "")),
      `${String(form.objecttypecode || "")}/${String(form.name || "")}`,
    );
  }

  for (const dashboard of formsAndDashboards.dashboards) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.dashboard, String(dashboard.formid || "")),
      String(dashboard.name || ""),
    );
  }

  for (const view of views) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.view, String(view.savedqueryid || "")),
      `${String(view.returnedtypecode || "")}/${String(view.name || "")}`,
    );
  }

  for (const workflow of workflows) {
    const workflowLabel =
      Number(workflow.category || 0) === 5
        ? `${String(workflow.name || workflow.uniquename || "")} [Flow]`
        : String(workflow.name || workflow.uniquename || "");
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.workflow, String(workflow.workflowid || "")),
      workflowLabel,
    );
  }

  for (const resource of webResources) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.webResource, String(resource.webresourceid || "")),
      String(resource.name || ""),
    );
  }

  for (const app of appModules) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.appModule, String(app.appmoduleid || "")),
      String(app.name || app.uniquename || ""),
    );
  }

  for (const assembly of assemblies) {
    namedMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.pluginAssembly,
        String(assembly.pluginassemblyid || ""),
      ),
      String(assembly.name || ""),
    );
  }

  for (const step of steps) {
    namedMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.pluginStep, step.sdkmessageprocessingstepid),
      step.displayName,
    );
  }

  for (const image of images) {
    namedMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.pluginImage,
        image.sdkmessageprocessingstepimageid,
      ),
      image.displayName,
    );
  }

  for (const reference of connectionReferences) {
    namedMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.connectionReference,
        String(reference.connectionreferenceid || ""),
      ),
      String(reference.displayname || reference.connectionreferencelogicalname || ""),
    );
  }

  for (const definition of envDefinitions) {
    namedMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
        String(definition.environmentvariabledefinitionid || ""),
      ),
      String(definition.schemaname || ""),
    );
  }

  const definitionNameById = new Map(
    envDefinitions.map((definition) => [
      String(definition.environmentvariabledefinitionid || ""),
      String(definition.schemaname || ""),
    ]),
  );

  for (const value of envValues) {
    namedMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.environmentVariableValue,
        String(value.environmentvariablevalueid || ""),
      ),
      `${definitionNameById.get(String(value._environmentvariabledefinitionid_value || "")) || String(value._environmentvariabledefinitionid_value || "")} value`,
    );
  }

  for (const record of records) {
    const resolvedName = namedMap.get(
      createComponentKey(record.otherComponentType, record.otherObjectId),
    );
    if (resolvedName) {
      record.otherDisplayName = resolvedName;
    }
  }
}

async function resolveTables(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return listTablesByMetadataIds(env, client, ids);
}

async function resolveColumns(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return listColumnsByMetadataIds(env, client, ids);
}

async function resolveSecurityRoles(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "roles",
    ids,
    "roleid",
    listSecurityRolesByIdsQuery,
  );
}

async function resolveFormsAndDashboards(
  env: EnvironmentConfig,
  client: DynamicsClient,
  formIds: string[],
  dashboardIds: string[],
) {
  const ids = [...new Set([...formIds, ...dashboardIds])];
  if (ids.length === 0) {
    return { forms: [], dashboards: [] };
  }

  const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "systemforms",
    ids,
    "formid",
    listFormsByIdsQuery,
  );
  return {
    forms: records.filter(
      (record) => formIds.includes(String(record.formid || "")) && Number(record.type || 0) !== 0,
    ),
    dashboards: records.filter(
      (record) =>
        dashboardIds.includes(String(record.formid || "")) && Number(record.type || 0) === 0,
    ),
  };
}

async function resolveViews(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "savedqueries",
    ids,
    "savedqueryid",
    listSavedViewsByIdsQuery,
  );
}

async function resolveWorkflows(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "workflows",
    ids,
    "workflowid",
    listWorkflowsByIdsQuery,
  );
}

async function resolveWebResources(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "webresourceset",
    ids,
    "webresourceid",
    listWebResourcesByIdsQuery,
  );
}

async function resolveAppModules(env: EnvironmentConfig, client: DynamicsClient, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "appmodules",
    ids,
    "appmoduleid",
    listAppModulesByIdsQuery,
  );
}

async function resolvePluginAssemblies(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "pluginassemblies",
    ids,
    "pluginassemblyid",
    listPluginAssembliesByIdsQuery,
  );
}

async function resolveConnectionReferences(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "connectionreferences",
    ids,
    "connectionreferenceid",
    listConnectionReferencesByIdsQuery,
  );
}

async function resolveEnvironmentVariableDefinitions(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "environmentvariabledefinitions",
    ids,
    "environmentvariabledefinitionid",
    listEnvironmentVariableDefinitionsByIdsQuery,
  );
}

async function resolveEnvironmentVariableValues(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }
  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "environmentvariablevalues",
    ids,
    "environmentvariablevalueid",
    listEnvironmentVariableValuesByIdsQuery,
  );
}

function listSupportedSolutionComponents(inventory: SolutionInventory): NamedSolutionComponent[] {
  const componentByKey = new Map(
    inventory.components.map((component) => [
      createComponentKey(component.componenttype, component.objectid),
      component,
    ]),
  );
  const definitionNameById = new Map(
    inventory.environmentVariableDefinitions.map((definition) => [
      definition.environmentvariabledefinitionid,
      definition.schemaname,
    ]),
  );

  return [
    ...inventory.tables.map((table) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.table,
        table.metadataId,
        table.displayName ? `${table.displayName} (${table.logicalName})` : table.logicalName,
        table.logicalName,
      ),
    ),
    ...inventory.columns.map((column) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.column,
        column.metadataId,
        `${column.tableLogicalName}.${column.logicalName}`,
        `${column.tableLogicalName}.${column.logicalName}`,
        column.tableLogicalName,
      ),
    ),
    ...inventory.securityRoles.map((role) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.securityRole,
        role.roleid,
        `${role.name} [${role.businessUnitName || "-"}]`,
        role.name,
        role.businessUnitName || undefined,
      ),
    ),
    ...inventory.forms.map((form) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.form,
        String(form.formid || ""),
        `${String(form.objecttypecode || "")}/${String(form.name || "")}`,
        String(form.name || ""),
        String(form.objecttypecode || ""),
      ),
    ),
    ...inventory.views.map((view) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.view,
        String(view.savedqueryid || ""),
        `${String(view.returnedtypecode || "")}/${String(view.name || "")}`,
        String(view.name || ""),
        String(view.returnedtypecode || ""),
      ),
    ),
    ...inventory.workflows.map((workflow) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.workflow,
        String(workflow.workflowid || ""),
        String(workflow.name || workflow.uniquename || ""),
        String(workflow.uniquename || workflow.name || ""),
      ),
    ),
    ...inventory.dashboards.map((dashboard) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.dashboard,
        dashboard.formid,
        dashboard.name,
        dashboard.name,
        dashboard.objecttypecode || undefined,
      ),
    ),
    ...inventory.webResources.map((resource) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.webResource,
        String(resource.webresourceid || ""),
        String(resource.name || ""),
        String(resource.name || ""),
      ),
    ),
    ...inventory.appModules.map((app) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.appModule,
        app.appmoduleid,
        app.name,
        app.uniquename || app.name,
      ),
    ),
    ...inventory.pluginAssemblies.map((assembly) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginAssembly,
        String(assembly.pluginassemblyid || ""),
        String(assembly.name || ""),
        String(assembly.name || ""),
      ),
    ),
    ...inventory.pluginSteps.map((step) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginStep,
        step.sdkmessageprocessingstepid,
        step.displayName,
        step.name,
        step.assemblyName,
      ),
    ),
    ...inventory.pluginImages.map((image) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginImage,
        image.sdkmessageprocessingstepimageid,
        image.displayName,
        image.name,
        image.stepName,
      ),
    ),
    ...inventory.connectionReferences.map((reference) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.connectionReference,
        reference.connectionreferenceid,
        reference.displayname || reference.connectionreferencelogicalname,
        reference.connectionreferencelogicalname || reference.displayname,
      ),
    ),
    ...inventory.environmentVariableDefinitions.map((definition) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
        definition.environmentvariabledefinitionid,
        definition.schemaname,
        definition.schemaname,
      ),
    ),
    ...inventory.environmentVariableValues.map((value) =>
      createNamedSolutionComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.environmentVariableValue,
        value.environmentvariablevalueid,
        `${definitionNameById.get(value.environmentvariabledefinitionid) || value.environmentvariabledefinitionid} value`,
        definitionNameById.get(value.environmentvariabledefinitionid) ||
          value.environmentvariabledefinitionid,
        definitionNameById.get(value.environmentvariabledefinitionid),
      ),
    ),
  ].filter((component): component is NamedSolutionComponent => Boolean(component));
}

function createNamedSolutionComponent(
  componentByKey: Map<string, SolutionComponentRecord>,
  componentType: number,
  objectId: string,
  displayName: string,
  name: string,
  parentDisplayName?: string,
): NamedSolutionComponent | null {
  const component = componentByKey.get(createComponentKey(componentType, objectId));
  if (!component?.solutioncomponentid) {
    return null;
  }

  return {
    solutioncomponentid: component.solutioncomponentid,
    objectId,
    componentType,
    displayName,
    name,
    parentDisplayName,
  };
}

function buildSolutionComponentSummaryRows(inventory: SolutionInventory) {
  return [
    { type: "Tables", count: inventory.tables.length },
    { type: "Columns", count: inventory.columns.length },
    { type: "Security Roles", count: inventory.securityRoles.length },
    { type: "Forms", count: inventory.forms.length },
    { type: "Views", count: inventory.views.length },
    { type: "Workflows", count: inventory.workflows.length },
    { type: "Dashboards", count: inventory.dashboards.length },
    { type: "Web Resources", count: inventory.webResources.length },
    { type: "App Modules", count: inventory.appModules.length },
    { type: "Plugin Assemblies", count: inventory.pluginAssemblies.length },
    { type: "Plugin Steps", count: inventory.pluginSteps.length },
    { type: "Plugin Images", count: inventory.pluginImages.length },
    { type: "Connection References", count: inventory.connectionReferences.length },
    {
      type: "Environment Variable Definitions",
      count: inventory.environmentVariableDefinitions.length,
    },
    {
      type: "Environment Variable Values",
      count: inventory.environmentVariableValues.length,
    },
  ].filter((row) => row.count > 0);
}

function buildImpactSummary(
  sections: Record<string, unknown[]>,
  dependencies: { rows: ImpactDependencyRow[]; total: number; external: number },
): ImpactSummary {
  const directReferences = Object.entries(sections)
    .filter(([key]) => key !== "dependencies")
    .reduce((sum, [, items]) => sum + items.length, 0);
  const likelyAffectedAreas = Object.entries(sections)
    .filter(([, items]) => items.length > 0)
    .map(([key]) => humanizeSectionName(key));

  const score = directReferences + dependencies.total + dependencies.external * 2;
  const riskLevel = score >= 20 ? "critical" : score >= 10 ? "high" : score >= 4 ? "medium" : "low";

  return {
    riskLevel,
    totalReferences: directReferences,
    dependencyCount: dependencies.total,
    externalDependencyCount: dependencies.external,
    likelyAffectedAreas,
  };
}

function humanizeSectionName(sectionName: string): string {
  switch (sectionName) {
    case "pluginSteps":
      return "plugin steps";
    case "pluginImages":
      return "plugin images";
    case "customApis":
      return "custom APIs";
    case "cloudFlows":
      return "cloud flows";
    case "webResources":
      return "web resources";
    case "componentSummary":
      return "solution components";
    default:
      return sectionName.replace(/([A-Z])/g, " $1").toLowerCase();
  }
}

function createEmptyDependencyResult() {
  return {
    rows: [] as ImpactDependencyRow[],
    total: 0,
    external: 0,
  };
}

function normalizeSolutionComponent(record: Record<string, unknown>): SolutionComponentRecord {
  return {
    ...record,
    solutioncomponentid: String(record.solutioncomponentid || ""),
    objectid: String(record.objectid || ""),
    componenttype: Number(record.componenttype || 0),
    rootsolutioncomponentid: String(record.rootsolutioncomponentid || ""),
    rootcomponentbehavior: Number(record.rootcomponentbehavior || 0),
  };
}

function deduplicateDependencyRecords(
  records: RawImpactDependencyRecord[],
): RawImpactDependencyRecord[] {
  const seen = new Set<string>();

  return records.filter((record) => {
    const key = [
      record.relation,
      record.sourceComponent.solutioncomponentid,
      record.otherObjectId,
      record.otherComponentType,
      record.dependencyType,
    ].join("|");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createComponentKey(componentType: number, objectId: string): string {
  return `${componentType}:${objectId}`;
}

function collectDependencyIds(
  records: RawImpactDependencyRecord[],
  componentType: number,
): string[] {
  return [
    ...new Set(
      records
        .filter((record) => record.otherComponentType === componentType)
        .map((record) => record.otherObjectId)
        .filter(Boolean),
    ),
  ];
}

function isSupportedDependencyComponentType(componentType: number): boolean {
  return (Object.values(SOLUTION_COMPONENT_TYPE) as number[]).includes(componentType);
}
