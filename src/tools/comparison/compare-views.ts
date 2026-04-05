import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareViewsData } from "./comparison-data.js";

export function registerCompareViews(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_views",
    "Compare system or personal views between two environments using normalized XML summaries.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      table: z.string().optional().describe("Optional table logical name"),
      scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
      viewName: z.string().optional().describe("Optional view name filter"),
      solution: z.string().optional().describe("Optional source solution for system views"),
      targetSolution: z.string().optional().describe("Optional target solution for system views"),
    },
    async ({ sourceEnvironment, targetEnvironment, table, scope, viewName, solution, targetSolution }) => {
      try {
        const { result } = await compareViewsData(config, client, sourceEnvironment, targetEnvironment, {
          table,
          scope: scope as ViewScope | undefined,
          viewName,
          solution,
          targetSolution,
        });

        const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
        return createToolSuccessResponse("compare_views", text, `Compared views between '${sourceEnvironment}' and '${targetEnvironment}'.`, {
          sourceEnvironment,
          targetEnvironment,
          filters: { table: table || null, scope: scope || null, viewName: viewName || null, solution: solution || null, targetSolution: targetSolution || null },
          comparison: result,
        });
      } catch (error) {
        return createToolErrorResponse("compare_views", error);
      }
    },
  );
}
