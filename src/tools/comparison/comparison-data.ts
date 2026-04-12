import { createHash } from "node:crypto";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import {
  listWebResourcesQuery,
  listWebResourcesWithContentQuery,
} from "../../queries/web-resource-queries.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { diffCollections, type DiffResult } from "../../utils/diff.js";
import { fetchPluginInventory } from "../plugins/plugin-inventory.js";
import { listForms, type FormDetails } from "../forms/form-metadata.js";
import { listViews, type ViewDetails } from "../views/view-metadata.js";
import type { FormType } from "../../queries/form-queries.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { fetchFormDetails } from "../forms/form-metadata.js";
import { fetchViewDetails } from "../views/view-metadata.js";
import {
  fetchCustomApiInventory,
  listCustomApis,
  type CustomApiParameterRecord,
  type CustomApiRecord,
} from "../custom-apis/custom-api-metadata.js";

export interface CollectionComparisonData<T extends Record<string, unknown>> {
  sourceItems: T[];
  targetItems: T[];
  result: DiffResult<T>;
  warnings?: string[];
  sourceCandidateCount?: number;
  targetCandidateCount?: number;
  truncated?: boolean;
}

export interface PluginComparisonData extends CollectionComparisonData<Record<string, unknown>> {
  stepSourceItems?: Record<string, unknown>[];
  stepTargetItems?: Record<string, unknown>[];
  stepResult?: DiffResult<Record<string, unknown>>;
  imageSourceItems?: Record<string, unknown>[];
  imageTargetItems?: Record<string, unknown>[];
  imageResult?: DiffResult<Record<string, unknown>>;
}

export interface PluginComparisonOptions {
  assemblyName?: string;
  includeChildComponents?: boolean;
}

export interface WorkflowComparisonOptions {
  category?: WorkflowCategory;
  workflowName?: string;
}

export interface WebResourceComparisonOptions {
  type?: WebResourceType;
  nameFilter?: string;
  compareContent?: boolean;
}

export interface FormComparisonOptions {
  table?: string;
  type?: FormType;
  formName?: string;
  solution?: string;
  targetSolution?: string;
}

export interface ViewComparisonOptions {
  table?: string;
  scope?: ViewScope;
  viewName?: string;
  solution?: string;
  targetSolution?: string;
}

export interface CustomApiComparisonData extends CollectionComparisonData<CustomApiRecord> {
  requestParameterSourceItems: CustomApiParameterRecord[];
  requestParameterTargetItems: CustomApiParameterRecord[];
  requestParameterResult: DiffResult<CustomApiParameterRecord>;
  responsePropertySourceItems: CustomApiParameterRecord[];
  responsePropertyTargetItems: CustomApiParameterRecord[];
  responsePropertyResult: DiffResult<CustomApiParameterRecord>;
}

export interface CustomApiComparisonOptions {
  apiName?: string;
}

const MAX_COMPARE_DETAIL_ITEMS = 50;

interface ComparisonEnvironmentPair {
  sourceEnv: EnvironmentConfig;
  targetEnv: EnvironmentConfig;
}

interface SimpleCollectionComparisonOptions<T extends Record<string, unknown>> {
  fetchSourceItems: (env: EnvironmentConfig) => Promise<T[]>;
  fetchTargetItems?: (env: EnvironmentConfig) => Promise<T[]>;
  filterSourceItems?: (items: T[]) => T[];
  filterTargetItems?: (items: T[]) => T[];
  prepareSourceItems?: (items: T[]) => void;
  prepareTargetItems?: (items: T[]) => void;
  keyFn: (item: T) => string;
  compareFields: string[];
}

interface DetailedCollectionComparisonOptions<
  TRecord extends Record<string, unknown>,
  TDetail extends Record<string, unknown>,
> {
  fetchSourceRecords: (env: EnvironmentConfig) => Promise<TRecord[]>;
  fetchTargetRecords: (env: EnvironmentConfig) => Promise<TRecord[]>;
  fetchSourceDetails: (env: EnvironmentConfig, records: TRecord[]) => Promise<TDetail[]>;
  fetchTargetDetails: (env: EnvironmentConfig, records: TRecord[]) => Promise<TDetail[]>;
  nameFilter?: string;
  detailLabel: string;
  narrowingHint: string;
  keyFn: (item: TDetail) => string;
  compareFields: string[];
  finalizeResult?: (result: DiffResult<TDetail>) => void;
}

