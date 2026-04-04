import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { listPluginAssembliesByIdsQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesByIdsQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsByIdsQuery } from "../../queries/workflow-queries.js";
import {
  fetchSolutionInventory,
  getSolutionComponentTypeLabel,
  SOLUTION_COMPONENT_TYPE,
  type SolutionInventory,
} from "./solution-inventory.js";
import {
  fetchPluginImagesByIds,
  fetchPluginStepsByIds,
} from "../plugins/plugin-inventory.js";
import {
  dependencySelectQuery,
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../../queries/dependency-queries.js";

const TOOL_COMPONENT_TYPES = {
  plugin_assembly: SOLUTION_COMPONENT_TYPE.pluginAssembly,
  plugin_step: SOLUTION_COMPONENT_TYPE.pluginStep,
  plugin_image: SOLUTION_COMPONENT_TYPE.pluginImage,
  workflow: SOLUTION_COMPONENT_TYPE.workflow,
  web_resource: SOLUTION_COMPONENT_TYPE.webResource,
} as const;

const DEPENDENCY_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Internal",
  2: "Published",
  4: "Unpublished",
};

type DependencyDirection = "required" | "dependents" | "both";

interface NamedSolutionComponent {
  solutioncomponentid: string;
  objectid: string;
  componenttype: number;
  displayName: string;
  name: string;
  parentDisplayName?: string;
}

interface NormalizedDependencyRecord {
  direction: "required" | "dependents";
  sourceComponent: NamedSolutionComponent;
  otherComponentType: number;
  otherObjectId: string;
  otherDisplayName: string;
  otherInSolution: boolean;
  dependencyType: number;
}

