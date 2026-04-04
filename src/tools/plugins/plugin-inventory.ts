import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPluginAssembliesByIdsQuery,
  listPluginImagesByIdsQuery,
  listPluginImagesForStepsQuery,
  listPluginStepsByIdsQuery,
  listPluginStepsForPluginTypesQuery,
  listPluginTypesByIdsQuery,
  listPluginTypesForAssembliesQuery,
} from "../../queries/plugin-queries.js";

const BULK_QUERY_CHUNK_SIZE = 25;

interface PluginTypeRecord {
  assemblyId: string;
  assemblyName: string;
  pluginTypeId: string;
  pluginTypeName: string;
  pluginTypeFullName: string;
}

export interface PluginStepRecord extends Record<string, unknown> {
  key: string;
  displayName: string;
  assemblyId: string;
  assemblyName: string;
  pluginTypeId: string;
  pluginTypeName: string;
  pluginTypeFullName: string;
  name: string;
  messageName: string;
  primaryEntity: string;
  sdkmessageprocessingstepid: string;
}

export interface PluginImageRecord extends Record<string, unknown> {
  key: string;
  displayName: string;
  assemblyId: string;
  assemblyName: string;
  pluginTypeId: string;
  pluginTypeName: string;
  sdkmessageprocessingstepid: string;
  sdkmessageprocessingstepimageid: string;
  stepName: string;
  stepKey: string;
  name: string;
}

export async function fetchPluginSteps(
  env: EnvironmentConfig,
  client: DynamicsClient,
  assemblies: Record<string, unknown>[],
): Promise<PluginStepRecord[]> {
  if (assemblies.length === 0) {
    return [];
  }

  const assemblyMap = new Map(
    assemblies.map((assembly) => [String(assembly.pluginassemblyid || ""), String(assembly.name || "")]),
  );
  const assemblyIds = assemblies
    .map((assembly) => String(assembly.pluginassemblyid || ""))
    .filter(Boolean);

  const pluginTypes = (
    await Promise.all(
      chunkValues(assemblyIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "plugintypes",
          listPluginTypesForAssembliesQuery(chunk),
        ),
      ),
    )
  ).flat();

  if (pluginTypes.length === 0) {
    return [];
  }

  const typeRecords = pluginTypes.map((type) => normalizePluginType(type, assemblyMap));
  const typeMap = new Map(typeRecords.map((type) => [type.pluginTypeId, type]));
  const pluginTypeIds = typeRecords.map((type) => type.pluginTypeId).filter(Boolean);

  const steps = (
    await Promise.all(
      chunkValues(pluginTypeIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingsteps",
          listPluginStepsForPluginTypesQuery(chunk),
        ),
      ),
    )
  ).flat();

  return steps
    .map((step) => normalizePluginStep(typeMap.get(String(step._eventhandler_value || "")), step))
    .filter((step): step is PluginStepRecord => step !== null);
}

export async function fetchPluginInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  assemblies: Record<string, unknown>[],
): Promise<{
  steps: PluginStepRecord[];
  images: PluginImageRecord[];
}> {
  const steps = await fetchPluginSteps(env, client, assemblies);

  if (steps.length === 0) {
    return { steps, images: [] };
  }

  const stepMap = new Map(steps.map((step) => [step.sdkmessageprocessingstepid, step]));
  const stepIds = steps.map((step) => step.sdkmessageprocessingstepid).filter(Boolean);
  const images = (
    await Promise.all(
      chunkValues(stepIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingstepimages",
          listPluginImagesForStepsQuery(chunk),
        ),
      ),
    )
  ).flat();

  return {
    steps,
    images: images
      .map((image) =>
        normalizePluginImage(stepMap.get(String(image._sdkmessageprocessingstepid_value || "")), image),
      )
      .filter((image): image is PluginImageRecord => image !== null),
  };
}

