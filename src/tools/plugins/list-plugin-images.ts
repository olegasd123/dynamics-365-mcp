import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginStepsQuery, listPluginImagesQuery, listPluginTypesQuery } from "../../queries/plugin-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { buildQueryString } from "../../utils/odata-helpers.js";

const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "PreImage",
  1: "PostImage",
  2: "Both",
};

export function registerListPluginImages(server: McpServer, config: AppConfig, client: DynamicsClient) {
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
          buildQueryString({
            select: ["pluginassemblyid", "name"],
            filter: `name eq '${pluginName}'`,
          })
        );

        if (assemblies.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Plugin assembly '${pluginName}' not found in '${env.name}'.` }],
          };
        }

        const assemblyId = assemblies[0].pluginassemblyid as string;

        // Get plugin types for the assembly
        const types = await client.query<Record<string, unknown>>(
          env,
          "plugintypes",
          listPluginTypesQuery(assemblyId)
        );

        // Get steps for all types, then images for each step
        const allImages: { stepName: string; messageName: string; image: Record<string, unknown> }[] = [];

        for (const type of types) {
          const steps = await client.query<Record<string, unknown>>(
            env,
            "sdkmessageprocessingsteps",
            listPluginStepsQuery(type.plugintypeid as string)
          );

          for (const step of steps) {
            const msgName = (step.sdkmessageid as Record<string, unknown>)?.name as string || "";

            if (message && msgName.toLowerCase() !== message.toLowerCase()) continue;
            if (stepName && step.name !== stepName) continue;

            const images = await client.query<Record<string, unknown>>(
              env,
              "sdkmessageprocessingstepimages",
              listPluginImagesQuery(step.sdkmessageprocessingstepid as string)
            );

            for (const img of images) {
              allImages.push({
                stepName: String(step.name || ""),
                messageName: msgName,
                image: img,
              });
            }
          }
        }

        if (allImages.length === 0) {
          let filterDesc = `plugin '${pluginName}'`;
          if (message) filterDesc += ` (message: ${message})`;
          if (stepName) filterDesc += ` (step: ${stepName})`;
          return {
            content: [{ type: "text" as const, text: `No images found for ${filterDesc} in '${env.name}'.` }],
          };
        }

        const headers = ["Step", "Message", "Image Name", "Alias", "Type", "Attributes"];
        const rows = allImages.map((entry) => [
          entry.stepName,
          entry.messageName,
          String(entry.image.name || ""),
          String(entry.image.entityalias || ""),
          IMAGE_TYPE_LABELS[entry.image.imagetype as number] || String(entry.image.imagetype),
          String(entry.image.attributes || "(all)"),
        ]);

        const text = `## Plugin Images for '${pluginName}' in '${env.name}'\n\nFound ${allImages.length} image(s).\n\n${formatTable(headers, rows)}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
