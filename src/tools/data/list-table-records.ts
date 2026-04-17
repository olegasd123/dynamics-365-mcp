import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import {
  TABLE_RECORD_STATE_SCHEMA,
  describeRequestedState,
  listTableDataRecords,
  loadTableDataProfile,
} from "./record-data.js";

const listTableRecordsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  nameFilter: z
    .string()
    .optional()
    .describe("Optional text filter for the primary name or common person name fields"),
  state: TABLE_RECORD_STATE_SCHEMA,
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListTableRecordsParams = ToolParams<typeof listTableRecordsSchema>;

export async function handleListTableRecords(
  { environment, table, nameFilter, state, limit, cursor }: ListTableRecordsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const profile = await loadTableDataProfile(env, client, table);
    const page = await listTableDataRecords(env, client, profile, {
      cursor,
      limit,
      nameFilter,
      state,
    });
    const requestedState = describeRequestedState(state, profile.supportsStateFilter);
    const filters = {
      nameFilter: nameFilter || null,
      state: state || "active",
      appliedState: requestedState,
    };

    if (page.totalCount === 0) {
      const text = `No records found in table '${profile.table.logicalName}' in '${env.name}'.`;
      return createToolSuccessResponse("list_table_records", text, text, {
        environment: env.name,
        table: profile.table,
        supportsStateFilter: profile.supportsStateFilter,
        filters,
        ...page,
      });
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "record",
      itemLabelPlural: "records",
      narrowHint: page.hasMore && !nameFilter ? "Use nameFilter to narrow the result." : undefined,
    });

    const rows = page.items.map((item) => [
      item.label,
      item.secondaryText || "-",
      item.stateLabel || (profile.supportsStateFilter ? "-" : "N/A"),
      formatDate(item.modifiedon),
      item.recordId,
    ]);

    const filterParts = [
      `state='${requestedState}'`,
      nameFilter ? `nameFilter='${nameFilter}'` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Records from '${profile.table.logicalName}' in '${env.name}'\n\n${pageSummary}\n\n- State Filter: ${requestedState}\n- Entity Set: ${profile.table.entitySetName}\n\n${formatTable(
      ["Label", "Details", "State", "Modified", "Record ID"],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_table_records",
      text,
      `${pageSummary} Table: '${profile.table.logicalName}'. Filters: ${filterParts}.`,
      {
        environment: env.name,
        table: profile.table,
        supportsStateFilter: profile.supportsStateFilter,
        filters,
        ...page,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_table_records", error);
  }
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "-";
}

export const listTableRecordsTool = defineTool({
  name: "list_table_records",
  description:
    "List Dataverse table records with server-side paging. Defaults to active rows unless you ask for inactive ones.",
  schema: listTableRecordsSchema,
  handler: handleListTableRecords,
});

export function registerListTableRecords(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listTableRecordsTool, { config, client });
}
