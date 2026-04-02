import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery, listPluginTypesQuery, listPluginStepsQuery } from "../../queries/plugin-queries.js";
import { formatTable } from "../../utils/formatters.js";

export function registerListPlugins(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "list_plugins",
    "List plugin assemblies registered in Dynamics 365. Use filter='no_steps' to find orphaned plugins with no registered steps.",
    {
      environment: z.string().optional().describe("Environment name (e.g. 'dev', 'prod')"),
      filter: z.enum(["all", "no_steps"]).optional().describe("Filter: 'all' (default) or 'no_steps' for orphaned plugins"),
    },
    async ({ environment, filter }) => {
      try {
        const env = getEnvironment(config, environment);
        const assemblies = await client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          listPluginAssembliesQuery()
        );

        let results = assemblies;

        if (filter === "no_steps") {
          const orphaned: Record<string, unknown>[] = [];

          for (const assembly of assemblies) {
            const types = await client.query<Record<string, unknown>>(
              env,
              "plugintypes",
              listPluginTypesQuery(assembly.pluginassemblyid as string)
            );

            let hasSteps = false;
            for (const type of types) {
              const steps = await client.query<Record<string, unknown>>(
                env,
                "sdkmessageprocessingsteps",
                listPluginStepsQuery(type.plugintypeid as string)
              );
              if (steps.length > 0) {
                hasSteps = true;
                break;
              }
            }

            if (!hasSteps) {
              orphaned.push(assembly);
            }
          }

          results = orphaned;
        }

        if (results.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: filter === "no_steps"
                ? `No orphaned plugins found in '${env.name}'.`
                : `No plugins found in '${env.name}'.`,
            }],
          };
        }

        const headers = ["Name", "Version", "Isolation", "Managed", "Modified"];
        const rows = results.map((a) => [
          String(a.name || ""),
          String(a.version || ""),
          a.isolationmode === 2 ? "Sandbox" : "None",
          a.ismanaged ? "Yes" : "No",
          String(a.modifiedon || "").slice(0, 10),
        ]);

        const text = `## Plugins in '${env.name}'${filter === "no_steps" ? " (orphaned — no steps)" : ""}\n\nFound ${results.length} plugin(s).\n\n${formatTable(headers, rows)}`;

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
