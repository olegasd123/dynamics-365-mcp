import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginTypesQuery, listPluginStepsQuery, listPluginImagesQuery } from "../../queries/plugin-queries.js";
import { buildQueryString } from "../../utils/odata-helpers.js";

const STAGE_LABELS: Record<number, string> = { 10: "Pre-Validation", 20: "Pre-Operation", 40: "Post-Operation" };
const MODE_LABELS: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };
const IMAGE_TYPE_LABELS: Record<number, string> = { 0: "PreImage", 1: "PostImage", 2: "Both" };

export function registerGetPluginDetails(server: McpServer, config: AppConfig, client: DynamicsClient) {
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
          buildQueryString({
            select: ["pluginassemblyid", "name", "version", "publickeytoken", "isolationmode", "ismanaged", "createdon", "modifiedon"],
            filter: `name eq '${pluginName}'`,
          })
        );

        if (assemblies.length === 0) {
          return {
            content: [{ type: "text" as const, text: `Plugin assembly '${pluginName}' not found in '${env.name}'.` }],
          };
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
          listPluginTypesQuery(assembly.pluginassemblyid as string)
        );

        lines.push(`### Plugin Types (${types.length})`);

        for (const type of types) {
          lines.push(`\n#### ${type.name} (\`${type.typename}\`)`);
          if (type.isworkflowactivity) lines.push("  - *Workflow Activity*");

          const steps = await client.query<Record<string, unknown>>(
            env,
            "sdkmessageprocessingsteps",
            listPluginStepsQuery(type.plugintypeid as string)
          );

          if (steps.length === 0) {
            lines.push("  - No registered steps");
            continue;
          }

          lines.push(`  **Steps (${steps.length}):**`);
          for (const step of steps) {
            const msg = (step.sdkmessageid as Record<string, unknown>)?.name || "";
            const entity = (step.sdkmessagefilterid as Record<string, unknown>)?.primaryobjecttypecode || "none";
            const stage = STAGE_LABELS[step.stage as number] || String(step.stage);
            const mode = MODE_LABELS[step.mode as number] || String(step.mode);
            const status = step.statecode === 0 ? "Enabled" : "Disabled";

            lines.push(`  - **${step.name}**`);
            lines.push(`    Message: ${msg} | Entity: ${entity} | Stage: ${stage} | Mode: ${mode} | Status: ${status}`);

            if (step.filteringattributes) {
              lines.push(`    Filtering: ${step.filteringattributes}`);
            }

            const images = await client.query<Record<string, unknown>>(
              env,
              "sdkmessageprocessingstepimages",
              listPluginImagesQuery(step.sdkmessageprocessingstepid as string)
            );

            if (images.length > 0) {
              lines.push(`    **Images (${images.length}):**`);
              for (const img of images) {
                const imgType = IMAGE_TYPE_LABELS[img.imagetype as number] || String(img.imagetype);
                lines.push(`    - ${img.name} (${imgType}, alias: ${img.entityalias || "none"}, attributes: ${img.attributes || "all"})`);
              }
            }
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
