import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { formatNamedDiffSection } from "./diff-section.js";
import { compareCustomApisData } from "./comparison-data.js";

export function registerCompareCustomApis(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_custom_apis",
    "Compare Custom APIs and their request and response metadata between two environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      apiName: z.string().optional().describe("Optional name or unique name filter"),
    },
    async ({ sourceEnvironment, targetEnvironment, apiName }) => {
      try {
        const comparison = await compareCustomApisData(
          config,
          client,
          sourceEnvironment,
          targetEnvironment,
          { apiName },
        );

        const lines: string[] = [];
        lines.push(
          formatDiffResult(comparison.result, sourceEnvironment, targetEnvironment, "name"),
        );
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

        return createToolSuccessResponse("compare_custom_apis", lines.join("\n"), `Compared custom APIs between '${sourceEnvironment}' and '${targetEnvironment}'.`, {
          sourceEnvironment,
          targetEnvironment,
          apiName: apiName || null,
          apiComparison: comparison.result,
          requestParameterComparison: comparison.requestParameterResult,
          responsePropertyComparison: comparison.responsePropertyResult,
        });
      } catch (error) {
        return createToolErrorResponse("compare_custom_apis", error);
      }
    },
  );
}
