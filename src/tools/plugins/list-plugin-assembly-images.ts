import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { getPluginAssemblyByNameQuery } from "../../queries/plugin-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPluginInventory } from "./plugin-inventory.js";

const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "PreImage",
  1: "PostImage",
  2: "Both",
};

const NEW_SCHEMA = {
  environment: z.string().optional().describe("Environment name"),
  assemblyName: z.string().describe("Name of the plugin assembly"),
  stepName: z.string().optional().describe("Filter by specific step name"),
  message: z.string().optional().describe("Filter by message name (e.g. 'Create', 'Update')"),
};

const LEGACY_SCHEMA = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z.string().describe("Name of the plugin assembly"),
  stepName: z.string().optional().describe("Filter by specific step name"),
  message: z.string().optional().describe("Filter by message name (e.g. 'Create', 'Update')"),
};

export function registerListPluginAssemblyImages(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  const createHandler =
    (toolName: string) =>
    async ({
      environment,
      assemblyName,
      stepName,
      message,
    }: {
      environment?: string;
      assemblyName: string;
      stepName?: string;
      message?: string;
    }) => {
      try {
        const env = getEnvironment(config, environment);

        // First get assemblies matching the name
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

        const inventory = await fetchPluginInventory(env, client, assemblies);
        const allImages = inventory.images.filter((image) => {
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
          return createToolSuccessResponse(toolName, text, text, {
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
          toolName,
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
        return createToolErrorResponse(toolName, error);
      }
    };

  server.tool(
    "list_plugin_assembly_images",
    "List pre/post entity images registered on steps for a plugin assembly in Dynamics 365.",
    NEW_SCHEMA,
    createHandler("list_plugin_assembly_images"),
  );

  server.tool(
    "list_plugin_images",
    "Deprecated alias for the assembly-level tool `list_plugin_assembly_images`. Lists images for plugin assembly steps, not for one plugin class.",
    LEGACY_SCHEMA,
    async ({ environment, pluginName, stepName, message }) =>
      createHandler("list_plugin_images")({
        environment,
        assemblyName: pluginName,
        stepName,
        message,
      }),
  );
}
