import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { ChartScope } from "../../queries/chart-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { listCharts } from "./chart-metadata.js";

const listChartsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("Chart scope"),
  nameFilter: z.string().optional().describe("Optional filter for chart name"),
  solution: z
    .string()
    .optional()
    .describe("Optional solution display name or unique name. Applied to system charts only."),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListChartsParams = ToolParams<typeof listChartsSchema>;

export async function handleListCharts(
  { environment, table, scope, nameFilter, solution, limit, cursor }: ListChartsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const charts = await listCharts(env, client, {
      table,
      scope: scope as ChartScope | undefined,
      nameFilter,
      solution,
    });
    const page = buildPaginatedListData(charts, {}, { limit, cursor });
    const filters = {
      table: table || null,
      scope: scope || "system",
      nameFilter: nameFilter || null,
      solution: solution || null,
    };

    if (page.totalCount === 0) {
      const text = `No charts found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_charts", text, text, {
        environment: env.name,
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
      itemLabelSingular: "chart",
      itemLabelPlural: "charts",
      narrowHint:
        page.hasMore && !nameFilter ? "Use nameFilter or table to narrow the result." : undefined,
    });
    const filterDesc = [
      table ? `table='${table}'` : "",
      scope ? `scope='${scope}'` : "",
      nameFilter ? `filter='${nameFilter}'` : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Charts in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(
      ["Name", "Table", "Scope", "Type", "Default", "Managed", "Modified", "Chart ID"],
      page.items.map((chart) => [
        chart.name,
        chart.primaryentitytypecode || "-",
        chart.scope,
        chart.chartTypeLabel,
        chart.isdefault ? "Yes" : "No",
        chart.scope === "system" ? (chart.ismanaged ? "Yes" : "No") : "N/A",
        String(chart.modifiedon || "").slice(0, 10) || "-",
        chart.chartid,
      ]),
    )}`;

    return createToolSuccessResponse("list_charts", text, pageSummary, {
      environment: env.name,
      filters,
      ...page,
    });
  } catch (error) {
    return createToolErrorResponse("list_charts", error);
  }
}

export const listChartsTool = defineTool({
  name: "list_charts",
  description:
    "List Dataverse system or personal charts with table, chart type, and managed status.",
  schema: listChartsSchema,
  handler: handleListCharts,
});

export function registerListCharts(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listChartsTool, { config, client });
}
