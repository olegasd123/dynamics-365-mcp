import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { buildTableFlags } from "./table-display.js";
import { listTables } from "./table-metadata.js";

const listTablesSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z
    .string()
    .optional()
    .describe("Optional filter for logical name, schema name, or entity set name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListTablesParams = ToolParams<typeof listTablesSchema>;

export async function handleListTables(
  { environment, nameFilter, solution, limit, cursor }: ListTablesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const tables = await listTables(env, client, { nameFilter, solution });
    const filters = {
      nameFilter: nameFilter || null,
      solution: solution || null,
    };
    const allItems = tables.map((table) => ({
      ...table,
      flags: buildTableFlags(table),
    }));
    const page = buildPaginatedListData(
      allItems,
      { environment: env.name, filters },
      {
        limit,
        cursor,
      },
    );

    if (page.totalCount === 0) {
      const text = `No tables found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_tables", text, text, page);
    }

    const rows = page.items.map((table) => [
      table.logicalName,
      table.schemaName,
      table.displayName,
      table.entitySetName,
      table.primaryNameAttribute || "-",
      table.primaryIdAttribute,
      table.ownershipType || "-",
      buildTableFlags(table),
    ]);

    const filterDesc = [
      nameFilter ? `filter='${nameFilter}'` : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "table",
      itemLabelPlural: "tables",
      narrowHint: page.hasMore ? "Use nameFilter or solution to narrow the result." : undefined,
    });

    const text = `## Tables in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(
      [
        "Logical Name",
        "Schema Name",
        "Display Name",
        "Entity Set",
        "Primary Name",
        "Primary ID",
        "Ownership",
        "Flags",
      ],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_tables",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_tables", error);
  }
}

export const listTablesTool = defineTool({
  name: "list_tables",
  description: "List Dataverse tables with schema flags. Optionally filter by name or solution.",
  schema: listTablesSchema,
  handler: handleListTables,
});

export function registerListTables(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listTablesTool, { config, client });
}
