import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";
import {
  fetchPluginImagesForSteps,
  fetchPluginStepsForTypes,
  fetchPluginTypesForAssemblies,
  type PluginClassRecord,
  type PluginImageRecord,
  type PluginStepRecord,
  type PluginTypeRecord,
} from "./plugin-inventory.js";

export interface PluginMetadataInventory {
  assemblies: Record<string, unknown>[];
  types: PluginTypeRecord[];
  pluginClasses: PluginClassRecord[];
  workflowActivities: PluginClassRecord[];
  steps: PluginStepRecord[];
  images: PluginImageRecord[];
}

export async function fetchPluginMetadata(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    solution?: string;
    includeSteps?: boolean;
    includeImages?: boolean;
  },
): Promise<PluginMetadataInventory> {
  const solutionComponents = options?.solution
    ? await fetchSolutionComponentSets(env, client, options.solution)
    : undefined;
  const allAssemblies = await client.query<Record<string, unknown>>(
    env,
    "pluginassemblies",
    listPluginAssembliesQuery(),
  );
  const assemblies = solutionComponents
    ? allAssemblies.filter((assembly) =>
        solutionComponents.pluginAssemblyIds.has(String(assembly.pluginassemblyid || "")),
      )
    : allAssemblies;
  const types = await fetchPluginTypesForAssemblies(env, client, assemblies);
  const pluginClasses = types.filter((type) => !type.isWorkflowActivity);
  const workflowActivities = types.filter((type) => type.isWorkflowActivity);
  const includeSteps = options?.includeSteps ?? true;
  const steps = includeSteps ? await fetchPluginStepsForTypes(env, client, types) : [];
  const includeImages = options?.includeImages ?? includeSteps;
  const images = includeSteps && includeImages ? await fetchPluginImagesForSteps(env, client, steps) : [];

  return {
    assemblies,
    types,
    pluginClasses,
    workflowActivities,
    steps,
    images,
  };
}

export function resolvePluginAssembly(
  assemblies: Record<string, unknown>[],
  assemblyName: string,
): Record<string, unknown> {
  const exactMatch = assemblies.find((assembly) => String(assembly.name || "") === assemblyName);
  if (exactMatch) {
    return exactMatch;
  }

  const caseInsensitiveMatches = assemblies.filter(
    (assembly) => String(assembly.name || "").toLowerCase() === assemblyName.toLowerCase(),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }
  if (caseInsensitiveMatches.length > 1) {
    throw new Error(
      `Plugin assembly '${assemblyName}' is ambiguous. Matches: ${caseInsensitiveMatches
        .map((assembly) => String(assembly.name || ""))
        .join(", ")}.`,
    );
  }

  throw new Error(`Plugin assembly '${assemblyName}' not found.`);
}

export function resolvePluginClass(
  plugins: PluginClassRecord[],
  pluginName: string,
  assemblyName?: string,
): PluginClassRecord {
  const assemblyScoped = assemblyName
    ? plugins.filter((plugin) => plugin.assemblyName === assemblyName)
    : plugins;

  if (assemblyName && assemblyScoped.length === 0) {
    throw new Error(`Plugin assembly '${assemblyName}' has no plugin classes in the current scope.`);
  }

  const resolved =
    resolveSinglePluginClass(assemblyScoped, (plugin) => plugin.fullName === pluginName) ||
    resolveSinglePluginClass(assemblyScoped, (plugin) => plugin.name === pluginName) ||
    resolveSinglePluginClass(
      assemblyScoped,
      (plugin) => plugin.fullName.toLowerCase() === pluginName.toLowerCase(),
    ) ||
    resolveSinglePluginClass(
      assemblyScoped,
      (plugin) => plugin.name.toLowerCase() === pluginName.toLowerCase(),
    ) ||
    resolveSinglePluginClass(
      assemblyScoped,
      (plugin) =>
        plugin.friendlyName.length > 0 &&
        plugin.friendlyName.toLowerCase() === pluginName.toLowerCase(),
    );

  if (resolved) {
    return resolved;
  }

  const partialMatches = uniquePluginClasses(
    assemblyScoped.filter(
      (plugin) =>
        plugin.fullName.toLowerCase().includes(pluginName.toLowerCase()) ||
        plugin.name.toLowerCase().includes(pluginName.toLowerCase()) ||
        plugin.friendlyName.toLowerCase().includes(pluginName.toLowerCase()),
    ),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Plugin '${pluginName}' is ambiguous. Matches: ${formatPluginMatches(partialMatches)}.`,
    );
  }

  throw new Error(`Plugin '${pluginName}' not found.`);
}

function resolveSinglePluginClass(
  plugins: PluginClassRecord[],
  predicate: (plugin: PluginClassRecord) => boolean,
): PluginClassRecord | null {
  const matches = uniquePluginClasses(plugins.filter(predicate));
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Plugin match is ambiguous. Matches: ${formatPluginMatches(matches)}.`);
  }
  return null;
}

function uniquePluginClasses(plugins: PluginClassRecord[]): PluginClassRecord[] {
  const seen = new Set<string>();
  const unique: PluginClassRecord[] = [];

  for (const plugin of plugins) {
    if (seen.has(plugin.key)) {
      continue;
    }
    seen.add(plugin.key);
    unique.push(plugin);
  }

  return unique;
}

function formatPluginMatches(plugins: PluginClassRecord[]): string {
  return plugins.map((plugin) => `${plugin.fullName} [${plugin.assemblyName}]`).join(", ");
}

export function groupStepsByPluginTypeId(
  steps: PluginStepRecord[],
): Map<string, PluginStepRecord[]> {
  const stepsByPluginTypeId = new Map<string, PluginStepRecord[]>();

  for (const step of steps) {
    const group = stepsByPluginTypeId.get(step.pluginTypeId) || [];
    group.push(step);
    stepsByPluginTypeId.set(step.pluginTypeId, group);
  }

  return stepsByPluginTypeId;
}

export function groupImagesByStepId(images: PluginImageRecord[]): Map<string, PluginImageRecord[]> {
  const imagesByStepId = new Map<string, PluginImageRecord[]>();

  for (const image of images) {
    const group = imagesByStepId.get(image.sdkmessageprocessingstepid) || [];
    group.push(image);
    imagesByStepId.set(image.sdkmessageprocessingstepid, group);
  }

  return imagesByStepId;
}

export function filterAssembliesByRegistration(
  assemblies: Record<string, unknown>[],
  steps: PluginStepRecord[],
  filter?: "all" | "no_steps",
): Record<string, unknown>[] {
  if (filter !== "no_steps") {
    return assemblies;
  }

  const assemblyIdsWithSteps = new Set(steps.map((step) => step.assemblyId));
  return assemblies.filter(
    (assembly) => !assemblyIdsWithSteps.has(String(assembly.pluginassemblyid || "")),
  );
}

export function filterPluginClassesByRegistration(
  plugins: PluginClassRecord[],
  steps: PluginStepRecord[],
  filter?: "all" | "no_steps",
): PluginClassRecord[] {
  if (filter !== "no_steps") {
    return plugins;
  }

  const pluginTypeIdsWithSteps = new Set(steps.map((step) => step.pluginTypeId));
  return plugins.filter((plugin) => !pluginTypeIdsWithSteps.has(plugin.pluginTypeId));
}

export function countStepsByPluginTypeId(steps: PluginStepRecord[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const step of steps) {
    counts.set(step.pluginTypeId, (counts.get(step.pluginTypeId) || 0) + 1);
  }

  return counts;
}
