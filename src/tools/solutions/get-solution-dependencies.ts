import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { DynamicsApiError, type DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listPluginAssembliesByIdsQuery } from "../../queries/plugin-queries.js";
import { listFormsByIdsQuery } from "../../queries/form-queries.js";
import { listSecurityRolesByIdsQuery } from "../../queries/security-queries.js";
import { listSavedViewsByIdsQuery } from "../../queries/view-queries.js";
import { listWebResourcesByIdsQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsByIdsQuery } from "../../queries/workflow-queries.js";
import {
  listAppModulesByIdsQuery,
  listConnectionReferencesByIdsQuery,
  listEnvironmentVariableDefinitionsByIdsQuery,
  listEnvironmentVariableValuesByIdsQuery,
} from "../../queries/alm-queries.js";
import {
  fetchSolutionInventory,
  getSolutionComponentTypeLabel,
  SOLUTION_COMPONENT_TYPE,
  type SolutionInventory,
} from "./solution-inventory.js";
import { fetchPluginImagesByIds, fetchPluginStepsByIds } from "../plugins/plugin-inventory.js";
import { listColumnsByMetadataIds, listTablesByMetadataIds } from "../tables/table-metadata.js";
import {
  dependencySelectQuery,
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../../queries/dependency-queries.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";

const TOOL_COMPONENT_TYPES = {
  table: SOLUTION_COMPONENT_TYPE.table,
  column: SOLUTION_COMPONENT_TYPE.column,
  security_role: SOLUTION_COMPONENT_TYPE.securityRole,
  form: SOLUTION_COMPONENT_TYPE.form,
  view: SOLUTION_COMPONENT_TYPE.view,
  workflow: SOLUTION_COMPONENT_TYPE.workflow,
  dashboard: SOLUTION_COMPONENT_TYPE.dashboard,
  web_resource: SOLUTION_COMPONENT_TYPE.webResource,
  app_module: SOLUTION_COMPONENT_TYPE.appModule,
  plugin_assembly: SOLUTION_COMPONENT_TYPE.pluginAssembly,
  plugin_step: SOLUTION_COMPONENT_TYPE.pluginStep,
  plugin_image: SOLUTION_COMPONENT_TYPE.pluginImage,
  connection_reference: SOLUTION_COMPONENT_TYPE.connectionReference,
  environment_variable_definition: SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
  environment_variable_value: SOLUTION_COMPONENT_TYPE.environmentVariableValue,
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

export interface SolutionDependencySummaryRow {
  direction: "required" | "dependents";
  sourceComponentName: string;
  sourceComponentType: string;
  otherComponentName: string;
  otherComponentType: string;
  dependencyType: string;
}

export interface SolutionDependencySummary {
  selectedComponents: number;
  counts: {
    required: number;
    dependents: number;
    external: number;
    externalRequired: number;
    externalDependents: number;
    total: number;
  };
  externalRows: SolutionDependencySummaryRow[];
}

export async function summarizeSolutionDependencies(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  solution: string,
  maxSampleRows = 10,
): Promise<SolutionDependencySummary> {
  const inventory = await fetchSolutionInventory(env, client, solution);
  const allComponents = listSupportedComponents(inventory);
  const solutionComponentKeySet = new Set(
    inventory.components.map((component) =>
      createComponentKey(component.componenttype, component.objectid),
    ),
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
        allComponents.map((component) =>
          fetchDependenciesForComponent(
            env,
            client,
            component,
            "both",
            solutionComponentKeySet,
            namedComponentMap,
          ),
        ),
      )
    ).flat(),
  );
  await resolveExternalSupportedComponentNames(env, client, dependencyRecords, namedComponentMap);

  const externalRows = dependencyRecords
    .filter((record) => !record.otherInSolution)
    .slice(0, maxSampleRows)
    .map((record) => ({
      direction: record.direction,
      sourceComponentName: record.sourceComponent.displayName,
      sourceComponentType: getSolutionComponentTypeLabel(record.sourceComponent.componenttype),
      otherComponentName: record.otherDisplayName,
      otherComponentType: getSolutionComponentTypeLabel(record.otherComponentType),
      dependencyType:
        DEPENDENCY_TYPE_LABELS[record.dependencyType] || String(record.dependencyType),
    }));

  return {
    selectedComponents: allComponents.length,
    counts: {
      required: dependencyRecords.filter((record) => record.direction === "required").length,
      dependents: dependencyRecords.filter((record) => record.direction === "dependents").length,
      external: dependencyRecords.filter((record) => !record.otherInSolution).length,
      externalRequired: countDirection(dependencyRecords, "required", false),
      externalDependents: countDirection(dependencyRecords, "dependents", false),
      total: dependencyRecords.length,
    },
    externalRows,
  };
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
        .enum([
          "table",
          "column",
          "security_role",
          "form",
          "view",
          "workflow",
          "dashboard",
          "web_resource",
          "app_module",
          "plugin_assembly",
          "plugin_step",
          "plugin_image",
          "connection_reference",
          "environment_variable_definition",
          "environment_variable_value",
        ])
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
          const text = `No supported solution components matched in '${env.name}' for solution '${solution}'.`;
          return createToolSuccessResponse("get_solution_dependencies", text, text, {
            environment: env.name,
            solution,
            direction: selectedDirection,
            filters: {
              componentType: componentType || null,
              componentName: componentName || null,
              maxRows: rowLimit,
            },
            count: 0,
            items: [],
          });
        }

        const solutionComponentKeySet = new Set(
          inventory.components.map((component) =>
            createComponentKey(component.componenttype, component.objectid),
          ),
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
        await resolveExternalSupportedComponentNames(
          env,
          client,
          dependencyRecords,
          namedComponentMap,
        );

        const requiredCount = dependencyRecords.filter(
          (record) => record.direction === "required",
        ).length;
        const dependentCount = dependencyRecords.filter(
          (record) => record.direction === "dependents",
        ).length;
        const externalCount = dependencyRecords.filter((record) => !record.otherInSolution).length;

        const lines: string[] = [];
        lines.push("## Solution Dependencies");
        lines.push(`- **Environment**: ${env.name}`);
        lines.push(
          `- **Solution**: ${inventory.solution.friendlyname} (${inventory.solution.uniquename})`,
        );
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
              [
                "Required",
                String(requiredCount),
                String(countDirection(dependencyRecords, "required", false)),
              ],
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
          return createToolSuccessResponse(
            "get_solution_dependencies",
            lines.join("\n\n"),
            `No dependency rows found for solution '${solution}' in '${env.name}'.`,
            {
              environment: env.name,
              solution,
              direction: selectedDirection,
              filters: {
                componentType: componentType || null,
                componentName: componentName || null,
                maxRows: rowLimit,
              },
              selectedComponents,
              counts: {
                required: requiredCount,
                dependents: dependentCount,
                external: externalCount,
              },
              dependencyRows: [],
            },
          );
        }

        const rows = dependencyRecords
          .slice(0, rowLimit)
          .map((record) => [
            record.direction === "required" ? "Requires" : "Used By",
            `${record.sourceComponent.displayName} (${getSolutionComponentTypeLabel(record.sourceComponent.componenttype)})`,
            `${record.otherDisplayName} (${getSolutionComponentTypeLabel(record.otherComponentType)})`,
            record.otherInSolution ? "Yes" : "No",
            DEPENDENCY_TYPE_LABELS[record.dependencyType] || String(record.dependencyType),
          ]);

        lines.push("");
        lines.push("### Dependency Rows");
        lines.push(
          formatTable(
            ["Relation", "Component", "Other Component", "In Solution", "Dependency Type"],
            rows,
          ),
        );

        if (dependencyRecords.length > rowLimit) {
          lines.push("");
          lines.push(`Showing ${rowLimit} of ${dependencyRecords.length} rows.`);
        }

        return createToolSuccessResponse(
          "get_solution_dependencies",
          lines.join("\n\n"),
          `Loaded dependency rows for solution '${solution}' in '${env.name}'.`,
          {
            environment: env.name,
            solution,
            direction: selectedDirection,
            filters: {
              componentType: componentType || null,
              componentName: componentName || null,
              maxRows: rowLimit,
            },
            selectedComponents,
            counts: {
              required: requiredCount,
              dependents: dependentCount,
              external: externalCount,
              total: dependencyRecords.length,
            },
            dependencyRows: dependencyRecords,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_solution_dependencies", error);
      }
    },
  );
}