export function registerGetSolutionDependencies(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_solution_dependencies",
    "Show Dataverse dependency links for supported components in one solution.",
    {
      environment: z.string().optional().describe("Environment name"),
      solution: z.string().describe("Solution display name or unique name"),
      direction: z
        .enum(["required", "dependents", "both"])
        .optional()
        .describe("Show required components, dependents, or both. Default: both"),
      componentType: z
        .enum(["plugin_assembly", "plugin_step", "plugin_image", "workflow", "web_resource"])
        .optional()
        .describe("Optional component type filter"),
      componentName: z
        .string()
        .optional()
        .describe("Optional component name or display name filter"),
      maxRows: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Max dependency rows to show. Default: 100"),
    },
    async ({ environment, solution, direction, componentType, componentName, maxRows }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchSolutionInventory(env, client, solution);
        const selectedDirection = (direction || "both") as DependencyDirection;
        const rowLimit = maxRows ?? 100;
        const allComponents = listSupportedComponents(inventory);
        const selectedComponents = selectComponents(
          allComponents,
          componentType ? TOOL_COMPONENT_TYPES[componentType] : undefined,
          componentName,
        );

        if (selectedComponents.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No supported solution components matched in '${env.name}' for solution '${solution}'.`,
              },
            ],
          };
        }

        const solutionComponentKeySet = new Set(
          inventory.components.map((component) => createComponentKey(component.componenttype, component.objectid)),
        );
        const namedComponentMap = new Map(
          allComponents.map((component) => [
            createComponentKey(component.componenttype, component.objectid),
            component.displayName,
          ]),
        );

        const dependencyRecords = deduplicateDependencyRecords(
          (
            await Promise.all(
              selectedComponents.map((component) =>
                fetchDependenciesForComponent(
                  env,
                  client,
                  component,
                  selectedDirection,
                  solutionComponentKeySet,
                  namedComponentMap,
                ),
              ),
            )
          ).flat(),
        );
        await resolveExternalSupportedComponentNames(env, client, dependencyRecords, namedComponentMap);

        const requiredCount = dependencyRecords.filter((record) => record.direction === "required").length;
        const dependentCount = dependencyRecords.filter((record) => record.direction === "dependents").length;
        const externalCount = dependencyRecords.filter((record) => !record.otherInSolution).length;

        const lines: string[] = [];
        lines.push("## Solution Dependencies");
        lines.push(`- **Environment**: ${env.name}`);
        lines.push(`- **Solution**: ${inventory.solution.friendlyname} (${inventory.solution.uniquename})`);
        lines.push(`- **Direction**: ${selectedDirection}`);
        lines.push(`- **Components Scanned**: ${selectedComponents.length}`);
        lines.push(`- **Dependency Rows**: ${dependencyRecords.length}`);
        lines.push(`- **External Links**: ${externalCount}`);

        if (componentType || componentName) {
          const activeFilters = [
            componentType ? `componentType=${componentType}` : "",
            componentName ? `componentName='${componentName}'` : "",
          ]
            .filter(Boolean)
            .join(", ");
          lines.push(`- **Filters**: ${activeFilters}`);
        }

        lines.push("");
        lines.push("### Summary");
        lines.push(
          formatTable(
            ["Direction", "Count", "External"],
            [
              ["Required", String(requiredCount), String(countDirection(dependencyRecords, "required", false))],
              [
                "Dependents",
                String(dependentCount),
                String(countDirection(dependencyRecords, "dependents", false)),
              ],
            ],
          ),
        );

        if (dependencyRecords.length === 0) {
          lines.push("");
          lines.push("No dependency rows found for the selected scope.");
          return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
        }

        const rows = dependencyRecords.slice(0, rowLimit).map((record) => [
          record.direction === "required" ? "Requires" : "Used By",
          `${record.sourceComponent.displayName} (${getSolutionComponentTypeLabel(record.sourceComponent.componenttype)})`,
          `${record.otherDisplayName} (${getSolutionComponentTypeLabel(record.otherComponentType)})`,
          record.otherInSolution ? "Yes" : "No",
          DEPENDENCY_TYPE_LABELS[record.dependencyType] || String(record.dependencyType),
        ]);

        lines.push("");
        lines.push("### Dependency Rows");
        lines.push(formatTable(["Relation", "Component", "Other Component", "In Solution", "Dependency Type"], rows));

        if (dependencyRecords.length > rowLimit) {
          lines.push("");
          lines.push(`Showing ${rowLimit} of ${dependencyRecords.length} rows.`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function listSupportedComponents(inventory: SolutionInventory): NamedSolutionComponent[] {
  const rootByKey = new Map(
    inventory.rootComponents.map((component) => [
      createComponentKey(component.componenttype, component.objectid),
      component,
    ]),
  );
  const childByKey = new Map(
    inventory.childComponents.map((component) => [
      createComponentKey(component.componenttype, component.objectid),
      component,
    ]),
  );

  return [
    ...inventory.pluginAssemblies.map((assembly) => {
      const root = rootByKey.get(
        createComponentKey(SOLUTION_COMPONENT_TYPE.pluginAssembly, String(assembly.pluginassemblyid || "")),
      );
      return {
        solutioncomponentid: String(root?.solutioncomponentid || ""),
        objectid: String(assembly.pluginassemblyid || ""),
        componenttype: SOLUTION_COMPONENT_TYPE.pluginAssembly,
        displayName: String(assembly.name || ""),
        name: String(assembly.name || ""),
      };
    }),
    ...inventory.workflows.map((workflow) => {
      const root = rootByKey.get(
        createComponentKey(SOLUTION_COMPONENT_TYPE.workflow, String(workflow.workflowid || "")),
      );
      return {
        solutioncomponentid: String(root?.solutioncomponentid || ""),
        objectid: String(workflow.workflowid || ""),
        componenttype: SOLUTION_COMPONENT_TYPE.workflow,
        displayName: String(workflow.name || workflow.uniquename || ""),
        name: String(workflow.uniquename || workflow.name || ""),
      };
    }),
    ...inventory.webResources.map((resource) => {
      const root = rootByKey.get(
        createComponentKey(SOLUTION_COMPONENT_TYPE.webResource, String(resource.webresourceid || "")),
      );
      return {
        solutioncomponentid: String(root?.solutioncomponentid || ""),
        objectid: String(resource.webresourceid || ""),
        componenttype: SOLUTION_COMPONENT_TYPE.webResource,
        displayName: String(resource.name || ""),
        name: String(resource.name || ""),
      };
    }),
    ...inventory.pluginSteps.map((step) => {
      const child = childByKey.get(
        createComponentKey(SOLUTION_COMPONENT_TYPE.pluginStep, step.sdkmessageprocessingstepid),
      );
      return {
        solutioncomponentid: String(child?.solutioncomponentid || ""),
        objectid: step.sdkmessageprocessingstepid,
        componenttype: SOLUTION_COMPONENT_TYPE.pluginStep,
        displayName: step.displayName,
        name: step.name,
        parentDisplayName: step.assemblyName,
      };
    }),
    ...inventory.pluginImages.map((image) => {
      const child = childByKey.get(
        createComponentKey(SOLUTION_COMPONENT_TYPE.pluginImage, image.sdkmessageprocessingstepimageid),
      );
      return {
        solutioncomponentid: String(child?.solutioncomponentid || ""),
        objectid: image.sdkmessageprocessingstepimageid,
        componenttype: SOLUTION_COMPONENT_TYPE.pluginImage,
        displayName: image.displayName,
        name: image.name,
        parentDisplayName: image.stepName,
      };
    }),
  ].filter((component) => Boolean(component.solutioncomponentid));
}

function selectComponents(
  components: NamedSolutionComponent[],
  componentType?: number,
  componentName?: string,
): NamedSolutionComponent[] {
  let filtered = componentType
    ? components.filter((component) => component.componenttype === componentType)
    : components;

  if (!componentName) {
    return filtered;
  }

  const needle = componentName.trim().toLowerCase();
  const exactMatches = filtered.filter(
    (component) =>
      component.name.toLowerCase() === needle || component.displayName.toLowerCase() === needle,
  );

  if (exactMatches.length === 1) {
    return exactMatches;
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Component '${componentName}' is ambiguous. Matches: ${exactMatches.map((component) => component.displayName).join(", ")}.`,
    );
  }

  filtered = filtered.filter(
    (component) =>
      component.name.toLowerCase().includes(needle) ||
      component.displayName.toLowerCase().includes(needle),
  );

  if (filtered.length > 1) {
    throw new Error(
      `Component '${componentName}' is ambiguous. Matches: ${filtered.map((component) => component.displayName).join(", ")}.`,
    );
  }

  return filtered;
}

