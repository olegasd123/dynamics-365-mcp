import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { EnvironmentConfig } from "../../config/types.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import {
  listAppModulesQuery,
  listConnectionReferencesQuery,
  listEnvironmentVariableDefinitionsQuery,
  listEnvironmentVariableValuesQuery,
} from "../../queries/alm-queries.js";
import { listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { listCloudFlows } from "../flows/flow-metadata.js";
import { listForms } from "../forms/form-metadata.js";
import { fetchPluginInventory } from "../plugins/plugin-inventory.js";
import { fetchSolutionInventory } from "../solutions/solution-inventory.js";
import { listViews } from "../views/view-metadata.js";

export interface MissingComponentRow {
  componentType: string;
  count: number;
}

export interface UnsupportedSummary {
  root: number;
  child: number;
}

export interface ReleaseHealthAnalysis {
  environment: string;
  solution: string | null;
  solutionInventory: Awaited<ReturnType<typeof fetchSolutionInventory>> | null;
  disabledPluginSteps: Array<Record<string, unknown>>;
  riskyClassicWorkflows: Array<Record<string, unknown>>;
  riskyCloudFlows: Array<Record<string, unknown>>;
  inactiveCustomApis: Array<Record<string, unknown>>;
  inactiveAppModules: Array<Record<string, unknown>>;
  riskyConnectionReferences: Array<Record<string, unknown>>;
  missingEnvironmentVariableValues: Array<Record<string, unknown>>;
  missingComponents: MissingComponentRow[];
  unsupportedSummary: UnsupportedSummary | null;
  unmanagedCounts: Record<string, number>;
  issueCount: number;
  riskLevel: "Healthy" | "Warning" | "High Risk";
}

export async function analyzeReleaseHealth(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solution?: string,
): Promise<ReleaseHealthAnalysis> {
  const solutionInventory = solution ? await fetchSolutionInventory(env, client, solution) : null;
  const [
    pluginAssemblies,
    workflows,
    cloudFlows,
    customApis,
    forms,
    views,
    webResources,
    appModules,
    connectionReferences,
    environmentVariableDefinitions,
    environmentVariableValues,
  ] = await Promise.all([
    client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery(), {
      cacheTier: CACHE_TIERS.VOLATILE,
    }),
    client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery(), {
      cacheTier: CACHE_TIERS.VOLATILE,
    }),
    listCloudFlows(env, client, solution ? { solution } : undefined),
    listCustomApis(env, client),
    listForms(env, client, solution ? { solution } : undefined),
    listViews(env, client, solution ? { solution, scope: "system" } : { scope: "system" }),
    client.query<Record<string, unknown>>(env, "webresourceset", listWebResourcesQuery(), {
      cacheTier: CACHE_TIERS.VOLATILE,
    }),
    solutionInventory
      ? Promise.resolve(solutionInventory.appModules)
      : client.query<Record<string, unknown>>(env, "appmodules", listAppModulesQuery(), {
          cacheTier: CACHE_TIERS.VOLATILE,
        }),
    solutionInventory
      ? Promise.resolve(solutionInventory.connectionReferences)
      : client.query<Record<string, unknown>>(
          env,
          "connectionreferences",
          listConnectionReferencesQuery(),
          { cacheTier: CACHE_TIERS.VOLATILE },
        ),
    solutionInventory
      ? Promise.resolve(solutionInventory.environmentVariableDefinitions)
      : client.query<Record<string, unknown>>(
          env,
          "environmentvariabledefinitions",
          listEnvironmentVariableDefinitionsQuery(),
          { cacheTier: CACHE_TIERS.VOLATILE },
        ),
    solutionInventory
      ? Promise.resolve(solutionInventory.environmentVariableValues)
      : client.query<Record<string, unknown>>(
          env,
          "environmentvariablevalues",
          listEnvironmentVariableValuesQuery(),
          { cacheTier: CACHE_TIERS.VOLATILE },
        ),
  ]);

  const scopedPluginAssemblies = solutionInventory
    ? pluginAssemblies.filter((assembly) =>
        solutionInventory.pluginAssemblyIds.has(String(assembly.pluginassemblyid || "")),
      )
    : pluginAssemblies;
  const scopedWorkflows = solutionInventory
    ? workflows.filter((workflow) =>
        solutionInventory.workflowIds.has(String(workflow.workflowid || "")),
      )
    : workflows;
  const scopedWebResources = solutionInventory
    ? webResources.filter((resource) =>
        solutionInventory.webResourceIds.has(String(resource.webresourceid || "")),
      )
    : webResources;
  const scopedAppModules = solutionInventory ? solutionInventory.appModules : appModules;
  const scopedConnectionReferences = solutionInventory
    ? solutionInventory.connectionReferences
    : connectionReferences;
  const scopedEnvironmentVariableDefinitions = solutionInventory
    ? solutionInventory.environmentVariableDefinitions
    : environmentVariableDefinitions;
  const scopedEnvironmentVariableValues = solutionInventory
    ? solutionInventory.environmentVariableValues
    : environmentVariableValues;
  const pluginInventory = await fetchPluginInventory(env, client, scopedPluginAssemblies);

  const disabledPluginSteps = pluginInventory.steps.filter(
    (step) => Number(step.statecode || 0) !== 0,
  );
  const riskyClassicWorkflows = scopedWorkflows.filter(
    (workflow) => Number(workflow.category || 0) !== 5 && Number(workflow.statecode || 0) !== 1,
  );
  const riskyCloudFlows = cloudFlows.filter((flow) => flow.statecode !== 1);
  const inactiveCustomApis = customApis.filter((api) => api.statecode !== 0);
  const inactiveAppModules = scopedAppModules.filter((item) => Number(item.statecode || 0) !== 0);
  const riskyConnectionReferences = scopedConnectionReferences.filter(
    (item) => Number(item.statecode || 0) !== 0 || !String(item.connectionid || ""),
  );
  const missingEnvironmentVariableValues = collectMissingEnvironmentVariableValues(
    scopedEnvironmentVariableDefinitions,
    scopedEnvironmentVariableValues,
  );

  const missingComponents = solutionInventory ? collectMissingComponentRows(solutionInventory) : [];
  const unsupportedSummary = solutionInventory
    ? {
        root: solutionInventory.unsupportedRootComponents.length,
        child: solutionInventory.unsupportedChildComponents.length,
      }
    : null;

  const unmanagedCounts = {
    pluginAssemblies: scopedPluginAssemblies.filter((item) => !Boolean(item.ismanaged)).length,
    forms: forms.filter((item) => !item.ismanaged).length,
    views: views.filter((item) => !item.ismanaged).length,
    workflows: scopedWorkflows.filter((item) => !Boolean(item.ismanaged)).length,
    webResources: scopedWebResources.filter((item) => !Boolean(item.ismanaged)).length,
    customApis: customApis.filter((item) => !item.ismanaged).length,
    cloudFlows: cloudFlows.filter((item) => !item.ismanaged).length,
    appModules: scopedAppModules.filter((item) => !Boolean(item.ismanaged)).length,
    connectionReferences: scopedConnectionReferences.filter((item) => !Boolean(item.ismanaged))
      .length,
    environmentVariableDefinitions: scopedEnvironmentVariableDefinitions.filter(
      (item) => !Boolean(item.ismanaged),
    ).length,
    environmentVariableValues: scopedEnvironmentVariableValues.filter(
      (item) => !Boolean(item.ismanaged),
    ).length,
    ...(solutionInventory
      ? {
          tables: solutionInventory.tables.filter((item) => !item.isManaged).length,
          columns: solutionInventory.columns.filter((item) => item.isCustomAttribute).length,
          securityRoles: solutionInventory.securityRoles.filter((item) => !item.ismanaged).length,
          dashboards: solutionInventory.dashboards.filter((item) => !item.ismanaged).length,
        }
      : {}),
  };

  const issueCount =
    disabledPluginSteps.length +
    riskyClassicWorkflows.length +
    riskyCloudFlows.length +
    inactiveCustomApis.length +
    inactiveAppModules.length +
    riskyConnectionReferences.length +
    missingEnvironmentVariableValues.length +
    missingComponents.length +
    (unsupportedSummary ? unsupportedSummary.root + unsupportedSummary.child : 0);
  const riskLevel = issueCount === 0 ? "Healthy" : issueCount <= 5 ? "Warning" : "High Risk";

  return {
    environment: env.name,
    solution: solution || null,
    solutionInventory,
    disabledPluginSteps,
    riskyClassicWorkflows,
    riskyCloudFlows,
    inactiveCustomApis,
    inactiveAppModules,
    riskyConnectionReferences,
    missingEnvironmentVariableValues,
    missingComponents,
    unsupportedSummary,
    unmanagedCounts,
    issueCount,
    riskLevel,
  };
}

