import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPluginAssembliesQuery,
  listStepsForAssemblyQuery,
} from "../../queries/plugin-queries.js";
import { diffCollections } from "../../utils/diff.js";
import { formatDiffResult } from "../../utils/formatters.js";

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
        const sourceEnv = getEnvironment(config, sourceEnvironment);
        const targetEnv = getEnvironment(config, targetEnvironment);

        // Parallel fetch from both environments
        const [sourcePlugins, targetPlugins] = await Promise.all([
          client.query<Record<string, unknown>>(
            sourceEnv,
            "pluginassemblies",
            listPluginAssembliesQuery(),
          ),
          client.query<Record<string, unknown>>(
            targetEnv,
            "pluginassemblies",
            listPluginAssembliesQuery(),
          ),
        ]);

        let source = sourcePlugins;
        let target = targetPlugins;

        if (pluginName) {
          source = source.filter((p) => p.name === pluginName);
          target = target.filter((p) => p.name === pluginName);
        }

        const result = diffCollections(source, target, (p) => String(p.name), [
          "version",
          "isolationmode",
          "ismanaged",
        ]);

        let text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");

        // For plugins that exist in both, compare steps
        if (pluginName && source.length > 0 && target.length > 0) {
          const [sourceSteps, targetSteps] = await Promise.all([
            client.query<Record<string, unknown>>(
              sourceEnv,
              "sdkmessageprocessingsteps",
              listStepsForAssemblyQuery(pluginName),
            ),
            client.query<Record<string, unknown>>(
              targetEnv,
              "sdkmessageprocessingsteps",
              listStepsForAssemblyQuery(pluginName),
            ),
          ]);

          const stepDiff = diffCollections(sourceSteps, targetSteps, (s) => String(s.name), [
            "stage",
            "mode",
            "statecode",
            "rank",
            "filteringattributes",
          ]);

          text += `\n\n### Step Comparison for '${pluginName}'\n`;
          text += formatDiffResult(stepDiff, sourceEnvironment, targetEnvironment, "name");
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
