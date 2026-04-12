import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareWebResourcesData } from "./comparison-data.js";

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

type CompareWebResourcesParams = ToolParams<typeof compareWebResourcesSchema>;

export async function handleCompareWebResources(
  {
    sourceEnvironment,
    targetEnvironment,
    type,
    nameFilter,
    compareContent,
  }: CompareWebResourcesParams,
  { config, client }: ToolContext,
) {
  try {
    const { result } = await compareWebResourcesData(
      config,
      client,
      sourceEnvironment,
      targetEnvironment,
      {
        type: type as WebResourceType | undefined,
        nameFilter,
        compareContent,
      },
    );
    const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
    return createToolSuccessResponse(
      "compare_web_resources",
      text,
      `Compared web resources between '${sourceEnvironment}' and '${targetEnvironment}'.`,
      {
        sourceEnvironment,
        targetEnvironment,
        filters: {
          type: type || null,
          nameFilter: nameFilter || null,
          compareContent: compareContent || false,
        },
        comparison: result,
      },
    );
  } catch (error) {
    return createToolErrorResponse("compare_web_resources", error);
  }
}

export const compareWebResourcesTool = defineTool({
  name: "compare_web_resources",
  description: "Compare web resources between two Dynamics 365 environments.",
  schema: compareWebResourcesSchema,
  handler: handleCompareWebResources,
});

export function registerCompareWebResources(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareWebResourcesTool, { config, client });
}
