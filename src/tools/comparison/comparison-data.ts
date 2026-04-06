import { createHash } from "node:crypto";
import type { AppConfig } from "../../config/types.js";
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
  pluginName?: string;
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

export async function comparePluginsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: PluginComparisonOptions,
): Promise<PluginComparisonData> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);

  const [sourcePlugins, targetPlugins] = await Promise.all([
    client.query<Record<string, unknown>>(
      sourceEnv,
      "pluginassemblies",
      listPluginAssembliesQuery(),
    ),
    client.query<Record<string, unknown>>(
      targetEnv,
      "pluginassemblies",
      listPluginAssembliesQuery(),
    ),
  ]);

  let sourceItems = sourcePlugins;
  let targetItems = targetPlugins;

  if (options?.pluginName) {
    sourceItems = sourceItems.filter((plugin) => plugin.name === options.pluginName);
    targetItems = targetItems.filter((plugin) => plugin.name === options.pluginName);
  }

  const result = diffCollections(sourceItems, targetItems, (plugin) => String(plugin.name), [
    "version",
    "isolationmode",
    "ismanaged",
  ]);

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
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);

  const queryParams = listWorkflowsQuery({
    category: options?.category,
  });

  const [sourceWorkflows, targetWorkflows] = await Promise.all([
    client.query<Record<string, unknown>>(sourceEnv, "workflows", queryParams),
    client.query<Record<string, unknown>>(targetEnv, "workflows", queryParams),
  ]);

  let sourceItems = sourceWorkflows;
  let targetItems = targetWorkflows;

  if (options?.workflowName) {
    const nameLower = options.workflowName.toLowerCase();
    sourceItems = sourceItems.filter((workflow) =>
      String(workflow.name).toLowerCase().includes(nameLower),
    );
    targetItems = targetItems.filter((workflow) =>
      String(workflow.name).toLowerCase().includes(nameLower),
    );
  }

  const result = diffCollections(
    sourceItems,
    targetItems,
    (workflow) => String(workflow.uniquename || workflow.name),
    ["statecode", "statuscode", "category", "mode", "ismanaged"],
  );

  return { sourceItems, targetItems, result };
}

export async function compareWebResourcesData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: WebResourceComparisonOptions,
): Promise<CollectionComparisonData<Record<string, unknown>>> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);
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

  const [sourceItems, targetItems] = await Promise.all([
    client.query<Record<string, unknown>>(sourceEnv, "webresourceset", queryParams),
    client.query<Record<string, unknown>>(targetEnv, "webresourceset", queryParams),
  ]);

  if (options?.compareContent) {
    for (const resource of [...sourceItems, ...targetItems]) {
      if (resource.content) {
        resource.contentHash = createHash("sha256")
          .update(String(resource.content))
          .digest("hex")
          .slice(0, 12);
      } else {
        resource.contentHash = "(empty)";
      }
    }
  }

  const compareFields = options?.compareContent
    ? ["webresourcetype", "ismanaged", "contentHash"]
    : ["webresourcetype", "ismanaged"];

  const result = diffCollections(
    sourceItems,
    targetItems,
    (resource) => String(resource.name),
    compareFields,
  );

  return { sourceItems, targetItems, result };
}

