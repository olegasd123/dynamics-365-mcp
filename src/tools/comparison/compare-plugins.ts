import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { comparePluginsData } from "./comparison-data.js";

export function registerComparePlugins(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_plugins",
    "Compare plugin assemblies and their registrations between two Dynamics 365 environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name (e.g. 'dev')"),
      targetEnvironment: z.string().describe("Target environment name (e.g. 'prod')"),
      pluginName: z.string().optional().describe("Compare a specific plugin assembly by name"),
    },
    async ({ sourceEnvironment, targetEnvironment, pluginName }) => {
      try {
        const {
          sourceItems,
          targetItems,
          result,
          stepResult,
          imageResult,
        } = await comparePluginsData(
          config,
          client,
          sourceEnvironment,
          targetEnvironment,
          {
            pluginName,
            includeChildComponents: Boolean(pluginName),
          },
        );
        let text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");

        // For plugins that exist in both, compare steps
        if (pluginName && sourceItems.length > 0 && targetItems.length > 0 && stepResult) {
          text += `\n\n### Step Comparison for '${pluginName}'\n`;
          text += formatDiffResult(stepResult, sourceEnvironment, targetEnvironment, "displayName");
        }

        if (pluginName && sourceItems.length > 0 && targetItems.length > 0 && imageResult) {
          text += `\n\n### Image Comparison for '${pluginName}'\n`;
          text += formatDiffResult(
            imageResult,
            sourceEnvironment,
            targetEnvironment,
            "displayName",
          );
        }

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