export async function comparePluginAssembliesData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: PluginComparisonOptions,
): Promise<PluginComparisonData> {
  const { sourceEnv, targetEnv } = resolveComparisonEnvironments(
    config,
    sourceEnvironment,
    targetEnvironment,
  );
  const { sourceItems, targetItems, result } = await compareSimpleCollectionData(
    config,
    sourceEnvironment,
    targetEnvironment,
    {
      fetchSourceItems: (env) =>
        client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
      filterSourceItems: (items) => filterByExactName(items, options?.assemblyName),
      filterTargetItems: (items) => filterByExactName(items, options?.assemblyName),
      keyFn: (assembly) => String(assembly.name),
      compareFields: ["version", "isolationmode", "ismanaged"],
    },
  );

  let stepSourceItems: Record<string, unknown>[] | undefined;
  let stepTargetItems: Record<string, unknown>[] | undefined;
  let stepResult: DiffResult<Record<string, unknown>> | undefined;
  let imageSourceItems: Record<string, unknown>[] | undefined;
  let imageTargetItems: Record<string, unknown>[] | undefined;
  let imageResult: DiffResult<Record<string, unknown>> | undefined;

  if (options?.includeChildComponents) {
    const [sourceInventory, targetInventory] = await Promise.all([
      fetchPluginInventory(sourceEnv, client, sourceItems),
      fetchPluginInventory(targetEnv, client, targetItems),
    ]);

    stepSourceItems = sourceInventory.steps;
    stepTargetItems = targetInventory.steps;
    stepResult = diffCollections(
      sourceInventory.steps,
      targetInventory.steps,
      (step) => String(step.key),
      [
        "stage",
        "mode",
        "statecode",
        "rank",
        "filteringattributes",
        "supporteddeployment",
        "asyncautodelete",
      ],
    );

    imageSourceItems = sourceInventory.images;
    imageTargetItems = targetInventory.images;
    imageResult = diffCollections(
      sourceInventory.images,
      targetInventory.images,
      (image) => String(image.key),
      ["entityalias", "imagetype", "attributes", "messagepropertyname"],
    );
  }

  return {
    sourceItems,
    targetItems,
    result,
    stepSourceItems,
    stepTargetItems,
    stepResult,
    imageSourceItems,
    imageTargetItems,
    imageResult,
  };
}

export async function compareWorkflowsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: WorkflowComparisonOptions,
): Promise<CollectionComparisonData<Record<string, unknown>>> {
  const queryParams = listWorkflowsQuery({
    category: options?.category,
  });

  return compareSimpleCollectionData(config, sourceEnvironment, targetEnvironment, {
    fetchSourceItems: (env) => client.query<Record<string, unknown>>(env, "workflows", queryParams),
    filterSourceItems: (items) => filterByNameContains(items, options?.workflowName),
    filterTargetItems: (items) => filterByNameContains(items, options?.workflowName),
    keyFn: (workflow) => String(workflow.uniquename || workflow.name),
    compareFields: ["statecode", "statuscode", "category", "mode", "ismanaged"],
  });
}

export async function compareWebResourcesData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: WebResourceComparisonOptions,
): Promise<CollectionComparisonData<Record<string, unknown>>> {
  const resourceType = options?.type;
  const resourceNameFilter = options?.nameFilter;

  const queryParams = options?.compareContent
    ? listWebResourcesWithContentQuery({
        type: resourceType,
        nameFilter: resourceNameFilter,
      })
    : listWebResourcesQuery({
        type: resourceType,
        nameFilter: resourceNameFilter,
      });

  return compareSimpleCollectionData(config, sourceEnvironment, targetEnvironment, {
    fetchSourceItems: (env) =>
      client.query<Record<string, unknown>>(env, "webresourceset", queryParams),
    prepareSourceItems: (items) => {
      if (options?.compareContent) {
        addWebResourceContentHashes(items);
      }
    },
    prepareTargetItems: (items) => {
      if (options?.compareContent) {
        addWebResourceContentHashes(items);
      }
    },
    keyFn: (resource) => String(resource.name),
    compareFields: options?.compareContent
      ? ["webresourcetype", "ismanaged", "contentHash"]
      : ["webresourcetype", "ismanaged"],
  });
}