function listSupportedComponents(inventory: SolutionInventory): NamedSolutionComponent[] {
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
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.table,
        table.metadataId,
        table.displayName ? `${table.displayName} (${table.logicalName})` : table.logicalName,
        table.logicalName,
      ),
    ),
    ...inventory.columns.map((column) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.column,
        column.metadataId,
        `${column.tableLogicalName}.${column.logicalName}`,
        `${column.tableLogicalName}.${column.logicalName}`,
        column.tableLogicalName,
      ),
    ),
    ...inventory.securityRoles.map((role) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.securityRole,
        role.roleid,
        `${role.name} [${role.businessUnitName || "-"}]`,
        role.name,
        role.businessUnitName || undefined,
      ),
    ),
    ...inventory.forms.map((form) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.form,
        String(form.formid || ""),
        `${String(form.objecttypecode || "")}/${String(form.name || "")}`,
        String(form.name || ""),
        String(form.objecttypecode || ""),
      ),
    ),
    ...inventory.views.map((view) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.view,
        String(view.savedqueryid || ""),
        `${String(view.returnedtypecode || "")}/${String(view.name || "")}`,
        String(view.name || ""),
        String(view.returnedtypecode || ""),
      ),
    ),
    ...inventory.workflows.map((workflow) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.workflow,
        String(workflow.workflowid || ""),
        String(workflow.name || workflow.uniquename || ""),
        String(workflow.uniquename || workflow.name || ""),
      ),
    ),
    ...inventory.dashboards.map((dashboard) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.dashboard,
        dashboard.formid,
        dashboard.name,
        dashboard.name,
        dashboard.objecttypecode || undefined,
      ),
    ),
    ...inventory.webResources.map((resource) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.webResource,
        String(resource.webresourceid || ""),
        String(resource.name || ""),
        String(resource.name || ""),
      ),
    ),
    ...inventory.appModules.map((app) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.appModule,
        app.appmoduleid,
        app.name,
        app.uniquename || app.name,
      ),
    ),
    ...inventory.pluginAssemblies.map((assembly) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginAssembly,
        String(assembly.pluginassemblyid || ""),
        String(assembly.name || ""),
        String(assembly.name || ""),
      ),
    ),
    ...inventory.pluginSteps.map((step) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginStep,
        step.sdkmessageprocessingstepid,
        step.displayName,
        step.name,
        step.assemblyName,
      ),
    ),
    ...inventory.pluginImages.map((image) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginImage,
        image.sdkmessageprocessingstepimageid,
        image.displayName,
        image.name,
        image.stepName,
      ),
    ),
    ...inventory.connectionReferences.map((reference) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.connectionReference,
        reference.connectionreferenceid,
        reference.displayname || reference.connectionreferencelogicalname,
        reference.connectionreferencelogicalname || reference.displayname,
      ),
    ),
    ...inventory.environmentVariableDefinitions.map((definition) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
        definition.environmentvariabledefinitionid,
        definition.schemaname,
        definition.schemaname,
      ),
    ),
    ...inventory.environmentVariableValues.map((value) =>
      createNamedComponent(
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

function createNamedComponent(
  componentByKey: Map<string, { solutioncomponentid: string }>,
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
    objectid: objectId,
    componenttype: componentType,
    displayName,
    name,
    parentDisplayName,
  };
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
    const dependencies = await queryDependenciesSafely(
      env,
      client,
      retrieveRequiredComponentsPath(component.solutioncomponentid, component.componenttype),
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
    const dependencies = await queryDependenciesSafely(
      env,
      client,
      retrieveDependentComponentsPath(component.solutioncomponentid, component.componenttype),
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

async function queryDependenciesSafely(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  resourcePath: string,
): Promise<Record<string, unknown>[]> {
  try {
    return await client.query<Record<string, unknown>>(env, resourcePath, dependencySelectQuery());
  } catch (error) {
    if (isMissingDependencyNodeError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingDependencyNodeError(error: unknown): boolean {
  return (
    error instanceof DynamicsApiError &&
    error.statusCode === 400 &&
    error.message.includes("DependencyNode") &&
    error.message.includes("Count = 0")
  );
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

  const [
    tables,
    columns,
    securityRoles,
    formsAndDashboards,
    views,
    workflows,
    webResources,
    appModules,
    pluginAssemblies,
    pluginSteps,
    pluginImages,
    connectionReferences,
    environmentVariableDefinitions,
    environmentVariableValues,
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
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.table, table.metadataId),
      table.displayName ? `${table.displayName} (${table.logicalName})` : table.logicalName,
    );
  }

  for (const column of columns) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.column, column.metadataId),
      `${column.tableLogicalName}.${column.logicalName}`,
    );
  }

  for (const role of securityRoles) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.securityRole, String(role.roleid || "")),
      `${String(role.name || "")} [${String(role.businessUnitName || "-")}]`,
    );
  }

  for (const form of formsAndDashboards.forms) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.form, String(form.formid || "")),
      `${String(form.objecttypecode || "")}/${String(form.name || "")}`,
    );
  }

  for (const dashboard of formsAndDashboards.dashboards) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.dashboard, String(dashboard.formid || "")),
      String(dashboard.name || ""),
    );
  }

  for (const view of views) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.view, String(view.savedqueryid || "")),
      `${String(view.returnedtypecode || "")}/${String(view.name || "")}`,
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

  for (const app of appModules) {
    namedComponentMap.set(
      createComponentKey(SOLUTION_COMPONENT_TYPE.appModule, String(app.appmoduleid || "")),
      String(app.name || app.uniquename || ""),
    );
  }

  for (const assembly of pluginAssemblies) {
    namedComponentMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.pluginAssembly,
        String(assembly.pluginassemblyid || ""),
      ),
      String(assembly.name || ""),
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
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.pluginImage,
        image.sdkmessageprocessingstepimageid,
      ),
      image.displayName,
    );
  }

  for (const reference of connectionReferences) {
    namedComponentMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.connectionReference,
        String(reference.connectionreferenceid || ""),
      ),
      String(reference.displayname || reference.connectionreferencelogicalname || ""),
    );
  }

  for (const definition of environmentVariableDefinitions) {
    namedComponentMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
        String(definition.environmentvariabledefinitionid || ""),
      ),
      String(definition.schemaname || ""),
    );
  }

  const definitionNameById = new Map(
    environmentVariableDefinitions.map((definition) => [
      String(definition.environmentvariabledefinitionid || ""),
      String(definition.schemaname || ""),
    ]),
  );

  for (const value of environmentVariableValues) {
    namedComponentMap.set(
      createComponentKey(
        SOLUTION_COMPONENT_TYPE.environmentVariableValue,
        String(value.environmentvariablevalueid || ""),
      ),
      `${definitionNameById.get(String(value._environmentvariabledefinitionid_value || "")) || String(value._environmentvariabledefinitionid_value || "")} value`,
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

async function resolveTables(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }

  return listTablesByMetadataIds(env, client, ids);
}

async function resolveColumns(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
  if (ids.length === 0) {
    return [];
  }

  return listColumnsByMetadataIds(env, client, ids);
}

async function resolveSecurityRoles(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
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
  env: AppConfig["environments"][number],
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

async function resolveViews(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
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

async function resolveWorkflows(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
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

async function resolveWebResources(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
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

async function resolveAppModules(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  ids: string[],
) {
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
  env: AppConfig["environments"][number],
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
  env: AppConfig["environments"][number],
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
  env: AppConfig["environments"][number],
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
  env: AppConfig["environments"][number],
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
  const otherObjectId =
    direction === "required"
      ? String(dependency.requiredcomponentobjectid || "")
      : String(dependency.dependentcomponentobjectid || "");
  const otherKey = createComponentKey(otherComponentType, otherObjectId);

  return {
    direction,
    sourceComponent,
    otherComponentType,
    otherObjectId,
    otherDisplayName: namedComponentMap.get(otherKey) || otherObjectId,
    otherInSolution: solutionComponentKeySet.has(otherKey),
    dependencyType: Number(dependency.dependencytype || 0),
  };
}

function deduplicateDependencyRecords(
  records: NormalizedDependencyRecord[],
): NormalizedDependencyRecord[] {
  const seen = new Set<string>();

  return records.filter((record) => {
    const key = [
      record.direction,
      record.sourceComponent.objectid,
      record.sourceComponent.componenttype,
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

function isSupportedComponentType(componentType: number): boolean {
  return (Object.values(TOOL_COMPONENT_TYPES) as number[]).includes(componentType);
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
