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

export function registerListPluginImages(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_plugin_images",
    "List pre/post entity images registered on plugin steps in Dynamics 365.",
    {
      environment: z.string().optional().describe("Environment name"),
      pluginName: z.string().describe("Name of the plugin assembly"),
      stepName: z.string().optional().describe("Filter by specific step name"),
      message: z.string().optional().describe("Filter by message name (e.g. 'Create', 'Update')"),
    },
    async ({ environment, pluginName, stepName, message }) => {
      try {
        const env = getEnvironment(config, environment);

        // First get assemblies matching the name
        const assemblies = await client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          getPluginAssemblyByNameQuery(pluginName, ["pluginassemblyid", "name"]),
        );

        if (assemblies.length === 0) {
          const text = `Plugin assembly '${pluginName}' not found in '${env.name}'.`;
          return createToolSuccessResponse("list_plugin_images", text, text, {
            environment: env.name,
            found: false,
            pluginName,
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
          let filterDesc = `plugin '${pluginName}'`;
          if (message) filterDesc += ` (message: ${message})`;
          if (stepName) filterDesc += ` (step: ${stepName})`;
          const text = `No images found for ${filterDesc} in '${env.name}'.`;
          return createToolSuccessResponse("list_plugin_images", text, text, {
            environment: env.name,
            found: true,
            pluginName,
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
        const text = `## Plugin Images for '${pluginName}' in '${env.name}'\n\nFound ${allImages.length} image(s).\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse("list_plugin_images", text, `Found ${allImages.length} plugin image(s) for '${pluginName}' in '${env.name}'.`, {
          environment: env.name,
          found: true,
          pluginName,
          filters: { stepName: stepName || null, message: message || null },
          count: allImages.length,
          items,
        });
      } catch (error) {
        return createToolErrorResponse("list_plugin_images", error);
      }
    },
  );
}
