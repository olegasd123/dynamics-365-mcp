import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareViewsData } from "./comparison-data.js";

const compareViewsSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
  viewName: z.string().optional().describe("Optional view name filter"),
  solution: z.string().optional().describe("Optional source solution for system views"),
  targetSolution: z.string().optional().describe("Optional target solution for system views"),
};

type CompareViewsParams = ToolParams<typeof compareViewsSchema>;

export async function handleCompareViews(
  {
    sourceEnvironment,
    targetEnvironment,
    table,
    scope,
    viewName,
    solution,
    targetSolution,
  }: CompareViewsParams,
  { config, client }: ToolContext,
) {
  try {
    const {
      result,
      warnings = [],
      sourceCandidateCount,
      targetCandidateCount,
      truncated,
    } = await compareViewsData(config, client, sourceEnvironment, targetEnvironment, {
      table,
      scope: scope as ViewScope | undefined,
      viewName,
      solution,
      targetSolution,
    });

    const lines: string[] = [];
    if (warnings.length > 0) {
      lines.push(...warnings.map((warning) => `Warning: ${warning}`), "");
    }
    lines.push(formatDiffResult(result, sourceEnvironment, targetEnvironment, "name"));
    const text = lines.join("\n");
    return createToolSuccessResponse(
      "compare_views",
      text,
      `Compared views between '${sourceEnvironment}' and '${targetEnvironment}'.`,
      {
        sourceEnvironment,
        targetEnvironment,
        filters: {
          table: table || null,
          scope: scope || null,
          viewName: viewName || null,
          solution: solution || null,
          targetSolution: targetSolution || null,
        },
        warnings,
        sourceCandidateCount:
          sourceCandidateCount ?? result.onlyInSource.length + result.differences.length,
        targetCandidateCount:
          targetCandidateCount ?? result.onlyInTarget.length + result.differences.length,
        truncated: truncated || false,
        comparison: result,
      },
    );
  } catch (error) {
    return createToolErrorResponse("compare_views", error);
  }
}

export const compareViewsTool = defineTool({
  name: "compare_views",
  description:
    "Compare system or personal views between two environments using normalized XML summaries.",
  schema: compareViewsSchema,
  handler: handleCompareViews,
});

export function registerCompareViews(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, compareViewsTool, { config, client });
}
