import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchTableMessageDetails } from "./table-message-metadata.js";

const getTableMessageDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  messageName: z.string().describe("SDK message name or sdkmessageid"),
};

type GetTableMessageDetailsParams = ToolParams<typeof getTableMessageDetailsSchema>;

export async function handleGetTableMessageDetails(
  { environment, table, messageName }: GetTableMessageDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const details = await fetchTableMessageDetails(env, client, table, messageName);
    const lines: string[] = [];

    lines.push(`## Table Message: ${details.message.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${details.table.logicalName}`);
    lines.push(`- Table Display Name: ${details.table.displayName || "-"}`);
    lines.push(`- SDK Message Id: ${details.message.sdkmessageid || "-"}`);
    lines.push(
      `- Custom Processing Step Allowed: ${details.message.customProcessingStepAllowed ? "Yes" : "No"}`,
    );
    lines.push(`- Filter Count: ${details.filters.length}`);

    lines.push("");
    lines.push("### SDK Message Filters");
    if (details.filters.length === 0) {
      lines.push("No SDK message filters found.");
    } else {
      lines.push(
        formatTable(
          ["Filter Id", "Primary Object Type", "Custom Processing Step"],
          details.filters.map((filter) => [
            filter.sdkmessagefilterid || "-",
            filter.primaryobjecttypecode || "-",
            filter.customProcessingStepAllowed ? "Yes" : "No",
          ]),
        ),
      );
    }

    return createToolSuccessResponse(
      "get_table_message_details",
      lines.join("\n"),
      `Loaded SDK message '${details.message.name}' for table '${details.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: details.table,
        message: details.message,
        filters: details.filters,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_table_message_details", error);
  }
}

export const getTableMessageDetailsTool = defineTool({
  name: "get_table_message_details",
  description: "Show one SDK message with raw sdkmessagefilter context for one Dataverse table.",
  schema: getTableMessageDetailsSchema,
  handler: handleGetTableMessageDetails,
});

export function registerGetTableMessageDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getTableMessageDetailsTool, { config, client });
}
