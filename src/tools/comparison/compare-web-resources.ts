import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { compareWebResourcesData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const compareWebResourcesSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  type: z
    .enum(["html", "css", "js", "xml", "png", "jpg", "gif", "xap", "xsl", "ico", "svg", "resx"])
    .optional()
    .describe("Filter by type"),
  nameFilter: z.string().optional().describe("Filter by name (contains match)"),
  compareContent: z
    .boolean()
    .optional()
    .describe("Compare content hashes (slower, requires fetching content). Default: false"),
};

export const compareWebResourcesTool = createComparisonTool({
  name: "compare_web_resources",
  description: "Compare web resources between two Dynamics 365 environments.",
  schema: compareWebResourcesSchema,
  comparisonLabel: "web resources",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareWebResourcesData(config, client, params.sourceEnvironment, params.targetEnvironment, {
      type: params.type as WebResourceType | undefined,
      nameFilter: params.nameFilter,
      compareContent: params.compareContent,
    }),
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    filters: {
      type: params.type || null,
      nameFilter: params.nameFilter || null,
      compareContent: params.compareContent || false,
    },
    comparison: comparison.result,
  }),
});

export const handleCompareWebResources = compareWebResourcesTool.handler;

export function registerCompareWebResources(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareWebResourcesTool, { config, client });
}