export async function compareFormsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: FormComparisonOptions,
): Promise<CollectionComparisonData<FormDetails>> {
  return compareDetailedCollectionData(config, sourceEnvironment, targetEnvironment, {
    fetchSourceRecords: (env) =>
      listForms(env, client, {
        table: options?.table,
        type: options?.type,
        solution: options?.solution,
      }),
    fetchTargetRecords: (env) =>
      listForms(env, client, {
        table: options?.table,
        type: options?.type,
        solution: options?.targetSolution || options?.solution,
      }),
    fetchSourceDetails: (env, forms) =>
      Promise.all(
        forms.map((form) =>
          fetchFormDetails(env, client, form.uniquename || form.name, {
            table: form.objecttypecode,
            solution: options?.solution,
          }),
        ),
      ),
    fetchTargetDetails: (env, forms) =>
      Promise.all(
        forms.map((form) =>
          fetchFormDetails(env, client, form.uniquename || form.name, {
            table: form.objecttypecode,
            solution: options?.targetSolution || options?.solution,
          }),
        ),
      ),
    nameFilter: options?.formName,
    detailLabel: "form",
    narrowingHint: "Add table, type, formName, or solution filters for a smaller scope.",
    keyFn: (form) => `${form.objecttypecode} | ${form.typeLabel} | ${form.name}`,
    compareFields: [
      "objecttypecode",
      "typeLabel",
      "formactivationstate",
      "isdefault",
      "ismanaged",
      "summaryHash",
    ],
    finalizeResult: enhanceFormComparisonResult,
  });
}

export async function compareViewsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: ViewComparisonOptions,
): Promise<CollectionComparisonData<ViewDetails>> {
  return compareDetailedCollectionData(config, sourceEnvironment, targetEnvironment, {
    fetchSourceRecords: (env) =>
      listViews(env, client, {
        table: options?.table,
        scope: options?.scope,
        solution: options?.solution,
      }),
    fetchTargetRecords: (env) =>
      listViews(env, client, {
        table: options?.table,
        scope: options?.scope,
        solution: options?.targetSolution || options?.solution,
      }),
    fetchSourceDetails: (env, views) =>
      Promise.all(
        views.map((view) =>
          fetchViewDetails(env, client, view.name, {
            table: view.returnedtypecode,
            scope: view.scope,
            solution: options?.solution,
          }),
        ),
      ),
    fetchTargetDetails: (env, views) =>
      Promise.all(
        views.map((view) =>
          fetchViewDetails(env, client, view.name, {
            table: view.returnedtypecode,
            scope: view.scope,
            solution: options?.targetSolution || options?.solution,
          }),
        ),
      ),
    nameFilter: options?.viewName,
    detailLabel: "view",
    narrowingHint: "Add table, scope, viewName, or solution filters for a smaller scope.",
    keyFn: (view) => `${view.returnedtypecode} | ${view.scope} | ${view.name}`,
    compareFields: [
      "scope",
      "returnedtypecode",
      "querytype",
      "isdefault",
      "isquickfindquery",
      "ismanaged",
      "statecode",
      "fetchSummaryHash",
      "layoutSummaryHash",
    ],
    finalizeResult: enhanceViewComparisonResult,
  });
}

