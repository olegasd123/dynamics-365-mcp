import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { ViewScope } from "../../queries/view-queries.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listViews } from "./view-metadata.js";

const STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

const listViewsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
  nameFilter: z.string().optional().describe("Optional view name filter"),
  solution: z
    .string()
    .optional()
    .describe("Optional solution display name or unique name. Applied to system views only."),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListViewsParams = ToolParams<typeof listViewsSchema>;

export async function handleListViews(
  { environment, table, scope, nameFilter, solution, limit, cursor }: ListViewsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const filters = {
      table: table || null,
      scope: scope || null,
      nameFilter: nameFilter || null,
      solution: solution || null,
    };
    const views = await listViews(env, client, {
      table,
      scope: scope as ViewScope | undefined,
      nameFilter,
      solution,
    });
    const page = buildPaginatedListData(
      views,
      { environment: env.name, filters },
      {
        limit,
        cursor,
      },
    );

    if (page.totalCount === 0) {
      const text = `No views found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_views", text, text, page);
    }

    const rows = page.items.map((view) => [
      view.returnedtypecode,
      view.scope,
      view.name,
      view.queryTypeLabel,
      view.isdefault ? "Yes" : "No",
      view.isquickfindquery ? "Yes" : "No",
      STATE_LABELS[view.statecode] || String(view.statecode),
      String(view.modifiedon || "").slice(0, 10),
    ]);

    const filterDesc = [
      table ? `table='${table}'` : "",
      scope ? `scope='${scope}'` : "",
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
      itemLabelSingular: "view",
      itemLabelPlural: "views",
      narrowHint: page.hasMore
        ? "Use table, scope, nameFilter, or solution to narrow the result."
        : undefined,
    });

    const text = `## Views in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(
      ["Table", "Scope", "Name", "Type", "Default", "Quick Find", "State", "Modified"],
      rows,
    )}`;
    return createToolSuccessResponse(
      "list_views",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_views", error);
  }
}

export const listViewsTool = defineTool({
  name: "list_views",
  description: "List system or personal views with normalized metadata.",
  schema: listViewsSchema,
  handler: handleListViews,
});

export function registerListViews(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listViewsTool, { config, client });
}
