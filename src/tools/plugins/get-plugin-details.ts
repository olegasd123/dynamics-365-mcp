import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  fetchPluginMetadata,
  groupImagesByStepId,
  resolvePluginClass,
} from "./plugin-class-metadata.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};

const MODE_LABELS: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };
const IMAGE_TYPE_LABELS: Record<number, string> = { 0: "PreImage", 1: "PostImage", 2: "Both" };

const getPluginDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z.string().describe("Plugin class name or full type name"),
  assemblyName: z.string().optional().describe("Optional plugin assembly name to narrow matches"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type GetPluginDetailsParams = ToolParams<typeof getPluginDetailsSchema>;

export async function handleGetPluginDetails(
  { environment, pluginName, assemblyName, solution }: GetPluginDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const inventory = await fetchPluginMetadata(env, client, {
      solution,
      includeSteps: true,
      includeImages: true,
    });
    const plugin = resolvePluginClass(inventory.pluginClasses, pluginName, assemblyName);
    const steps = inventory.steps.filter((step) => step.pluginTypeId === plugin.pluginTypeId);
    const images = inventory.images.filter((image) => image.pluginTypeId === plugin.pluginTypeId);
    const imagesByStepId = groupImagesByStepId(images);

    const lines: string[] = [];
    lines.push(`## Plugin: ${plugin.name}`);
    lines.push(`- **Full Name**: ${plugin.fullName}`);
    lines.push(`- **Assembly**: ${plugin.assemblyName}`);
    if (plugin.friendlyName) {
      lines.push(`- **Friendly Name**: ${plugin.friendlyName}`);
    }
    lines.push(`- **Registered Steps**: ${steps.length}`);
    lines.push(`- **Registered Images**: ${images.length}`);
    lines.push("");

    if (steps.length === 0) {
      lines.push("No registered steps.");
    } else {
      lines.push(`### Steps (${steps.length})`);
      for (const step of steps) {
        const stage = STAGE_LABELS[step.stage as number] || String(step.stage);
        const mode = MODE_LABELS[step.mode as number] || String(step.mode);
        const status = step.statecode === 0 ? "Enabled" : "Disabled";

        lines.push(`\n#### ${step.name}`);
        lines.push(
          `- Message: ${step.messageName || ""} | Entity: ${step.primaryEntity || "none"} | Stage: ${stage} | Mode: ${mode} | Status: ${status}`,
        );
        if (step.filteringattributes) {
          lines.push(`- Filtering: ${step.filteringattributes}`);
        }

        const stepImages = imagesByStepId.get(step.sdkmessageprocessingstepid) || [];
        if (stepImages.length > 0) {
          lines.push(`- Images (${stepImages.length}):`);
          for (const image of stepImages) {
            const imageType =
              IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype);
            lines.push(
              `  - ${image.name} (${imageType}, alias: ${image.entityalias || "none"}, attributes: ${image.attributes || "all"})`,
            );
          }
        }
      }
    }

    return createToolSuccessResponse(
      "get_plugin_details",
      lines.join("\n"),
      `Loaded plugin '${plugin.fullName}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        plugin,
        counts: {
          steps: steps.length,
          images: images.length,
        },
        steps: steps.map((step) => ({
          ...step,
          stageLabel: STAGE_LABELS[step.stage as number] || String(step.stage),
          modeLabel: MODE_LABELS[step.mode as number] || String(step.mode),
          statusLabel: step.statecode === 0 ? "Enabled" : "Disabled",
          images: (imagesByStepId.get(step.sdkmessageprocessingstepid) || []).map((image) => ({
            ...image,
            imageTypeLabel: IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype),
          })),
        })),
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_plugin_details", error);
  }
}

export const getPluginDetailsTool = defineTool({
  name: "get_plugin_details",
  description:
    "Get detailed information about one plugin class including its assembly, steps, and images. Workflow activities (CodeActivity) are excluded.",
  schema: getPluginDetailsSchema,
  handler: handleGetPluginDetails,
});

export function registerGetPluginDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getPluginDetailsTool, { config, client });
}
