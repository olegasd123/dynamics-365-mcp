import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchTableRibbonMetadata, resolveRibbonButton } from "./ribbon-metadata.js";

const getRibbonButtonDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  buttonName: z.string().describe("Ribbon button ID, label, or command"),
  location: z
    .enum(["form", "homepageGrid", "subgrid", "all"])
    .default("all")
    .describe("Ribbon location filter. Defaults to all."),
};

type GetRibbonButtonDetailsParams = ToolParams<typeof getRibbonButtonDetailsSchema>;

export async function handleGetRibbonButtonDetails(
  { environment, table, buttonName, location }: GetRibbonButtonDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const metadata = await fetchTableRibbonMetadata(env, client, table, { location });
    const button = resolveRibbonButton(metadata, buttonName);

    const lines: string[] = [];
    lines.push(`## Ribbon Button: ${button.label || button.id}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${metadata.table.logicalName}`);
    lines.push(`- Ribbon Type: ${button.ribbonType}`);
    lines.push(`- Ribbon: ${button.ribbonId}`);
    lines.push(`- Location: ${button.location || "-"}`);
    lines.push(`- Button Id: ${button.id}`);
    lines.push(`- Label: ${button.label || "-"}`);
    lines.push(`- Command: ${button.command || "-"}`);
    lines.push(`- Sequence: ${button.sequence === null ? "-" : String(button.sequence)}`);
    lines.push(`- Template Alias: ${button.templateAlias || "-"}`);
    lines.push(`- Tooltip Title: ${button.toolTipTitle || "-"}`);
    lines.push(`- Tooltip Description: ${button.toolTipDescription || "-"}`);
    lines.push(`- Description: ${button.description || "-"}`);
    lines.push(`- Image16by16: ${button.image16by16 || "-"}`);
    lines.push(`- Image32by32: ${button.image32by32 || "-"}`);
    lines.push(`- Modern Image: ${button.modernImage || "-"}`);

    if (button.commandDefinition) {
      lines.push("");
      lines.push("### Command");
      lines.push(
        formatTable(
          ["Field", "Value"],
          [
            ["Id", button.commandDefinition.id],
            ["Display Rules", button.commandDefinition.displayRuleIds.join(", ") || "-"],
            ["Enable Rules", button.commandDefinition.enableRuleIds.join(", ") || "-"],
          ],
        ),
      );

      if (button.commandDefinition.actions.length > 0) {
        lines.push("");
        lines.push("### Actions");
        lines.push(
          formatTable(
            ["Type", "Attributes"],
            button.commandDefinition.actions.map((action) => [
              action.type,
              formatAttributes(action.attributes),
            ]),
          ),
        );
      }
    }

    if (button.displayRules.length > 0) {
      lines.push("");
      lines.push("### Display Rules");
      lines.push(
        formatTable(
          ["Rule Id", "Steps"],
          button.displayRules.map((rule) => [rule.id, formatRuleSteps(rule)]),
        ),
      );
    }

    if (button.enableRules.length > 0) {
      lines.push("");
      lines.push("### Enable Rules");
      lines.push(
        formatTable(
          ["Rule Id", "Steps"],
          button.enableRules.map((rule) => [rule.id, formatRuleSteps(rule)]),
        ),
      );
    }

    return createToolSuccessResponse(
      "get_ribbon_button_details",
      lines.join("\n"),
      `Loaded ribbon button '${button.label || button.id}' for table '${metadata.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: metadata.table,
        location: metadata.locationFilter,
        xmlHash: metadata.xmlHash,
        button,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_ribbon_button_details", error);
  }
}

export const getRibbonButtonDetailsTool = defineTool({
  name: "get_ribbon_button_details",
  description: "Show command, rule, and image details for one ribbon button by name or ID.",
  schema: getRibbonButtonDetailsSchema,
  handler: handleGetRibbonButtonDetails,
});

export function registerGetRibbonButtonDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getRibbonButtonDetailsTool, { config, client });
}

function formatRuleSteps(rule: {
  steps: Array<{ type: string; attributes: Record<string, string> }>;
}): string {
  return (
    rule.steps.map((step) => `${step.type}(${formatAttributes(step.attributes)})`).join("; ") || "-"
  );
}

function formatAttributes(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes).filter(([key]) => key.toLowerCase() === key);
  const normalizedEntries = entries.length > 0 ? entries : Object.entries(attributes);

  return normalizedEntries
    .filter(([key]) => !key.includes(":"))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}
