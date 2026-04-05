import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
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
        const [
          pluginAssemblies,
          workflows,
          cloudFlows,
          customApis,
          forms,
          views,
          webResources,
          solutionInventory,
        ] = await Promise.all([
          client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
          client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery()),
          listCloudFlows(env, client, solution ? { solution } : undefined),
          listCustomApis(env, client),
          listForms(env, client, solution ? { solution } : undefined),
          listViews(env, client, solution ? { solution, scope: "system" } : { scope: "system" }),
          client.query<Record<string, unknown>>(env, "webresourceset", listWebResourcesQuery()),
          solution ? fetchSolutionInventory(env, client, solution) : Promise.resolve(null),
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
        const pluginInventory = await fetchPluginInventory(env, client, scopedPluginAssemblies);

        const disabledPluginSteps = pluginInventory.steps.filter((step) => Number(step.statecode || 0) !== 0);
        const riskyClassicWorkflows = scopedWorkflows.filter(
          (workflow) =>
            Number(workflow.category || 0) !== 5 && Number(workflow.statecode || 0) !== 1,
        );
        const riskyCloudFlows = cloudFlows.filter((flow) => flow.statecode !== 1);
        const inactiveCustomApis = customApis.filter((api) => api.statecode !== 0);

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
        };

        const issueCount =
          disabledPluginSteps.length +
          riskyClassicWorkflows.length +
          riskyCloudFlows.length +
          inactiveCustomApis.length +
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
            [
              ["Plugin Assemblies", String(unmanagedCounts.pluginAssemblies)],
              ["Forms", String(unmanagedCounts.forms)],
              ["Views", String(unmanagedCounts.views)],
              ["Workflows", String(unmanagedCounts.workflows)],
              ["Web Resources", String(unmanagedCounts.webResources)],
              ["Custom APIs", String(unmanagedCounts.customApis)],
              ["Cloud Flows", String(unmanagedCounts.cloudFlows)],
            ],
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

        return createToolSuccessResponse("environment_health_report", lines.join("\n"), `Built health report for '${env.name}'.`, {
          environment: env.name,
          solution: solution || null,
          riskLevel,
          totalIssues: issueCount,
          checks: {
            disabledPluginSteps,
            riskyClassicWorkflows,
            riskyCloudFlows,
            inactiveCustomApis,
            missingComponents,
            unsupportedSummary,
            unmanagedCounts,
          },
        });
      } catch (error) {
        return createToolErrorResponse("environment_health_report", error);
      }
    },
  );
}

function collectMissingComponentRows(inventory: Awaited<ReturnType<typeof fetchSolutionInventory>>) {
  const rows: Array<{ componentType: string; count: number }> = [];

  addMissingRow(rows, "Plugin Assemblies", inventory.pluginAssemblyIds.size, inventory.pluginAssemblies.length);
  addMissingRow(rows, "Forms", inventory.formIds.size, inventory.forms.length);
  addMissingRow(rows, "Views", inventory.viewIds.size, inventory.views.length);
  addMissingRow(rows, "Workflows", inventory.workflowIds.size, inventory.workflows.length);
  addMissingRow(rows, "Web Resources", inventory.webResourceIds.size, inventory.webResources.length);
  addMissingRow(rows, "Plugin Steps", inventory.pluginStepIds.size, inventory.pluginSteps.length);
  addMissingRow(rows, "Plugin Images", inventory.pluginImageIds.size, inventory.pluginImages.length);

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
