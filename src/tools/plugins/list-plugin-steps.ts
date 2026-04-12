import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPluginMetadata, resolvePluginClass } from "./plugin-class-metadata.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const listPluginStepsSchema = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z.string().describe("Plugin class name or full type name"),
  assemblyName: z.string().optional().describe("Optional plugin assembly name to narrow matches"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type ListPluginStepsParams = ToolParams<typeof listPluginStepsSchema>;

export async function handleListPluginSteps(
  { environment, pluginName, assemblyName, solution }: ListPluginStepsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const inventory = await fetchPluginMetadata(env, client, {
      solution,
      includeSteps: true,
      includeImages: false,
    });
    const plugin = resolvePluginClass(inventory.pluginClasses, pluginName, assemblyName);
    const steps = inventory.steps.filter((step) => step.pluginTypeId === plugin.pluginTypeId);

    if (steps.length === 0) {
      const text = `No steps found for plugin '${plugin.fullName}' in '${env.name}'.`;
      return createToolSuccessResponse("list_plugin_steps", text, text, {
        environment: env.name,
        found: true,
        pluginName: plugin.fullName,
        assemblyName: plugin.assemblyName,
        count: 0,
        items: [],
      });
    }

    const headers = ["Step Name", "Message", "Entity", "Stage", "Mode", "Status", "Rank"];
    const rows = steps.map((step) => [
      String(step.name || ""),
      String(step.messageName || ""),
      String(step.primaryEntity || "none"),
      STAGE_LABELS[step.stage as number] || String(step.stage),
      MODE_LABELS[step.mode as number] || String(step.mode),
      step.statecode === 0 ? "Enabled" : "Disabled",
      String(step.rank || ""),
    ]);
    const items = steps.map((step) => ({
      ...step,
      stageLabel: STAGE_LABELS[step.stage as number] || String(step.stage),
      modeLabel: MODE_LABELS[step.mode as number] || String(step.mode),
      statusLabel: step.statecode === 0 ? "Enabled" : "Disabled",
    }));
    const text = `## Plugin Steps for '${plugin.fullName}' in '${env.name}'\n\n- **Assembly**: ${plugin.assemblyName}\n\nFound ${steps.length} step(s).\n\n${formatTable(headers, rows)}`;

    return createToolSuccessResponse(
      "list_plugin_steps",
      text,
      `Found ${steps.length} step(s) for plugin '${plugin.fullName}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        plugin: plugin,
        count: steps.length,
        items,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_plugin_steps", error);
  }
}

export const listPluginStepsTool = defineTool({
  name: "list_plugin_steps",
  description:
    "List registered steps (message processing steps) for one plugin class in Dynamics 365. Workflow activities (CodeActivity) are excluded.",
  schema: listPluginStepsSchema,
  handler: handleListPluginSteps,
});

export function registerListPluginSteps(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listPluginStepsTool, { config, client });
}
