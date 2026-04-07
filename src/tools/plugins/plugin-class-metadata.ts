import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";
import {
  fetchPluginClasses,
  fetchPluginInventory,
  type PluginClassRecord,
  type PluginImageRecord,
  type PluginStepRecord,
} from "./plugin-inventory.js";

export interface PluginClassInventory {
  assemblies: Record<string, unknown>[];
  plugins: PluginClassRecord[];
  steps: PluginStepRecord[];
  images: PluginImageRecord[];
}

export async function fetchPluginClassInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    solution?: string;
  },
): Promise<PluginClassInventory> {
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
  const [plugins, assemblyInventory] = await Promise.all([
    fetchPluginClasses(env, client, assemblies),
    fetchPluginInventory(env, client, assemblies),
  ]);
  const pluginTypeIds = new Set(plugins.map((plugin) => plugin.pluginTypeId));

  return {
    assemblies,
    plugins,
    steps: assemblyInventory.steps.filter((step) => pluginTypeIds.has(step.pluginTypeId)),
    images: assemblyInventory.images.filter((image) => pluginTypeIds.has(image.pluginTypeId)),
  };
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
      (plugin) => plugin.friendlyName && plugin.friendlyName.toLowerCase() === pluginName.toLowerCase(),
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
