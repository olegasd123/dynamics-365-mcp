import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { buildColumnDetails, formatYesNo } from "./table-display.js";
import { fetchTableColumns } from "./table-metadata.js";

export function registerListTableColumns(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_table_columns",
    "List Dataverse table columns with type, required level, and schema flags.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z.string().describe("Table logical name, schema name, or display name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, table, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const result = await fetchTableColumns(env, client, table, solution);

        if (result.columns.length === 0) {
          const text = `No columns found for table '${result.table.logicalName}' in '${env.name}'.`;
          return createToolSuccessResponse("list_table_columns", text, text, {
            environment: env.name,
            solution: solution || null,
            table: result.table,
            count: 0,
            items: [],
          });
        }

        const rows = result.columns.map((column) => [
          column.logicalName,
          column.schemaName,
          column.attributeType || "-",
          column.requiredLevel || "-",
          column.isPrimaryId ? "Primary ID" : column.isPrimaryName ? "Primary Name" : "-",
          formatYesNo(column.isAuditEnabled),
          formatYesNo(column.isValidForAdvancedFind),
          buildColumnDetails(column) || "-",
        ]);

        const text = `## Columns: ${result.table.logicalName}\n\nEnvironment: ${env.name}\nSolution Filter: ${solution || "-"}\nFound ${result.columns.length} column(s).\n\n${formatTable(
          [
            "Logical Name",
            "Schema Name",
            "Type",
            "Required",
            "Primary",
            "Audit",
            "Search",
            "Details",
          ],
          rows,
        )}`;

        const items = result.columns.map((column) => ({
          ...column,
          details: buildColumnDetails(column) || null,
        }));
        return createToolSuccessResponse(
          "list_table_columns",
          text,
          `Found ${result.columns.length} column(s) for table '${result.table.logicalName}' in '${env.name}'.`,
          {
            environment: env.name,
            solution: solution || null,
            table: result.table,
            count: result.columns.length,
            items,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_table_columns", error);
      }
    },
  );
}
