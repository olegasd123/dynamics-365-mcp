import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listStepsForAssemblyQuery } from "../../queries/plugin-queries.js";
import { formatTable } from "../../utils/formatters.js";

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
        const steps = await client.query<Record<string, unknown>>(
          env,
          "sdkmessageprocessingsteps",
          listStepsForAssemblyQuery(pluginName),
        );

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
          const message = (s.sdkmessageid as Record<string, unknown>)?.name || "";
          const entity =
            (s.sdkmessagefilterid as Record<string, unknown>)?.primaryobjecttypecode || "none";
          return [
            String(s.name || ""),
            String(message),
            String(entity),
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