export async function compareCustomApisData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: CustomApiComparisonOptions,
): Promise<CustomApiComparisonData> {
  const { sourceEnv, targetEnv } = resolveComparisonEnvironments(
    config,
    sourceEnvironment,
    targetEnvironment,
  );
  const { sourceItems, targetItems, result } = await compareSimpleCollectionData(
    config,
    sourceEnvironment,
    targetEnvironment,
    {
      fetchSourceItems: (env) => listCustomApis(env, client),
      filterSourceItems: (items) => filterCustomApis(items, options?.apiName),
      filterTargetItems: (items) => filterCustomApis(items, options?.apiName),
      keyFn: (api) => String(api.uniquename || api.name),
      compareFields: [
        "bindingTypeLabel",
        "boundentitylogicalname",
        "isfunction",
        "isprivate",
        "allowedProcessingStepLabel",
        "executeprivilegename",
        "workflowsdkstepenabled",
        "ismanaged",
        "stateLabel",
        "plugintypeid",
        "sdkmessageid",
        "powerfxruleid",
      ],
    },
  );

  const [sourceInventory, targetInventory] = await Promise.all([
    fetchCustomApiInventory(sourceEnv, client, sourceItems),
    fetchCustomApiInventory(targetEnv, client, targetItems),
  ]);
  const sourceApiKeyById = new Map(
    sourceInventory.apis.map((api) => [api.customapiid, api.uniquename || api.name]),
  );
  const targetApiKeyById = new Map(
    targetInventory.apis.map((api) => [api.customapiid, api.uniquename || api.name]),
  );

  const requestParameterResult = diffCollections(
    sourceInventory.requestParameters,
    targetInventory.requestParameters,
    (parameter) =>
      `${sourceApiKeyById.get(parameter.customapiid) || targetApiKeyById.get(parameter.customapiid) || parameter.customapiid} | ${parameter.uniquename || parameter.name} | ${parameter.kind}`,
    ["typeLabel", "isoptional", "logicalentityname", "ismanaged", "stateLabel"],
  );

  const responsePropertyResult = diffCollections(
    sourceInventory.responseProperties,
    targetInventory.responseProperties,
    (property) =>
      `${sourceApiKeyById.get(property.customapiid) || targetApiKeyById.get(property.customapiid) || property.customapiid} | ${property.uniquename || property.name} | ${property.kind}`,
    ["typeLabel", "logicalentityname", "ismanaged", "stateLabel"],
  );

  return {
    sourceItems,
    targetItems,
    result,
    requestParameterSourceItems: sourceInventory.requestParameters,
    requestParameterTargetItems: targetInventory.requestParameters,
    requestParameterResult,
    responsePropertySourceItems: sourceInventory.responseProperties,
    responsePropertyTargetItems: targetInventory.responseProperties,
    responsePropertyResult,
  };
}

function resolveComparisonEnvironments(
  config: AppConfig,
  sourceEnvironment: string,
  targetEnvironment: string,
): ComparisonEnvironmentPair {
  return {
    sourceEnv: getEnvironment(config, sourceEnvironment),
    targetEnv: getEnvironment(config, targetEnvironment),
  };
}

async function compareSimpleCollectionData<T extends Record<string, unknown>>(
  config: AppConfig,
  sourceEnvironment: string,
  targetEnvironment: string,
  options: SimpleCollectionComparisonOptions<T>,
): Promise<CollectionComparisonData<T>> {
  const { sourceEnv, targetEnv } = resolveComparisonEnvironments(
    config,
    sourceEnvironment,
    targetEnvironment,
  );
  let [sourceItems, targetItems] = await Promise.all([
    options.fetchSourceItems(sourceEnv),
    (options.fetchTargetItems || options.fetchSourceItems)(targetEnv),
  ]);

  if (options.filterSourceItems) {
    sourceItems = options.filterSourceItems(sourceItems);
  }
  if (options.filterTargetItems) {
    targetItems = options.filterTargetItems(targetItems);
  }

  options.prepareSourceItems?.(sourceItems);
  options.prepareTargetItems?.(targetItems);

  return {
    sourceItems,
    targetItems,
    result: diffCollections(sourceItems, targetItems, options.keyFn, options.compareFields),
  };
}

async function compareDetailedCollectionData<
  TRecord extends Record<string, unknown>,
  TDetail extends Record<string, unknown>,
>(
  config: AppConfig,
  sourceEnvironment: string,
  targetEnvironment: string,
  options: DetailedCollectionComparisonOptions<TRecord, TDetail>,
): Promise<CollectionComparisonData<TDetail>> {
  const { sourceEnv, targetEnv } = resolveComparisonEnvironments(
    config,
    sourceEnvironment,
    targetEnvironment,
  );
  const [sourceRecords, targetRecords] = await Promise.all([
    options.fetchSourceRecords(sourceEnv),
    options.fetchTargetRecords(targetEnv),
  ]);

  const filteredSource = filterByNameContains(sourceRecords, options.nameFilter);
  const filteredTarget = filterByNameContains(targetRecords, options.nameFilter);
  const sourceCandidateCount = filteredSource.length;
  const targetCandidateCount = filteredTarget.length;
  const truncated =
    sourceCandidateCount > MAX_COMPARE_DETAIL_ITEMS ||
    targetCandidateCount > MAX_COMPARE_DETAIL_ITEMS;
  const warnings = truncated
    ? [
        `Detailed ${options.detailLabel} comparison is limited to ${MAX_COMPARE_DETAIL_ITEMS} items per environment. ${options.narrowingHint}`,
      ]
    : [];

  const [sourceItems, targetItems] = await Promise.all([
    options.fetchSourceDetails(sourceEnv, filteredSource.slice(0, MAX_COMPARE_DETAIL_ITEMS)),
    options.fetchTargetDetails(targetEnv, filteredTarget.slice(0, MAX_COMPARE_DETAIL_ITEMS)),
  ]);

  const result = diffCollections(sourceItems, targetItems, options.keyFn, options.compareFields);
  options.finalizeResult?.(result);

  return {
    sourceItems,
    targetItems,
    result,
    warnings,
    sourceCandidateCount,
    targetCandidateCount,
    truncated,
  };
}

