import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { analyzeUpdateTriggersData } from "./usage-analysis.js";

export function registerAnalyzeUpdateTriggers(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "analyze_update_triggers",
    "Analyze what direct update triggers can run for a Dataverse table change.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z.string().describe("Table logical name, schema name, or display name"),
      changedAttributes: z
        .array(z.string())
        .min(1)
        .describe("Changed column logical names from the initial update request"),
    },
    async ({ environment, table, changedAttributes }) => {
      try {
        const env = getEnvironment(config, environment);
        const analysis = await analyzeUpdateTriggersData(env, client, table, changedAttributes);
        const lines: string[] = [];

        lines.push(`## Update Trigger Analysis: ${analysis.tableLogicalName}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Display Name: ${analysis.tableDisplayName || "-"}`);
        lines.push(`- Changed Attributes: ${analysis.changedAttributes.join(", ")}`);
        if (analysis.warnings && analysis.warnings.length > 0) {
          lines.push(`- Warnings: ${analysis.warnings.join(" | ")}`);
        }
        lines.push(
          `- Summary: Direct Plugin Steps ${analysis.directPluginSteps.length} | Direct Workflows ${analysis.directWorkflows.length} | System-Managed Plugin Steps ${analysis.systemManagedPluginSteps.length} | System-Managed Workflows ${analysis.systemManagedWorkflows.length} | Related Cloud Flows ${analysis.relatedCloudFlows.length}`,
        );
        lines.push(`- Notes: ${analysis.notes.join(" | ")}`);

        if (analysis.directPluginSteps.length > 0) {
          lines.push("");
          lines.push("### Direct Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Filtering", "Match", "Stage", "Mode"],
              analysis.directPluginSteps.map((step) => [
                step.assemblyName,
                step.name,
                step.filteringAttributes || "(all update attributes)",
                step.matchType === "all_updates"
                  ? "All update attributes"
                  : step.matchedAttributes.join(", "),
                step.stageLabel || "-",
                step.modeLabel || "-",
              ]),
            ),
          );
        }

        if (analysis.directWorkflows.length > 0) {
          lines.push("");
          lines.push("### Direct Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Category", "Mode", "Trigger Attributes", "Match"],
              analysis.directWorkflows.map((workflow) => [
                workflow.name,
                workflow.uniqueName || "-",
                workflow.categoryLabel,
                workflow.modeLabel || "-",
                workflow.triggerAttributes || "-",
                workflow.matchedAttributes.join(", "),
              ]),
            ),
          );
        }

        if (
          analysis.systemManagedPluginSteps.length > 0 ||
          analysis.systemManagedWorkflows.length > 0
        ) {
          lines.push("");
          lines.push("### System-Managed Column Matches");
          lines.push(
            "These registrations mention modifiedon or modifiedby. They are shown separately because those columns are usually not part of the initial update request.",
          );
        }

        if (analysis.systemManagedPluginSteps.length > 0) {
          lines.push("");
          lines.push("#### Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Filtering", "System-Managed Columns", "Stage", "Mode"],
              analysis.systemManagedPluginSteps.map((step) => [
                step.assemblyName,
                step.name,
                step.filteringAttributes || "(all update attributes)",
                step.systemManagedAttributes.join(", "),
                step.stageLabel || "-",
                step.modeLabel || "-",
              ]),
            ),
          );
        }

        if (analysis.systemManagedWorkflows.length > 0) {
          lines.push("");
          lines.push("#### Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Category", "Mode", "Trigger Attributes", "System-Managed Columns"],
              analysis.systemManagedWorkflows.map((workflow) => [
                workflow.name,
                workflow.uniqueName || "-",
                workflow.categoryLabel,
                workflow.modeLabel || "-",
                workflow.triggerAttributes || "-",
                workflow.systemManagedAttributes.join(", "),
              ]),
            ),
          );
        }

        if (analysis.relatedCloudFlows.length > 0) {
          lines.push("");
          lines.push("### Related Cloud Flows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Triggers", "Matched Attributes", "Reason"],
              analysis.relatedCloudFlows.map((flow) => [
                flow.name,
                flow.uniqueName || "-",
                flow.triggerNames.join(", ") || "-",
                flow.matchedAttributes.join(", ") || "-",
                flow.reason,
              ]),
            ),
          );
        }

        return createToolSuccessResponse(
          "analyze_update_triggers",
          lines.join("\n"),
          `Analyzed update triggers for table '${analysis.tableLogicalName}' in '${env.name}'.`,
          {
            environment: env.name,
            warnings: analysis.warnings || [],
            analysis,
          },
        );
      } catch (error) {
        return createToolErrorResponse("analyze_update_triggers", error);
      }
    },
  );
}
