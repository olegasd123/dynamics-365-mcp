import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPluginMetadata, resolvePluginAssembly } from "./plugin-class-metadata.js";

const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "PreImage",
  1: "PostImage",
  2: "Both",
};

export async function handleListPluginAssemblyImages(
  {
    environment,
    assemblyName,
    stepName,
    message,
  }: {
    environment?: string;
    assemblyName: string;
    stepName?: string;
    message?: string;
  },
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const inventory = await fetchPluginMetadata(env, client, {
      includeSteps: true,
      includeImages: true,
    });
    let assembly: Record<string, unknown>;
    try {
      assembly = resolvePluginAssembly(inventory.assemblies, assemblyName);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === `Plugin assembly '${assemblyName}' not found.`
      ) {
        const text = `Plugin assembly '${assemblyName}' not found in '${env.name}'.`;
        return createToolSuccessResponse("list_plugin_assembly_images", text, text, {
          environment: env.name,
          found: false,
          assemblyName,
        });
      }
      throw error;
    }
    const allImages = inventory.images.filter((image) => {
      if (image.assemblyId !== String(assembly.pluginassemblyid || "")) {
        return false;
      }
      if (message && String(image.messageName || "").toLowerCase() !== message.toLowerCase()) {
        return false;
      }
      if (stepName && String(image.stepName || "") !== stepName) {
        return false;
      }
      return true;
    });

    if (allImages.length === 0) {
      let filterDesc = `plugin assembly '${assemblyName}'`;
      if (message) filterDesc += ` (message: ${message})`;
      if (stepName) filterDesc += ` (step: ${stepName})`;
      const text = `No images found for ${filterDesc} in '${env.name}'.`;
      return createToolSuccessResponse("list_plugin_assembly_images", text, text, {
        environment: env.name,
        found: true,
        assemblyName,
        filters: { stepName: stepName || null, message: message || null },
        count: 0,
        items: [],
      });
    }

    const headers = ["Step", "Message", "Image Name", "Alias", "Type", "Attributes"];
    const rows = allImages.map((image) => [
      String(image.stepName || ""),
      String(image.messageName || ""),
      String(image.name || ""),
      String(image.entityalias || ""),
      IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype),
      String(image.attributes || "(all)"),
    ]);

    const items = allImages.map((image) => ({
      ...image,
      imageTypeLabel: IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype),
    }));
    const text = `## Plugin Assembly Images for '${assemblyName}' in '${env.name}'\n\nFound ${allImages.length} image(s).\n\n${formatTable(headers, rows)}`;
    return createToolSuccessResponse(
      "list_plugin_assembly_images",
      text,
      `Found ${allImages.length} image(s) for plugin assembly '${assemblyName}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        assemblyName,
        filters: { stepName: stepName || null, message: message || null },
        count: allImages.length,
        items,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_plugin_assembly_images", error);
  }
}

export const listPluginAssemblyImagesTool = defineTool({
  name: "list_plugin_assembly_images",
  description:
    "List pre/post entity images registered on steps for a plugin assembly in Dynamics 365.",
  schema: {
    environment: z.string().optional().describe("Environment name"),
    assemblyName: z.string().describe("Name of the plugin assembly"),
    stepName: z.string().optional().describe("Filter by specific step name"),
    message: z.string().optional().describe("Filter by message name (e.g. 'Create', 'Update')"),
  },
  handler: handleListPluginAssemblyImages,
});

export function registerListPluginAssemblyImages(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listPluginAssemblyImagesTool, { config, client });
}