function filterByExactName<T extends Record<string, unknown>>(items: T[], name?: string): T[] {
  if (!name) {
    return items;
  }

  return items.filter((item) => String(item.name) === name);
}

function filterByNameContains<T extends Record<string, unknown>>(
  items: T[],
  nameFilter?: string,
): T[] {
  if (!nameFilter) {
    return items;
  }

  const needle = nameFilter.toLowerCase();
  return items.filter((item) =>
    String(item.name || "")
      .toLowerCase()
      .includes(needle),
  );
}

function filterCustomApis(items: CustomApiRecord[], apiName?: string): CustomApiRecord[] {
  if (!apiName) {
    return items;
  }

  const needle = apiName.toLowerCase();
  return items.filter(
    (api) =>
      api.name.toLowerCase().includes(needle) || api.uniquename.toLowerCase().includes(needle),
  );
}

function addWebResourceContentHashes(items: Record<string, unknown>[]): void {
  for (const resource of items) {
    resource.contentHash = resource.content
      ? createHash("sha256").update(String(resource.content)).digest("hex").slice(0, 12)
      : "(empty)";
  }
}

function enhanceFormComparisonResult(result: DiffResult<FormDetails>): void {
  for (const diff of result.differences) {
    const changedFields = diff.changedFields.filter((change) => change.field !== "summaryHash");
    if (JSON.stringify(diff.source.summary) !== JSON.stringify(diff.target.summary)) {
      changedFields.push({
        field: "xmlSummary",
        sourceValue: {
          tabs: diff.source.summary.tabs,
          sections: diff.source.summary.sections,
          controls: diff.source.summary.controls,
          libraries: diff.source.summary.libraries,
          handlers: diff.source.summary.handlerCount,
          hash: diff.source.summary.hash,
        },
        targetValue: {
          tabs: diff.target.summary.tabs,
          sections: diff.target.summary.sections,
          controls: diff.target.summary.controls,
          libraries: diff.target.summary.libraries,
          handlers: diff.target.summary.handlerCount,
          hash: diff.target.summary.hash,
        },
      });
    }
    diff.changedFields = changedFields;
  }
}

function enhanceViewComparisonResult(result: DiffResult<ViewDetails>): void {
  for (const diff of result.differences) {
    const changedFields = diff.changedFields.filter(
      (change) => change.field !== "fetchSummaryHash" && change.field !== "layoutSummaryHash",
    );
    if (JSON.stringify(diff.source.summary) !== JSON.stringify(diff.target.summary)) {
      changedFields.push({
        field: "querySummary",
        sourceValue: {
          entity: diff.source.summary.entityName,
          columns: diff.source.summary.attributes,
          sort: diff.source.summary.orders,
          links: diff.source.summary.linkEntities,
          filters: diff.source.summary.filterCount,
          layout: diff.source.summary.layoutColumns,
          fetchHash: diff.source.summary.fetchHash,
          layoutHash: diff.source.summary.layoutHash,
        },
        targetValue: {
          entity: diff.target.summary.entityName,
          columns: diff.target.summary.attributes,
          sort: diff.target.summary.orders,
          links: diff.target.summary.linkEntities,
          filters: diff.target.summary.filterCount,
          layout: diff.target.summary.layoutColumns,
          fetchHash: diff.target.summary.fetchHash,
          layoutHash: diff.target.summary.layoutHash,
        },
      });
    }
    diff.changedFields = changedFields;
  }
}
