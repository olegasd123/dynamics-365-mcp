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

export interface CollectionComparisonData<T extends Record<string, unknown>> {
  sourceItems: T[];
  targetItems: T[];
  result: DiffResult<T>;
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
    client.query<Record<string, unknown>>(sourceEnv, "pluginassemblies", listPluginAssembliesQuery()),
    client.query<Record<string, unknown>>(targetEnv, "pluginassemblies", listPluginAssembliesQuery()),
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
    stepResult = diffCollections(sourceInventory.steps, targetInventory.steps, (step) => String(step.key), [
      "stage",
      "mode",
      "statecode",
      "rank",
      "filteringattributes",
      "supporteddeployment",
      "asyncautodelete",
    ]);

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
