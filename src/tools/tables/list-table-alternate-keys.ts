import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchTableKeys } from "./table-metadata.js";
import { formatYesNo } from "./table-display.js";

const listTableAlternateKeysSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type ListTableAlternateKeysParams = ToolParams<typeof listTableAlternateKeysSchema>;

export async function handleListTableAlternateKeys(
  { environment, table, solution }: ListTableAlternateKeysParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const result = await fetchTableKeys(env, client, table, solution);

    if (result.keys.length === 0) {
      const text = `No alternate keys found for table '${result.table.logicalName}' in '${env.name}'.`;
      return createToolSuccessResponse("list_table_alternate_keys", text, text, {
        environment: env.name,
        solution: solution || null,
        table: result.table,
        count: 0,
        items: [],
      });
    }

    const rows = result.keys.map((key) => [
      key.logicalName,
      key.schemaName,
      key.keyAttributes.join(", ") || "-",
      key.indexStatus || "-",
      formatYesNo(key.isManaged),
    ]);

    const text = `## Alternate Keys: ${result.table.logicalName}\n\nEnvironment: ${env.name}\nSolution Filter: ${solution || "-"}\nFound ${result.keys.length} alternate key(s).\n\n${formatTable(
      ["Logical Name", "Schema Name", "Columns", "Status", "Managed"],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_table_alternate_keys",
      text,
      `Found ${result.keys.length} alternate key(s) for table '${result.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        table: result.table,
        count: result.keys.length,
        items: result.keys,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_table_alternate_keys", error);
  }
}

export const listTableAlternateKeysTool = defineTool({
  name: "list_table_alternate_keys",
  description: "List Dataverse table alternate keys for one table.",
  schema: listTableAlternateKeysSchema,
  handler: handleListTableAlternateKeys,
});

export function registerListTableAlternateKeys(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listTableAlternateKeysTool, { config, client });
}
