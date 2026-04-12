import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareViewsData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const compareViewsSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
  viewName: z.string().optional().describe("Optional view name filter"),
  solution: z.string().optional().describe("Optional source solution for system views"),
  targetSolution: z.string().optional().describe("Optional target solution for system views"),
};

export const compareViewsTool = createComparisonTool({
  name: "compare_views",
  description:
    "Compare system or personal views between two environments using normalized XML summaries.",
  schema: compareViewsSchema,
  comparisonLabel: "views",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareViewsData(config, client, params.sourceEnvironment, params.targetEnvironment, {
      table: params.table,
      scope: params.scope as ViewScope | undefined,
      viewName: params.viewName,
      solution: params.solution,
      targetSolution: params.targetSolution,
    }),
  formatText: ({ comparison, sourceEnvironment, targetEnvironment }) => {
    const lines: string[] = [];
    const warnings = comparison.warnings || [];
    if (warnings.length > 0) {
      lines.push(...warnings.map((warning) => `Warning: ${warning}`), "");
    }
    lines.push(formatDiffResult(comparison.result, sourceEnvironment, targetEnvironment, "name"));
    return lines.join("\n");
  },
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    filters: {
      table: params.table || null,
      scope: params.scope || null,
      viewName: params.viewName || null,
      solution: params.solution || null,
      targetSolution: params.targetSolution || null,
    },
    warnings: comparison.warnings || [],
    sourceCandidateCount:
      comparison.sourceCandidateCount ??
      comparison.result.onlyInSource.length + comparison.result.differences.length,
    targetCandidateCount:
      comparison.targetCandidateCount ??
      comparison.result.onlyInTarget.length + comparison.result.differences.length,
    truncated: comparison.truncated || false,
    comparison: comparison.result,
  }),
});

export const handleCompareViews = compareViewsTool.handler;

export function registerCompareViews(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, compareViewsTool, { config, client });
}
