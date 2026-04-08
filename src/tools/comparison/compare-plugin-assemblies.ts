import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { comparePluginAssembliesData } from "./comparison-data.js";

export function registerComparePluginAssemblies(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_plugin_assemblies",
    "Compare plugin assemblies and their registrations between two Dynamics 365 environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name (e.g. 'dev')"),
      targetEnvironment: z.string().describe("Target environment name (e.g. 'prod')"),
      assemblyName: z.string().optional().describe("Compare a specific plugin assembly by name"),
    },
    async ({
      sourceEnvironment,
      targetEnvironment,
      assemblyName,
    }: {
      sourceEnvironment: string;
      targetEnvironment: string;
      assemblyName?: string;
    }) => {
      try {
        const { sourceItems, targetItems, result, stepResult, imageResult } =
          await comparePluginAssembliesData(config, client, sourceEnvironment, targetEnvironment, {
            assemblyName,
            includeChildComponents: Boolean(assemblyName),
          });
        let text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");

        if (assemblyName && sourceItems.length > 0 && targetItems.length > 0 && stepResult) {
          text += `\n\n### Step Comparison for Plugin Assembly '${assemblyName}'\n`;
          text += formatDiffResult(stepResult, sourceEnvironment, targetEnvironment, "displayName");
        }

        if (assemblyName && sourceItems.length > 0 && targetItems.length > 0 && imageResult) {
          text += `\n\n### Image Comparison for Plugin Assembly '${assemblyName}'\n`;
          text += formatDiffResult(
            imageResult,
            sourceEnvironment,
            targetEnvironment,
            "displayName",
          );
        }

        return createToolSuccessResponse(
          "compare_plugin_assemblies",
          text,
          `Compared plugin assemblies between '${sourceEnvironment}' and '${targetEnvironment}'.`,
          {
            sourceEnvironment,
            targetEnvironment,
            assemblyName: assemblyName || null,
            counts: {
              sourceAssemblies: sourceItems.length,
              targetAssemblies: targetItems.length,
            },
            assemblies: result,
            steps: stepResult || null,
            images: imageResult || null,
          },
        );
      } catch (error) {
        return createToolErrorResponse("compare_plugin_assemblies", error);
      }
    },
  );
}