async function fetchDependenciesForComponent(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  component: NamedSolutionComponent,
  direction: DependencyDirection,
  solutionComponentKeySet: Set<string>,
  namedComponentMap: Map<string, string>,
): Promise<NormalizedDependencyRecord[]> {
  const results: NormalizedDependencyRecord[] = [];

  if (direction === "required" || direction === "both") {
    const dependencies = await client.query<Record<string, unknown>>(
      env,
      retrieveRequiredComponentsPath(component.solutioncomponentid, component.componenttype),
      dependencySelectQuery(),
    );
    results.push(
      ...dependencies.map((dependency) =>
        normalizeDependencyRecord(
          "required",
          component,
          dependency,
          solutionComponentKeySet,
          namedComponentMap,
        ),
      ),
    );
  }

  if (direction === "dependents" || direction === "both") {
    const dependencies = await client.query<Record<string, unknown>>(
      env,
      retrieveDependentComponentsPath(component.solutioncomponentid, component.componenttype),
      dependencySelectQuery(),
    );
    results.push(
      ...dependencies.map((dependency) =>
        normalizeDependencyRecord(
          "dependents",
          component,
          dependency,
          solutionComponentKeySet,
          namedComponentMap,
        ),
      ),
    );
  }

  return results;
}

async function resolveExternalSupportedComponentNames(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  dependencyRecords: NormalizedDependencyRecord[],
  namedComponentMap: Map<string, string>,
): Promise<void> {
  const unresolved = dependencyRecords.filter(
    (record) =>
      !namedComponentMap.has(createComponentKey(record.otherComponentType, record.otherObjectId)) &&
      isSupportedComponentType(record.otherComponentType),
  );

  if (unresolved.length === 0) {
    return;
  }

  const pluginAssemblyIds = collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginAssembly);
  const workflowIds = collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.workflow);
  const webResourceIds = collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.webResource);
  const pluginStepIds = collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginStep);
  const pluginImageIds = collectDependencyIds(unresolved, SOLUTION_COMPONENT_TYPE.pluginImage);

  const [pluginAssemblies, workflows, webResources, pluginSteps, pluginImages] = await Promise.all([
    pluginAssemblyIds.length === 0
      ? Promise.resolve([])
      : client
          .query<Record<string, unknown>>(
            env,
            "pluginassemblies",
            listPluginAssembliesByIdsQuery(pluginAssemblyIds),
          )
          .then((records) =>
            records.filter((record) => pluginAssemblyIds.includes(String(record.pluginassemblyid || ""))),
          ),
    workflowIds.length === 0
      ? Promise.resolve([])
      : client
          .query<Record<string, unknown>>(env, "workflows", listWorkflowsByIdsQuery(workflowIds))
          .then((records) => records.filter((record) => workflowIds.includes(String(record.workflowid || "")))),
    webResourceIds.length === 0
      ? Promise.resolve([])
      : client
          .query<Record<string, unknown>>(env, "webresourceset", listWebResourcesByIdsQuery(webResourceIds))
          .then((records) =>
            records.filter((record) => webResourceIds.includes(String(record.webresourceid || ""))),
          ),
    fetchPluginStepsByIds(env, client, pluginStepIds),
    fetchPluginImagesByIds(env, client, pluginImageIds),
  ]);

  for (const assembly of pluginAssemblies) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.pluginAssembly, String(assembly.pluginassemblyid || "")),
      String(assembly.name || ""),
    );
  }

  for (const workflow of workflows) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.workflow, String(workflow.workflowid || "")),
      String(workflow.name || workflow.uniquename || ""),
    );
  }

  for (const resource of webResources) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.webResource, String(resource.webresourceid || "")),
      String(resource.name || ""),
    );
  }

  for (const step of pluginSteps) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.pluginStep, step.sdkmessageprocessingstepid),
      step.displayName,
    );
  }

  for (const image of pluginImages) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.pluginImage, image.sdkmessageprocessingstepimageid),
      image.displayName,
    );
  }

  for (const record of dependencyRecords) {
    const resolvedName = namedComponentMap.get(
      createComponentKey(record.otherComponentType, record.otherObjectId),
    );
    if (resolvedName) {
      record.otherDisplayName = resolvedName;
    }
  }
}

