import { createHash } from "node:crypto";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPluginAssembliesQuery,
  listPluginImagesQuery,
  listPluginStepsQuery,
  listPluginTypesQuery,
} from "../../queries/plugin-queries.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { diffCollections, type DiffResult } from "../../utils/diff.js";
import { buildQueryString } from "../../utils/odata-helpers.js";

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
    ? buildQueryString({
        select: [
          "webresourceid",
          "name",
          "displayname",
          "webresourcetype",
          "ismanaged",
          "modifiedon",
          "content",
        ],
        filter:
          [
            resourceType
              ? `webresourcetype eq ${({ html: 1, css: 2, js: 3, xml: 4, png: 5, jpg: 6, gif: 7, xap: 8, xsl: 9, ico: 10, svg: 11, resx: 12 } as Record<string, number>)[resourceType]}`
              : "",
            resourceNameFilter ? `contains(name,'${resourceNameFilter}')` : "",
          ]
            .filter(Boolean)
            .join(" and ") || undefined,
        orderby: "name asc",
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

async function fetchPluginInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  assemblies: Record<string, unknown>[],
): Promise<{
  steps: Record<string, unknown>[];
  images: Record<string, unknown>[];
}> {
  if (assemblies.length === 0) {
    return { steps: [], images: [] };
  }

  const typeRecords = (
    await Promise.all(
      assemblies.map(async (assembly) => {
        const types = await client.query<Record<string, unknown>>(
          env,
          "plugintypes",
          listPluginTypesQuery(String(assembly.pluginassemblyid)),
        );

        return types.map((type) => ({
          assemblyName: String(assembly.name || ""),
          pluginTypeName: String(type.name || ""),
          pluginTypeFullName: String(type.typename || ""),
          pluginTypeId: String(type.plugintypeid || ""),
        }));
      }),
    )
  ).flat();

  const stepRecords = (
    await Promise.all(
      typeRecords.map(async (typeRecord) => {
        const steps = await client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingsteps",
          listPluginStepsQuery(typeRecord.pluginTypeId),
        );

        return steps.map((step) => normalizePluginStep(typeRecord, step));
      }),
    )
  ).flat();

  const imageRecords = (
    await Promise.all(
      stepRecords.map(async (stepRecord) => {
        const images = await client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingstepimages",
          listPluginImagesQuery(String(stepRecord.sdkmessageprocessingstepid)),
        );

        return images.map((image) => normalizePluginImage(stepRecord, image));
      }),
    )
  ).flat();

  return { steps: stepRecords, images: imageRecords };
}

function normalizePluginStep(
  typeRecord: {
    assemblyName: string;
    pluginTypeName: string;
    pluginTypeFullName: string;
  },
  step: Record<string, unknown>,
): Record<string, unknown> {
  const messageName = String((step.sdkmessageid as Record<string, unknown>)?.name || "");
  const primaryEntity = String(
    (step.sdkmessagefilterid as Record<string, unknown>)?.primaryobjecttypecode || "none",
  );
  const stage = String(step.stage ?? "");
  const mode = String(step.mode ?? "");
  const rank = String(step.rank ?? "");
  const name = String(step.name || "");
  const key = [
    typeRecord.assemblyName,
    typeRecord.pluginTypeFullName,
    messageName,
    primaryEntity,
    stage,
    mode,
    rank,
    name,
  ].join(" | ");

  return {
    key,
    displayName: `${typeRecord.assemblyName} :: ${name} [${messageName}/${primaryEntity}]`,
    assemblyName: typeRecord.assemblyName,
    pluginTypeName: typeRecord.pluginTypeName,
    pluginTypeFullName: typeRecord.pluginTypeFullName,
    name,
    messageName,
    primaryEntity,
    stage: step.stage,
    mode: step.mode,
    rank: step.rank,
    statecode: step.statecode,
    filteringattributes: step.filteringattributes || "",
    supporteddeployment: step.supporteddeployment,
    asyncautodelete: step.asyncautodelete,
    sdkmessageprocessingstepid: step.sdkmessageprocessingstepid,
  };
}

function normalizePluginImage(
  stepRecord: Record<string, unknown>,
  image: Record<string, unknown>,
): Record<string, unknown> {
  const name = String(image.name || "");
  const imageType = String(image.imagetype ?? "");
  const alias = String(image.entityalias || "");
  const key = [String(stepRecord.key || ""), name, imageType, alias].join(" | ");

  return {
    key,
    displayName: `${stepRecord.displayName} :: ${name}`,
    assemblyName: stepRecord.assemblyName,
    pluginTypeName: stepRecord.pluginTypeName,
    stepName: stepRecord.name,
    messageName: stepRecord.messageName,
    primaryEntity: stepRecord.primaryEntity,
    stepKey: stepRecord.key,
    name,
    entityalias: image.entityalias || "",
    imagetype: image.imagetype,
    attributes: image.attributes || "",
    messagepropertyname: image.messagepropertyname || "",
  };
}
