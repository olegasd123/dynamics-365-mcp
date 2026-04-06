import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import {
  listAppModulesQuery,
  listConnectionReferencesQuery,
  listEnvironmentVariableDefinitionsQuery,
  listEnvironmentVariableValuesQuery,
} from "../../queries/alm-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { listCloudFlows } from "../flows/flow-metadata.js";
import { fetchPluginInventory } from "../plugins/plugin-inventory.js";
import { fetchSolutionInventory } from "../solutions/solution-inventory.js";
import { listForms } from "../forms/form-metadata.js";
import { listViews } from "../views/view-metadata.js";

export function registerEnvironmentHealthReport(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "environment_health_report",
    "Build a health report for one environment or one solution in one environment.",
    {
      environment: z.string().optional().describe("Environment name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const solutionInventory = solution
          ? await fetchSolutionInventory(env, client, solution)
          : null;
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
          client.query<Record<string, unknown>>(
            env,
            "pluginassemblies",
            listPluginAssembliesQuery(),
          ),
          client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery()),
          listCloudFlows(env, client, solution ? { solution } : undefined),
          listCustomApis(env, client),
          listForms(env, client, solution ? { solution } : undefined),
          listViews(env, client, solution ? { solution, scope: "system" } : { scope: "system" }),
          client.query<Record<string, unknown>>(env, "webresourceset", listWebResourcesQuery()),
          solutionInventory
            ? Promise.resolve(solutionInventory.appModules)
            : client.query<Record<string, unknown>>(env, "appmodules", listAppModulesQuery()),
          solutionInventory
            ? Promise.resolve(solutionInventory.connectionReferences)
            : client.query<Record<string, unknown>>(
                env,
                "connectionreferences",
                listConnectionReferencesQuery(),
              ),
          solutionInventory
            ? Promise.resolve(solutionInventory.environmentVariableDefinitions)
            : client.query<Record<string, unknown>>(
                env,
                "environmentvariabledefinitions",
                listEnvironmentVariableDefinitionsQuery(),
              ),
          solutionInventory
            ? Promise.resolve(solutionInventory.environmentVariableValues)
            : client.query<Record<string, unknown>>(
                env,
                "environmentvariablevalues",
                listEnvironmentVariableValuesQuery(),
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
          (workflow) =>
            Number(workflow.category || 0) !== 5 && Number(workflow.statecode || 0) !== 1,
        );
        const riskyCloudFlows = cloudFlows.filter((flow) => flow.statecode !== 1);
        const inactiveCustomApis = customApis.filter((api) => api.statecode !== 0);
        const inactiveAppModules = scopedAppModules.filter(
          (item) => Number(item.statecode || 0) !== 0,
        );
        const riskyConnectionReferences = scopedConnectionReferences.filter(
          (item) => Number(item.statecode || 0) !== 0 || !String(item.connectionid || ""),
        );
        const missingEnvironmentVariableValues = collectMissingEnvironmentVariableValues(
          scopedEnvironmentVariableDefinitions,
          scopedEnvironmentVariableValues,
        );

        const missingComponents = solutionInventory
          ? collectMissingComponentRows(solutionInventory)
          : [];
        const unsupportedSummary = solutionInventory
          ? {
              root: solutionInventory.unsupportedRootComponents.length,
              child: solutionInventory.unsupportedChildComponents.length,
            }
          : null;

        const unmanagedCounts = {
          pluginAssemblies: scopedPluginAssemblies.filter((item) => !Boolean(item.ismanaged))
            .length,
          forms: forms.filter((item) => !item.ismanaged).length,
          views: views.filter((item) => !item.ismanaged).length,
          workflows: scopedWorkflows.filter((item) => !Boolean(item.ismanaged)).length,
          webResources: scopedWebResources.filter((item) => !Boolean(item.ismanaged)).length,
          customApis: customApis.filter((item) => !item.ismanaged).length,
          cloudFlows: cloudFlows.filter((item) => !item.ismanaged).length,
          appModules: scopedAppModules.filter((item) => !Boolean(item.ismanaged)).length,
          connectionReferences: scopedConnectionReferences.filter(
            (item) => !Boolean(item.ismanaged),
          ).length,
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
                securityRoles: solutionInventory.securityRoles.filter((item) => !item.ismanaged)
                  .length,
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

        const lines: string[] = [];
        lines.push("## Environment Health Report");
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Solution Filter: ${solution || "-"}`);
        lines.push(`- Risk Level: ${riskLevel}`);
        lines.push(`- Total Issues: ${issueCount}`);
        lines.push("");
        lines.push("### Risk Summary");
        lines.push(
          formatTable(
            ["Check", "Count"],
            [
              ["Disabled Plugin Steps", String(disabledPluginSteps.length)],
              ["Draft Or Suspended Workflows", String(riskyClassicWorkflows.length)],
              ["Inactive Cloud Flows", String(riskyCloudFlows.length)],
              ["Inactive Custom APIs", String(inactiveCustomApis.length)],
              ["Inactive App Modules", String(inactiveAppModules.length)],
              ["Risky Connection References", String(riskyConnectionReferences.length)],
              [
                "Missing Environment Variable Values",
                String(missingEnvironmentVariableValues.length),
              ],
              ["Missing Solution Components", String(missingComponents.length)],
              [
                "Unsupported Solution Components",
                String((unsupportedSummary?.root || 0) + (unsupportedSummary?.child || 0)),
              ],
            ],
          ),
        );

        lines.push("");
        lines.push("### Drift Summary");
        lines.push(
          formatTable(
            ["Area", "Unmanaged Count"],
            Object.entries(unmanagedCounts).map(([area, count]) => [toTitle(area), String(count)]),
          ),
        );

        if (disabledPluginSteps.length > 0) {
          lines.push("");
          lines.push("### Disabled Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Entity"],
              disabledPluginSteps.map((step) => [step.assemblyName, step.name, step.primaryEntity]),
            ),
          );
        }

        if (riskyClassicWorkflows.length > 0) {
          lines.push("");
          lines.push("### Draft Or Suspended Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "State"],
              riskyClassicWorkflows.map((workflow) => [
                String(workflow.name || ""),
                String(workflow.uniquename || ""),
                String(workflow.statecode || ""),
              ]),
            ),
          );
        }

        if (riskyCloudFlows.length > 0) {
          lines.push("");
          lines.push("### Inactive Cloud Flows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "State"],
              riskyCloudFlows.map((flow) => [flow.name, flow.uniquename || "-", flow.stateLabel]),
            ),
          );
        }

        if (inactiveAppModules.length > 0) {
          lines.push("");
          lines.push("### Inactive App Modules");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "State"],
              inactiveAppModules.map((item) => [
                String(item.name || ""),
                String(item.uniquename || ""),
                String(item.statecode || ""),
              ]),
            ),
          );
        }

        if (riskyConnectionReferences.length > 0) {
          lines.push("");
          lines.push("### Risky Connection References");
          lines.push(
            formatTable(
              ["Display Name", "Logical Name", "Connected", "State"],
              riskyConnectionReferences.map((item) => [
                String(item.displayname || item.connectionreferencelogicalname || ""),
                String(item.connectionreferencelogicalname || ""),
                item.connectionid ? "Yes" : "No",
                String(item.statecode || ""),
              ]),
            ),
          );
        }

        if (missingEnvironmentVariableValues.length > 0) {
          lines.push("");
          lines.push("### Missing Environment Variable Values");
          lines.push(
            formatTable(
              ["Schema Name", "Display Name", "Default Value"],
              missingEnvironmentVariableValues.map((item) => [
                String(item.schemaname || ""),
                String(item.displayname || ""),
                String(item.defaultvalue || "-"),
              ]),
            ),
          );
        }

        if (missingComponents.length > 0) {
          lines.push("");
          lines.push("### Missing Components");
          lines.push(
            formatTable(
              ["Component Type", "Missing Count"],
              missingComponents.map((row) => [row.componentType, String(row.count)]),
            ),
          );
        }

        if (unsupportedSummary) {
          lines.push("");
          lines.push("### Solution Coverage");
          lines.push(
            formatTable(
              ["Area", "Count"],
              [
                ["Unsupported Root Components", String(unsupportedSummary.root)],
                ["Unsupported Child Components", String(unsupportedSummary.child)],
              ],
            ),
          );
        }

        return createToolSuccessResponse(
          "environment_health_report",
          lines.join("\n"),
          `Built health report for '${env.name}'.`,
          {
            environment: env.name,
            solution: solution || null,
            riskLevel,
            totalIssues: issueCount,
            checks: {
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
            },
          },
        );
      } catch (error) {
        return createToolErrorResponse("environment_health_report", error);
      }
    },
  );
}

function collectMissingEnvironmentVariableValues(
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

function collectMissingComponentRows(
  inventory: Awaited<ReturnType<typeof fetchSolutionInventory>>,
) {
  const rows: Array<{ componentType: string; count: number }> = [];

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
  rows: Array<{ componentType: string; count: number }>,
  componentType: string,
  expectedCount: number,
  actualCount: number,
) {
  if (expectedCount > actualCount) {
    rows.push({ componentType, count: expectedCount - actualCount });
  }
}

function toTitle(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
