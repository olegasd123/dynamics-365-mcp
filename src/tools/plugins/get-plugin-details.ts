import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  getPluginAssemblyByNameQuery,
  listPluginTypesForAssembliesQuery,
} from "../../queries/plugin-queries.js";
import { fetchPluginInventory } from "./plugin-inventory.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};
const MODE_LABELS: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };
const IMAGE_TYPE_LABELS: Record<number, string> = { 0: "PreImage", 1: "PostImage", 2: "Both" };

export function registerGetPluginDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_plugin_details",
    "Get detailed information about a plugin assembly including all types, steps, and images.",
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
          getPluginAssemblyByNameQuery(pluginName),
        );

        if (assemblies.length === 0) {
          const text = `Plugin assembly '${pluginName}' not found in '${env.name}'.`;
          return createToolSuccessResponse("get_plugin_details", text, text, {
            environment: env.name,
            found: false,
            pluginName,
          });
        }

        const assembly = assemblies[0];
        const lines: string[] = [];

        lines.push(`## Plugin: ${assembly.name}`);
        lines.push(`- **Version**: ${assembly.version}`);
        lines.push(`- **Isolation**: ${assembly.isolationmode === 2 ? "Sandbox" : "None"}`);
        lines.push(`- **Managed**: ${assembly.ismanaged ? "Yes" : "No"}`);
        lines.push(`- **Public Key Token**: ${assembly.publickeytoken || "(none)"}`);
        lines.push(`- **Created**: ${String(assembly.createdon || "").slice(0, 10)}`);
        lines.push(`- **Modified**: ${String(assembly.modifiedon || "").slice(0, 10)}`);
        lines.push("");

        const types = await client.query<Record<string, unknown>>(
          env,
          "plugintypes",
          listPluginTypesForAssembliesQuery([String(assembly.pluginassemblyid)]),
        );
        const inventory = await fetchPluginInventory(env, client, [assembly]);
        const stepsByPluginTypeId = new Map<string, Record<string, unknown>[]>();
        const imagesByStepId = new Map<string, Record<string, unknown>[]>();

        for (const step of inventory.steps) {
          const pluginTypeId = String(step.pluginTypeId || "");
          const steps = stepsByPluginTypeId.get(pluginTypeId) || [];
          steps.push(step);
          stepsByPluginTypeId.set(pluginTypeId, steps);
        }

        for (const image of inventory.images) {
          const stepId = String(image.sdkmessageprocessingstepid || "");
          const images = imagesByStepId.get(stepId) || [];
          images.push(image);
          imagesByStepId.set(stepId, images);
        }

        lines.push(`### Plugin Types (${types.length})`);

        for (const type of types) {
          lines.push(`\n#### ${type.name} (\`${type.typename}\`)`);
          if (type.isworkflowactivity) lines.push("  - *Workflow Activity*");

          const steps = stepsByPluginTypeId.get(String(type.plugintypeid || "")) || [];

          if (steps.length === 0) {
            lines.push("  - No registered steps");
            continue;
          }

          lines.push(`  **Steps (${steps.length}):**`);
          for (const step of steps) {
            const stage = STAGE_LABELS[step.stage as number] || String(step.stage);
            const mode = MODE_LABELS[step.mode as number] || String(step.mode);
            const status = step.statecode === 0 ? "Enabled" : "Disabled";

            lines.push(`  - **${step.name}**`);
            lines.push(
              `    Message: ${step.messageName || ""} | Entity: ${step.primaryEntity || "none"} | Stage: ${stage} | Mode: ${mode} | Status: ${status}`,
            );

            if (step.filteringattributes) {
              lines.push(`    Filtering: ${step.filteringattributes}`);
            }

            const images = imagesByStepId.get(String(step.sdkmessageprocessingstepid || "")) || [];

            if (images.length > 0) {
              lines.push(`    **Images (${images.length}):**`);
              for (const img of images) {
                const imgType = IMAGE_TYPE_LABELS[img.imagetype as number] || String(img.imagetype);
                lines.push(
                  `    - ${img.name} (${imgType}, alias: ${img.entityalias || "none"}, attributes: ${img.attributes || "all"})`,
                );
              }
            }
          }
        }

        const structuredTypes = types.map((type) => {
          const steps = (stepsByPluginTypeId.get(String(type.plugintypeid || "")) || []).map((step) => ({
            ...step,
            stageLabel: STAGE_LABELS[step.stage as number] || String(step.stage),
            modeLabel: MODE_LABELS[step.mode as number] || String(step.mode),
            statusLabel: step.statecode === 0 ? "Enabled" : "Disabled",
            images: (imagesByStepId.get(String(step.sdkmessageprocessingstepid || "")) || []).map((image) => ({
              ...image,
              imageTypeLabel: IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype),
            })),
          }));

          return {
            plugintypeid: String(type.plugintypeid || ""),
            name: String(type.name || ""),
            fullName: String(type.typename || ""),
            isWorkflowActivity: Boolean(type.isworkflowactivity),
            steps,
          };
        });

        return createToolSuccessResponse(
          "get_plugin_details",
          lines.join("\n"),
          `Loaded plugin '${String(assembly.name || pluginName)}' in '${env.name}'.`,
          {
            environment: env.name,
            found: true,
            plugin: {
              pluginassemblyid: String(assembly.pluginassemblyid || ""),
              name: String(assembly.name || ""),
              version: String(assembly.version || ""),
              isolation: assembly.isolationmode === 2 ? "Sandbox" : "None",
              managed: Boolean(assembly.ismanaged),
              publicKeyToken: String(assembly.publickeytoken || ""),
              createdOn: String(assembly.createdon || "").slice(0, 10),
              modifiedOn: String(assembly.modifiedon || "").slice(0, 10),
            },
            counts: {
              types: structuredTypes.length,
              steps: inventory.steps.length,
              images: inventory.images.length,
            },
            types: structuredTypes,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_plugin_details", error);
      }
    },
  );
}
