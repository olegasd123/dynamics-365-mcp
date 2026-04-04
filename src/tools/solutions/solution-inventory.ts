import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listSolutionsQuery, listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";

export const SOLUTION_COMPONENT_TYPE = {
  workflow: 29,
  webResource: 61,
  pluginAssembly: 91,
} as const;

const COMPONENT_TYPE_LABELS: Record<number, string> = {
  29: "Workflow",
  61: "Web Resource",
  91: "Plugin Assembly",
};

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

export interface SolutionComponentSets {
  solution: SolutionRecord;
  components: SolutionComponentRecord[];
  rootComponents: SolutionComponentRecord[];
  childComponents: SolutionComponentRecord[];
  pluginAssemblyIds: Set<string>;
  workflowIds: Set<string>;
  webResourceIds: Set<string>;
  unsupportedRootComponents: SolutionComponentRecord[];
}

export interface SolutionInventory extends SolutionComponentSets {
  pluginAssemblies: Record<string, unknown>[];
  workflows: Record<string, unknown>[];
  webResources: Record<string, unknown>[];
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
        solution.uniquename.toLowerCase() === needle || solution.friendlyname.toLowerCase() === needle,
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

  const pluginAssemblyIds = collectObjectIds(
    rootComponents,
    SOLUTION_COMPONENT_TYPE.pluginAssembly,
  );
  const workflowIds = collectObjectIds(rootComponents, SOLUTION_COMPONENT_TYPE.workflow);
  const webResourceIds = collectObjectIds(rootComponents, SOLUTION_COMPONENT_TYPE.webResource);

  return {
    solution,
    components,
    rootComponents,
    childComponents,
    pluginAssemblyIds,
    workflowIds,
    webResourceIds,
    unsupportedRootComponents: rootComponents.filter(
      (component) =>
        component.componenttype !== SOLUTION_COMPONENT_TYPE.pluginAssembly &&
        component.componenttype !== SOLUTION_COMPONENT_TYPE.workflow &&
        component.componenttype !== SOLUTION_COMPONENT_TYPE.webResource,
    ),
  };
}

export async function fetchSolutionInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<SolutionInventory> {
  const componentSets = await fetchSolutionComponentSets(env, client, solutionRef);

  const [pluginAssemblies, workflows, webResources] = await Promise.all([
    fetchRecordsByIds(
      env,
      client,
      "pluginassemblies",
      listPluginAssembliesQuery(),
      "pluginassemblyid",
      componentSets.pluginAssemblyIds,
    ),
    fetchRecordsByIds(
      env,
      client,
      "workflows",
      listWorkflowsQuery(),
      "workflowid",
      componentSets.workflowIds,
    ),
    fetchRecordsByIds(
      env,
      client,
      "webresourceset",
      listWebResourcesQuery(),
      "webresourceid",
      componentSets.webResourceIds,
    ),
  ]);

  return {
    ...componentSets,
    pluginAssemblies,
    workflows,
    webResources,
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
  queryParams: string,
  idField: string,
  ids: Set<string>,
): Promise<Record<string, unknown>[]> {
  if (ids.size === 0) {
    return [];
  }

  const records = await client.query<Record<string, unknown>>(env, entitySet, queryParams);
  return records.filter((record) => ids.has(String(record[idField] || "")));
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
