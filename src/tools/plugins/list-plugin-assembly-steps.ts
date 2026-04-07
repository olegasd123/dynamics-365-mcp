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

const NEW_SCHEMA = {
  environment: z.string().optional().describe("Environment name"),
  assemblyName: z.string().describe("Name of the plugin assembly"),
};

const LEGACY_SCHEMA = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z.string().describe("Name of the plugin assembly"),
};

export function registerListPluginAssemblySteps(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  const createHandler =
    (toolName: string) =>
    async ({ environment, assemblyName }: { environment?: string; assemblyName: string }) => {
      try {
        const env = getEnvironment(config, environment);
        const assemblies = await client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          getPluginAssemblyByNameQuery(assemblyName, ["pluginassemblyid", "name"]),
        );

        if (assemblies.length === 0) {
          const text = `Plugin assembly '${assemblyName}' not found in '${env.name}'.`;
          return createToolSuccessResponse(toolName, text, text, {
            environment: env.name,
            found: false,
            assemblyName,
          });
        }

        const steps = await fetchPluginSteps(env, client, assemblies);

        if (steps.length === 0) {
          const text = `No steps found for plugin assembly '${assemblyName}' in '${env.name}'.`;
          return createToolSuccessResponse(toolName, text, text, {
            environment: env.name,
            found: true,
            assemblyName,
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
        const text = `## Plugin Assembly Steps for '${assemblyName}' in '${env.name}'\n\nFound ${steps.length} step(s).\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse(
          toolName,
          text,
          `Found ${steps.length} step(s) for plugin assembly '${assemblyName}' in '${env.name}'.`,
          {
            environment: env.name,
            found: true,
            assemblyName,
            count: steps.length,
            items,
          },
        );
      } catch (error) {
        return createToolErrorResponse(toolName, error);
      }
    };

  server.tool(
    "list_plugin_assembly_steps",
    "List registered steps (message processing steps) for a plugin assembly in Dynamics 365.",
    NEW_SCHEMA,
    createHandler("list_plugin_assembly_steps"),
  );

  server.tool(
    "list_plugin_steps",
    "Deprecated alias for the assembly-level tool `list_plugin_assembly_steps`. Lists steps for a plugin assembly, not for one plugin class.",
    LEGACY_SCHEMA,
    async ({ environment, pluginName }) =>
      createHandler("list_plugin_steps")({ environment, assemblyName: pluginName }),
  );
}