export async function compareFormsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: FormComparisonOptions,
): Promise<CollectionComparisonData<FormDetails>> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);

  const [sourceForms, targetForms] = await Promise.all([
    listForms(sourceEnv, client, {
      table: options?.table,
      type: options?.type,
      solution: options?.solution,
    }),
    listForms(targetEnv, client, {
      table: options?.table,
      type: options?.type,
      solution: options?.targetSolution || options?.solution,
    }),
  ]);

  let filteredSource = sourceForms;
  let filteredTarget = targetForms;

  if (options?.formName) {
    const needle = options.formName.toLowerCase();
    filteredSource = filteredSource.filter((form) => form.name.toLowerCase().includes(needle));
    filteredTarget = filteredTarget.filter((form) => form.name.toLowerCase().includes(needle));
  }

  const warnings: string[] = [];
  const sourceCandidateCount = filteredSource.length;
  const targetCandidateCount = filteredTarget.length;
  const truncated =
    sourceCandidateCount > MAX_COMPARE_DETAIL_ITEMS ||
    targetCandidateCount > MAX_COMPARE_DETAIL_ITEMS;

  if (truncated) {
    warnings.push(
      `Detailed form comparison is limited to ${MAX_COMPARE_DETAIL_ITEMS} items per environment. Add table, type, formName, or solution filters for a smaller scope.`,
    );
  }

  filteredSource = filteredSource.slice(0, MAX_COMPARE_DETAIL_ITEMS);
  filteredTarget = filteredTarget.slice(0, MAX_COMPARE_DETAIL_ITEMS);

  const [sourceItems, targetItems] = await Promise.all([
    Promise.all(
      filteredSource.map((form) =>
        fetchFormDetails(sourceEnv, client, form.uniquename || form.name, {
          table: form.objecttypecode,
          solution: options?.solution,
        }),
      ),
    ),
    Promise.all(
      filteredTarget.map((form) =>
        fetchFormDetails(targetEnv, client, form.uniquename || form.name, {
          table: form.objecttypecode,
          solution: options?.targetSolution || options?.solution,
        }),
      ),
    ),
  ]);

  const result = diffCollections(
    sourceItems,
    targetItems,
    (form) => `${form.objecttypecode} | ${form.typeLabel} | ${form.name}`,
    ["objecttypecode", "typeLabel", "formactivationstate", "isdefault", "ismanaged", "summaryHash"],
  );

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

export async function compareViewsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: ViewComparisonOptions,
): Promise<CollectionComparisonData<ViewDetails>> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);

  const [sourceViews, targetViews] = await Promise.all([
    listViews(sourceEnv, client, {
      table: options?.table,
      scope: options?.scope,
      solution: options?.solution,
    }),
    listViews(targetEnv, client, {
      table: options?.table,
      scope: options?.scope,
      solution: options?.targetSolution || options?.solution,
    }),
  ]);

  let filteredSource = sourceViews;
  let filteredTarget = targetViews;

  if (options?.viewName) {
    const needle = options.viewName.toLowerCase();
    filteredSource = filteredSource.filter((view) => view.name.toLowerCase().includes(needle));
    filteredTarget = filteredTarget.filter((view) => view.name.toLowerCase().includes(needle));
  }

  const warnings: string[] = [];
  const sourceCandidateCount = filteredSource.length;
  const targetCandidateCount = filteredTarget.length;
  const truncated =
    sourceCandidateCount > MAX_COMPARE_DETAIL_ITEMS ||
    targetCandidateCount > MAX_COMPARE_DETAIL_ITEMS;

  if (truncated) {
    warnings.push(
      `Detailed view comparison is limited to ${MAX_COMPARE_DETAIL_ITEMS} items per environment. Add table, scope, viewName, or solution filters for a smaller scope.`,
    );
  }

  filteredSource = filteredSource.slice(0, MAX_COMPARE_DETAIL_ITEMS);
  filteredTarget = filteredTarget.slice(0, MAX_COMPARE_DETAIL_ITEMS);

  const [sourceItems, targetItems] = await Promise.all([
    Promise.all(
      filteredSource.map((view) =>
        fetchViewDetails(sourceEnv, client, view.name, {
          table: view.returnedtypecode,
          scope: view.scope,
          solution: options?.solution,
        }),
      ),
    ),
    Promise.all(
      filteredTarget.map((view) =>
        fetchViewDetails(targetEnv, client, view.name, {
          table: view.returnedtypecode,
          scope: view.scope,
          solution: options?.targetSolution || options?.solution,
        }),
      ),
    ),
  ]);

  const result = diffCollections(
    sourceItems,
    targetItems,
    (view) => `${view.returnedtypecode} | ${view.scope} | ${view.name}`,
    [
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
  );

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

export async function compareCustomApisData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  options?: CustomApiComparisonOptions,
): Promise<CustomApiComparisonData> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);

  let [sourceItems, targetItems] = await Promise.all([
    listCustomApis(sourceEnv, client),
    listCustomApis(targetEnv, client),
  ]);

  if (options?.apiName) {
    const needle = options.apiName.toLowerCase();
    sourceItems = sourceItems.filter(
      (api) =>
        api.name.toLowerCase().includes(needle) || api.uniquename.toLowerCase().includes(needle),
    );
    targetItems = targetItems.filter(
      (api) =>
        api.name.toLowerCase().includes(needle) || api.uniquename.toLowerCase().includes(needle),
    );
  }

  const result = diffCollections(
    sourceItems,
    targetItems,
    (api) => String(api.uniquename || api.name),
    [
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
