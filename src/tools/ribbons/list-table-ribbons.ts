import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchTableRibbonMetadata } from "./ribbon-metadata.js";

const listTableRibbonsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  location: z
    .enum(["form", "homepageGrid", "subgrid", "all"])
    .optional()
    .describe("Optional ribbon location filter"),
};

type ListTableRibbonsParams = ToolParams<typeof listTableRibbonsSchema>;

export async function handleListTableRibbons(
  { environment, table, location }: ListTableRibbonsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const metadata = await fetchTableRibbonMetadata(env, client, table, { location });

    if (metadata.buttons.length === 0) {
      const text = `No ribbon buttons found for table '${metadata.table.logicalName}' in '${env.name}'.`;
      return createToolSuccessResponse("list_table_ribbons", text, text, {
        environment: env.name,
        table: metadata.table,
        location: metadata.locationFilter,
        ribbonCount: 0,
        buttonCount: 0,
        xmlHash: metadata.xmlHash,
        ribbons: [],
      });
    }

    const lines: string[] = [];
    lines.push(`## Table Ribbons: ${metadata.table.displayName || metadata.table.logicalName}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${metadata.table.logicalName}`);
    lines.push(`- Location Filter: ${metadata.locationFilter}`);
    lines.push(`- Ribbons: ${metadata.ribbons.length}`);
    lines.push(`- Buttons: ${metadata.buttons.length}`);
    lines.push(`- Ribbon XML Hash: ${metadata.xmlHash}`);
    lines.push("");
    lines.push("### Ribbon Summary");
    lines.push(
      formatTable(
        ["Ribbon", "Type", "Buttons"],
        metadata.ribbons.map((ribbon) => [ribbon.id, ribbon.type, String(ribbon.buttonCount)]),
      ),
    );

    for (const ribbon of metadata.ribbons) {
      lines.push("");
      lines.push(`### ${ribbon.id}`);
      lines.push(
        formatTable(
          ["Button", "Id", "Command"],
          ribbon.buttons.map((button) => [
            button.label || button.id,
            button.id,
            button.command || "-",
          ]),
        ),
      );
    }

    return createToolSuccessResponse(
      "list_table_ribbons",
      lines.join("\n"),
      `Found ${metadata.ribbons.length} ribbons and ${metadata.buttons.length} buttons for table '${metadata.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: metadata.table,
        location: metadata.locationFilter,
        ribbonCount: metadata.ribbons.length,
        buttonCount: metadata.buttons.length,
        xmlHash: metadata.xmlHash,
        ribbons: metadata.ribbons,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_table_ribbons", error);
  }
}

export const listTableRibbonsTool = defineTool({
  name: "list_table_ribbons",
  description: "List table ribbons and the buttons available on each ribbon.",
  schema: listTableRibbonsSchema,
  handler: handleListTableRibbons,
});

export function registerListTableRibbons(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listTableRibbonsTool, { config, client });
}