function normalizeDependencyRecord(
  direction: "required" | "dependents",
  sourceComponent: NamedSolutionComponent,
  dependency: Record<string, unknown>,
  solutionComponentKeySet: Set<string>,
  namedComponentMap: Map<string, string>,
): NormalizedDependencyRecord {
  const otherComponentType =
    direction === "required"
      ? Number(dependency.requiredcomponenttype || 0)
      : Number(dependency.dependentcomponenttype || 0);
  const otherObjectId = String(
    direction === "required"
      ? dependency.requiredcomponentobjectid || ""
      : dependency.dependentcomponentobjectid || "",
  );
  const otherKey = createComponentKey(otherComponentType, otherObjectId);

  return {
    direction,
    sourceComponent,
    otherComponentType,
    otherObjectId,
    otherDisplayName:
      namedComponentMap.get(otherKey) ||
      `${getSolutionComponentTypeLabel(otherComponentType)} ${otherObjectId}`,
    otherInSolution: solutionComponentKeySet.has(otherKey),
    dependencyType: Number(dependency.dependencytype || 0),
  };
}

function deduplicateDependencyRecords(
  records: NormalizedDependencyRecord[],
): NormalizedDependencyRecord[] {
  const seen = new Set<string>();
  const deduped: NormalizedDependencyRecord[] = [];

  for (const record of records) {
    const key = [
      record.direction,
      record.sourceComponent.solutioncomponentid,
      record.otherComponentType,
      record.otherObjectId,
      record.dependencyType,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

function collectDependencyIds(
  records: NormalizedDependencyRecord[],
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

function countDirection(
  records: NormalizedDependencyRecord[],
  direction: "required" | "dependents",
  inSolution: boolean,
): number {
  return records.filter(
    (record) => record.direction === direction && record.otherInSolution === inSolution,
  ).length;
}

function createComponentKey(componentType: number, objectId: string): string {
  return `${componentType}:${objectId}`;
}

function isSupportedComponentType(componentType: number): boolean {
  return (
    componentType === SOLUTION_COMPONENT_TYPE.pluginAssembly ||
    componentType === SOLUTION_COMPONENT_TYPE.pluginStep ||
    componentType === SOLUTION_COMPONENT_TYPE.pluginImage ||
    componentType === SOLUTION_COMPONENT_TYPE.workflow ||
    componentType === SOLUTION_COMPONENT_TYPE.webResource
  );
}
