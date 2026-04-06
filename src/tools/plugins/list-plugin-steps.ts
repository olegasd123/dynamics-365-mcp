import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { getPluginAssemblyByNameQuery } from "../../queries/plugin-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
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
          getPluginAssemblyByNameQuery(pluginName, ["pluginassemblyid", "name"]),
        );

        if (assemblies.length === 0) {
          const text = `Plugin assembly '${pluginName}' not found in '${env.name}'.`;
          return createToolSuccessResponse("list_plugin_steps", text, text, {
            environment: env.name,
            found: false,
            pluginName,
          });
        }

        const steps = await fetchPluginSteps(env, client, assemblies);

        if (steps.length === 0) {
          const text = `No steps found for plugin '${pluginName}' in '${env.name}'.`;
          return createToolSuccessResponse("list_plugin_steps", text, text, {
            environment: env.name,
            found: true,
            pluginName,
            count: 0,
            items: [],
          });
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

        const items = steps.map((step) => ({
          ...step,
          stageLabel: STAGE_LABELS[step.stage as number] || String(step.stage),
          modeLabel: MODE_LABELS[step.mode as number] || String(step.mode),
          statusLabel: step.statecode === 0 ? "Enabled" : "Disabled",
        }));
        const text = `## Plugin Steps for '${pluginName}' in '${env.name}'\n\nFound ${steps.length} step(s).\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse("list_plugin_steps", text, `Found ${steps.length} plugin step(s) for '${pluginName}' in '${env.name}'.`, {
          environment: env.name,
          found: true,
          pluginName,
          count: steps.length,
          items,
        });
      } catch (error) {
        return createToolErrorResponse("list_plugin_steps", error);
      }
    },
  );
}
