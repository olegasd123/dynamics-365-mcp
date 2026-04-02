import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { buildQueryString } from "../../utils/odata-helpers.js";
import { fetchPluginSteps } from "./plugin-inventory.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

export function registerListPluginSteps(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_plugin_steps",
    "List registered steps (message processing steps) for a plugin assembly in Dynamics 365.",
    {
      environment: z.string().optional().describe("Environment name"),
      pluginName: z.string().describe("Name of the plugin assembly"),
    },
    async ({ environment, pluginName }) => {
      try {
        const env = getEnvironment(config, environment);
        const assemblies = await client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          buildQueryString({
            select: ["pluginassemblyid", "name"],
            filter: `name eq '${pluginName}'`,
          }),
        );

        if (assemblies.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Plugin assembly '${pluginName}' not found in '${env.name}'.`,
              },
            ],
          };
        }

        const steps = await fetchPluginSteps(env, client, assemblies);

        if (steps.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No steps found for plugin '${pluginName}' in '${env.name}'.`,
              },
            ],
          };
        }

        const headers = ["Step Name", "Message", "Entity", "Stage", "Mode", "Status", "Rank"];
        const rows = steps.map((s) => {
          return [
            String(s.name || ""),
            String(s.messageName || ""),
            String(s.primaryEntity || "none"),
            STAGE_LABELS[s.stage as number] || String(s.stage),
            MODE_LABELS[s.mode as number] || String(s.mode),
            s.statecode === 0 ? "Enabled" : "Disabled",
            String(s.rank || ""),
          ];
        });

        const text = `## Plugin Steps for '${pluginName}' in '${env.name}'\n\nFound ${steps.length} step(s).\n\n${formatTable(headers, rows)}`;
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
