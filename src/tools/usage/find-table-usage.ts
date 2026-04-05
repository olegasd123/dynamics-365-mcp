import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { findTableUsageData } from "./usage-analysis.js";

export function registerFindTableUsage(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "find_table_usage",
    "Find where one Dataverse table is used across metadata assets.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z.string().describe("Table logical name, schema name, or display name"),
    },
    async ({ environment, table }) => {
      try {
        const env = getEnvironment(config, environment);
        const usage = await findTableUsageData(env, client, table);
        const lines: string[] = [];

        lines.push(`## Table Usage: ${usage.tableLogicalName}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Display Name: ${usage.tableDisplayName || "-"}`);
        lines.push(
          `- Summary: Plugin Steps ${usage.pluginSteps.length} | Workflows ${usage.workflows.length} | Forms ${usage.forms.length} | Views ${usage.views.length} | Custom APIs ${usage.customApis.length} | Cloud Flows ${usage.cloudFlows.length} | Relationships ${usage.relationships.length}`,
        );

        if (usage.pluginSteps.length > 0) {
          lines.push("");
          lines.push("### Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Message"],
              usage.pluginSteps.map((step) => [step.assemblyName, step.name, step.messageName]),
            ),
          );
        }

        if (usage.workflows.length > 0) {
          lines.push("");
          lines.push("### Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Category"],
              usage.workflows.map((workflow) => [
                workflow.name,
                workflow.uniqueName || "-",
                String(workflow.category),
              ]),
            ),
          );
        }

        if (usage.forms.length > 0) {
          lines.push("");
          lines.push("### Forms");
          lines.push(
            formatTable(
              ["Name", "Type"],
              usage.forms.map((form) => [form.name, form.typeLabel]),
            ),
          );
        }

        if (usage.views.length > 0) {
          lines.push("");
          lines.push("### Views");
          lines.push(
            formatTable(
              ["Name", "Scope", "Type"],
              usage.views.map((view) => [view.name, view.scope, view.queryTypeLabel]),
            ),
          );
        }

        if (usage.customApis.length > 0) {
          lines.push("");
          lines.push("### Custom APIs");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Usage"],
              usage.customApis.map((api) => [api.name, api.uniqueName || "-", api.usage]),
            ),
          );
        }

        if (usage.cloudFlows.length > 0) {
          lines.push("");
          lines.push("### Cloud Flows");
          lines.push(
            formatTable(
              ["Name", "Unique Name"],
              usage.cloudFlows.map((flow) => [flow.name, flow.uniqueName || "-"]),
            ),
          );
        }

        if (usage.relationships.length > 0) {
          lines.push("");
          lines.push("### Relationships");
          lines.push(
            formatTable(
              ["Schema Name", "Kind", "Related Table", "Details"],
              usage.relationships.map((relationship) => [
                relationship.schemaName,
                relationship.kind,
                relationship.relatedTable || "-",
                relationship.details || "-",
              ]),
            ),
          );
        }

        return createToolSuccessResponse("find_table_usage", lines.join("\n"), `Analyzed usage for table '${usage.tableLogicalName}' in '${env.name}'.`, {
          environment: env.name,
          usage,
        });
      } catch (error) {
        return createToolErrorResponse("find_table_usage", error);
      }
    },
  );
}
