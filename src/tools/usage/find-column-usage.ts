import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { findColumnUsageData } from "./usage-analysis.js";

const findColumnUsageSchema = {
  environment: z.string().optional().describe("Environment name"),
  column: z.string().describe("Column logical name"),
  table: z
    .string()
    .optional()
    .describe("Optional table logical name, schema name, or display name"),
};

type FindColumnUsageParams = ToolParams<typeof findColumnUsageSchema>;

export async function handleFindColumnUsage(
  { environment, column, table }: FindColumnUsageParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const usage = await findColumnUsageData(env, client, column, table);
    const lines: string[] = [];

    lines.push(`## Column Usage: ${usage.columnName}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table Filter: ${usage.tableLogicalName || "-"}`);
    if (usage.warnings && usage.warnings.length > 0) {
      lines.push(`- Warnings: ${usage.warnings.join(" | ")}`);
    }
    lines.push(
      `- Summary: Plugin Steps ${usage.pluginSteps.length} | Plugin Images ${usage.pluginImages.length} | Workflows ${usage.workflows.length} | Forms ${usage.forms.length} | Views ${usage.views.length} | Relationships ${usage.relationships.length} | Cloud Flows ${usage.cloudFlows.length}`,
    );

    if (usage.fieldSecurity) {
      lines.push("");
      lines.push("### Field Security");
      if (!usage.fieldSecurity.isSecured) {
        lines.push("Column is not field-secured.");
      } else if (usage.fieldSecurity.profiles.length === 0) {
        lines.push("Column is field-secured, but no profile grants were found.");
      } else {
        lines.push(
          formatTable(
            ["Profile", "Users", "Teams", "Read", "Create", "Update"],
            usage.fieldSecurity.profiles.map((profile) => [
              profile.name,
              String(profile.userCount),
              String(profile.teamCount),
              profile.canRead,
              profile.canCreate,
              profile.canUpdate,
            ]),
          ),
        );
      }
    }

    if (usage.pluginSteps.length > 0) {
      lines.push("");
      lines.push("### Plugin Steps");
      lines.push(
        formatTable(
          ["Assembly", "Step", "Attributes"],
          usage.pluginSteps.map((step) => [step.assemblyName, step.name, step.attributes]),
        ),
      );
    }

    if (usage.pluginImages.length > 0) {
      lines.push("");
      lines.push("### Plugin Images");
      lines.push(
        formatTable(
          ["Assembly", "Step", "Image", "Attributes"],
          usage.pluginImages.map((image) => [
            image.assemblyName,
            image.stepName,
            image.name,
            image.attributes,
          ]),
        ),
      );
    }

    if (usage.workflows.length > 0) {
      lines.push("");
      lines.push("### Workflows");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "Trigger Update Attributes"],
          usage.workflows.map((workflow) => [
            workflow.name,
            workflow.uniqueName || "-",
            workflow.triggerAttributes || "-",
          ]),
        ),
      );
    }

    if (usage.forms.length > 0) {
      lines.push("");
      lines.push("### Forms");
      lines.push(
        formatTable(
          ["Table", "Name", "Type"],
          usage.forms.map((form) => [form.table, form.name, form.typeLabel]),
        ),
      );
    }

    if (usage.views.length > 0) {
      lines.push("");
      lines.push("### Views");
      lines.push(
        formatTable(
          ["Table", "Name", "Scope"],
          usage.views.map((view) => [view.table, view.name, view.scope]),
        ),
      );
    }

    if (usage.relationships.length > 0) {
      lines.push("");
      lines.push("### Relationships");
      lines.push(
        formatTable(
          ["Schema Name", "Kind", "Details"],
          usage.relationships.map((relationship) => [
            relationship.schemaName,
            relationship.kind,
            relationship.details,
          ]),
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

    return createToolSuccessResponse(
      "find_column_usage",
      lines.join("\n"),
      `Analyzed usage for column '${usage.columnName}' in '${env.name}'.`,
      {
        environment: env.name,
        warnings: usage.warnings || [],
        usage,
      },
    );
  } catch (error) {
    return createToolErrorResponse("find_column_usage", error);
  }
}

export const findColumnUsageTool = defineTool({
  name: "find_column_usage",
  description: "Find where one Dataverse column is used across metadata assets.",
  schema: findColumnUsageSchema,
  handler: handleFindColumnUsage,
});

export function registerFindColumnUsage(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, findColumnUsageTool, { config, client });
}
