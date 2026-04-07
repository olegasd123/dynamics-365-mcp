import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { analyzeCreateTriggersData } from "./usage-analysis.js";

export function registerAnalyzeCreateTriggers(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "analyze_create_triggers",
    "Analyze what direct create triggers can run for a Dataverse table create.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z.string().describe("Table logical name, schema name, or display name"),
      providedAttributes: z
        .array(z.string())
        .optional()
        .describe("Column logical names provided during the create request"),
    },
    async ({ environment, table, providedAttributes }) => {
      try {
        const env = getEnvironment(config, environment);
        const analysis = await analyzeCreateTriggersData(
          env,
          client,
          table,
          providedAttributes || [],
        );
        const lines: string[] = [];

        lines.push(`## Create Trigger Analysis: ${analysis.tableLogicalName}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Display Name: ${analysis.tableDisplayName || "-"}`);
        lines.push(`- Provided Attributes: ${analysis.providedAttributes.join(", ") || "-"}`);
        if (analysis.warnings && analysis.warnings.length > 0) {
          lines.push(`- Warnings: ${analysis.warnings.join(" | ")}`);
        }
        lines.push(
          `- Summary: Direct Plugin Steps ${analysis.directPluginSteps.length} | Direct Workflows ${analysis.directWorkflows.length} | Related Cloud Flows ${analysis.relatedCloudFlows.length}`,
        );
        lines.push(`- Notes: ${analysis.notes.join(" | ")}`);

        if (analysis.directPluginSteps.length > 0) {
          lines.push("");
          lines.push("### Direct Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Stage", "Mode"],
              analysis.directPluginSteps.map((step) => [
                step.assemblyName,
                step.name,
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
              ["Name", "Unique Name", "Category", "Mode"],
              analysis.directWorkflows.map((workflow) => [
                workflow.name,
                workflow.uniqueName || "-",
                workflow.categoryLabel,
                workflow.modeLabel || "-",
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
          "analyze_create_triggers",
          lines.join("\n"),
          `Analyzed create triggers for table '${analysis.tableLogicalName}' in '${env.name}'.`,
          {
            environment: env.name,
            warnings: analysis.warnings || [],
            analysis,
          },
        );
      } catch (error) {
        return createToolErrorResponse("analyze_create_triggers", error);
      }
    },
  );
}