export function collectMissingEnvironmentVariableValues(
  definitions: Array<Record<string, unknown>>,
  values: Array<Record<string, unknown>>,
) {
  const valueDefinitionIds = new Set(
    values.map((item) =>
      String(
        item.environmentvariabledefinitionid || item._environmentvariabledefinitionid_value || "",
      ),
    ),
  );

  return definitions.filter(
    (definition) =>
      !valueDefinitionIds.has(String(definition.environmentvariabledefinitionid || "")),
  );
}

export function collectMissingComponentRows(
  inventory: Awaited<ReturnType<typeof fetchSolutionInventory>>,
): MissingComponentRow[] {
  const rows: MissingComponentRow[] = [];

  addMissingRow(rows, "Tables", inventory.tableIds.size, inventory.tables.length);
  addMissingRow(rows, "Columns", inventory.columnIds.size, inventory.columns.length);
  addMissingRow(
    rows,
    "Security Roles",
    inventory.securityRoleIds.size,
    inventory.securityRoles.length,
  );
  addMissingRow(rows, "Forms", inventory.formIds.size, inventory.forms.length);
  addMissingRow(rows, "Views", inventory.viewIds.size, inventory.views.length);
  addMissingRow(rows, "Workflows", inventory.workflowIds.size, inventory.workflows.length);
  addMissingRow(rows, "Dashboards", inventory.dashboardIds.size, inventory.dashboards.length);
  addMissingRow(
    rows,
    "Web Resources",
    inventory.webResourceIds.size,
    inventory.webResources.length,
  );
  addMissingRow(rows, "App Modules", inventory.appModuleIds.size, inventory.appModules.length);
  addMissingRow(
    rows,
    "Connection References",
    inventory.connectionReferenceIds.size,
    inventory.connectionReferences.length,
  );
  addMissingRow(
    rows,
    "Environment Variable Definitions",
    inventory.environmentVariableDefinitionIds.size,
    inventory.environmentVariableDefinitions.length,
  );
  addMissingRow(
    rows,
    "Environment Variable Values",
    inventory.environmentVariableValueIds.size,
    inventory.environmentVariableValues.length,
  );
  addMissingRow(
    rows,
    "Plugin Assemblies",
    inventory.pluginAssemblyIds.size,
    inventory.pluginAssemblies.length,
  );
  addMissingRow(rows, "Plugin Steps", inventory.pluginStepIds.size, inventory.pluginSteps.length);
  addMissingRow(
    rows,
    "Plugin Images",
    inventory.pluginImageIds.size,
    inventory.pluginImages.length,
  );

  return rows;
}

function addMissingRow(
  rows: MissingComponentRow[],
  componentType: string,
  expectedCount: number,
  actualCount: number,
) {
  if (expectedCount > actualCount) {
    rows.push({ componentType, count: expectedCount - actualCount });
  }
}

export function toTitle(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
