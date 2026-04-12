import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { formatNamedDiffSection } from "./diff-section.js";
import { compareCustomApisData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const compareCustomApisSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  apiName: z.string().optional().describe("Optional name or unique name filter"),
};

export const compareCustomApisTool = createComparisonTool({
  name: "compare_custom_apis",
  description:
    "Compare Custom APIs and their request and response metadata between two environments.",
  schema: compareCustomApisSchema,
  comparisonLabel: "custom APIs",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareCustomApisData(config, client, params.sourceEnvironment, params.targetEnvironment, {
      apiName: params.apiName,
    }),
  formatText: ({ comparison, sourceEnvironment, targetEnvironment }) => {
    const lines: string[] = [];
    lines.push(formatDiffResult(comparison.result, sourceEnvironment, targetEnvironment, "name"));
    lines.push("");
    lines.push(
      formatNamedDiffSection({
        title: "Request Parameters",
        result: comparison.requestParameterResult,
        sourceLabel: sourceEnvironment,
        targetLabel: targetEnvironment,
        nameField: "name",
        emptyMessage: "No request parameters found.",
      }),
    );
    lines.push("");
    lines.push(
      formatNamedDiffSection({
        title: "Response Properties",
        result: comparison.responsePropertyResult,
        sourceLabel: sourceEnvironment,
        targetLabel: targetEnvironment,
        nameField: "name",
        emptyMessage: "No response properties found.",
      }),
    );
    return lines.join("\n");
  },
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    apiName: params.apiName || null,
    apiComparison: comparison.result,
    requestParameterComparison: comparison.requestParameterResult,
    responsePropertyComparison: comparison.responsePropertyResult,
  }),
});

export const handleCompareCustomApis = compareCustomApisTool.handler;

export function registerCompareCustomApis(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareCustomApisTool, { config, client });
}