export async function fetchPluginStepsByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  stepIds: string[],
): Promise<PluginStepRecord[]> {
  const uniqueStepIds = [...new Set(stepIds.filter(Boolean))];

  if (uniqueStepIds.length === 0) {
    return [];
  }

  const steps = (
    await Promise.all(
      chunkValues(uniqueStepIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingsteps",
          listPluginStepsByIdsQuery(chunk),
        ),
      ),
    )
  )
    .flat()
    .filter((step) => uniqueStepIds.includes(String(step.sdkmessageprocessingstepid || "")));

  if (steps.length === 0) {
    return [];
  }

  const pluginTypeIds = [...new Set(steps.map((step) => String(step._eventhandler_value || "")).filter(Boolean))];
  const pluginTypes = (
    await Promise.all(
      chunkValues(pluginTypeIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "plugintypes",
          listPluginTypesByIdsQuery(chunk),
        ),
      ),
    )
  )
    .flat()
    .filter((type) => pluginTypeIds.includes(String(type.plugintypeid || "")));

  if (pluginTypes.length === 0) {
    return [];
  }

  const assemblyIds = [
    ...new Set(pluginTypes.map((type) => String(type._pluginassemblyid_value || "")).filter(Boolean)),
  ];
  const assemblies = (
    await Promise.all(
      chunkValues(assemblyIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          listPluginAssembliesByIdsQuery(chunk),
        ),
      ),
    )
  )
    .flat()
    .filter((assembly) => assemblyIds.includes(String(assembly.pluginassemblyid || "")));

  const assemblyMap = new Map(
    assemblies.map((assembly) => [String(assembly.pluginassemblyid || ""), String(assembly.name || "")]),
  );
  const typeRecords = pluginTypes.map((type) => normalizePluginType(type, assemblyMap));
  const typeMap = new Map(typeRecords.map((type) => [type.pluginTypeId, type]));

  return steps
    .map((step) => normalizePluginStep(typeMap.get(String(step._eventhandler_value || "")), step))
    .filter((step): step is PluginStepRecord => step !== null);
}

export async function fetchPluginImagesByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  imageIds: string[],
): Promise<PluginImageRecord[]> {
  const uniqueImageIds = [...new Set(imageIds.filter(Boolean))];

  if (uniqueImageIds.length === 0) {
    return [];
  }

  const images = (
    await Promise.all(
      chunkValues(uniqueImageIds).map((chunk) =>
        client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingstepimages",
          listPluginImagesByIdsQuery(chunk),
        ),
      ),
    )
  )
    .flat()
    .filter((image) => uniqueImageIds.includes(String(image.sdkmessageprocessingstepimageid || "")));

  if (images.length === 0) {
    return [];
  }

  const steps = await fetchPluginStepsByIds(
    env,
    client,
    images.map((image) => String(image._sdkmessageprocessingstepid_value || "")),
  );
  const stepMap = new Map(steps.map((step) => [step.sdkmessageprocessingstepid, step]));

  return images
    .map((image) =>
      normalizePluginImage(stepMap.get(String(image._sdkmessageprocessingstepid_value || "")), image),
    )
    .filter((image): image is PluginImageRecord => image !== null);
}

function normalizePluginType(
  type: Record<string, unknown>,
  assemblyMap: Map<string, string>,
): PluginTypeRecord {
  const assemblyId = String(type._pluginassemblyid_value || "");

  return {
    assemblyId,
    assemblyName: assemblyMap.get(assemblyId) || "(unknown assembly)",
    pluginTypeId: String(type.plugintypeid || ""),
    pluginTypeName: String(type.name || ""),
    pluginTypeFullName: String(type.typename || ""),
  };
}

function normalizePluginStep(
  typeRecord: PluginTypeRecord | undefined,
  step: Record<string, unknown>,
): PluginStepRecord | null {
  if (!typeRecord) {
    return null;
  }

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
    assemblyId: typeRecord.assemblyId,
    assemblyName: typeRecord.assemblyName,
    pluginTypeId: typeRecord.pluginTypeId,
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
    sdkmessageprocessingstepid: String(step.sdkmessageprocessingstepid || ""),
  };
}

function normalizePluginImage(
  stepRecord: PluginStepRecord | undefined,
  image: Record<string, unknown>,
): PluginImageRecord | null {
  if (!stepRecord) {
    return null;
  }

  const name = String(image.name || "");
  const imageType = String(image.imagetype ?? "");
  const alias = String(image.entityalias || "");
  const key = [stepRecord.key, name, imageType, alias].join(" | ");

  return {
    key,
    displayName: `${stepRecord.displayName} :: ${name}`,
    assemblyId: stepRecord.assemblyId,
    assemblyName: stepRecord.assemblyName,
    pluginTypeId: stepRecord.pluginTypeId,
    pluginTypeName: stepRecord.pluginTypeName,
    sdkmessageprocessingstepid: stepRecord.sdkmessageprocessingstepid,
    sdkmessageprocessingstepimageid: String(image.sdkmessageprocessingstepimageid || ""),
    stepName: stepRecord.name,
    stepKey: stepRecord.key,
    messageName: stepRecord.messageName,
    primaryEntity: stepRecord.primaryEntity,
    name,
    entityalias: image.entityalias || "",
    imagetype: image.imagetype,
    attributes: image.attributes || "",
    messagepropertyname: image.messagepropertyname || "",
  };
}

function chunkValues(values: string[], size = BULK_QUERY_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
