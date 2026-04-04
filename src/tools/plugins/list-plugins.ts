import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listPluginAssembliesQuery,
} from "../../queries/plugin-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPluginSteps } from "./plugin-inventory.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";

export function registerListPlugins(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "list_plugins",
    "List plugin assemblies registered in Dynamics 365. Use filter='no_steps' to find orphaned plugins with no registered steps.",
    {
      environment: z.string().optional().describe("Environment name (e.g. 'dev', 'prod')"),
      filter: z
        .enum(["all", "no_steps"])
        .optional()
        .describe("Filter: 'all' (default) or 'no_steps' for orphaned plugins"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name"),
    },
    async ({ environment, filter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const solutionComponents = solution
          ? await fetchSolutionComponentSets(env, client, solution)
          : undefined;
        const assemblies = await client.query<Record<string, unknown>>(
          env,
          "pluginassemblies",
          listPluginAssembliesQuery(),
        );

        let results = assemblies;

        if (solutionComponents) {
          results = results.filter((assembly) =>
            solutionComponents.pluginAssemblyIds.has(String(assembly.pluginassemblyid || "")),
          );
        }

        if (filter === "no_steps") {
          const steps = await fetchPluginSteps(env, client, assemblies);
          const assemblyIdsWithSteps = new Set(steps.map((step) => String(step.assemblyId || "")));
          results = assemblies.filter(
            (assembly) => !assemblyIdsWithSteps.has(String(assembly.pluginassemblyid || "")),
          );
          if (solutionComponents) {
            results = results.filter((assembly) =>
              solutionComponents.pluginAssemblyIds.has(String(assembly.pluginassemblyid || "")),
            );
          }
        }

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  filter === "no_steps"
                    ? `No orphaned plugins found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`
                    : `No plugins found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`,
              },
            ],
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

        const suffix = [
          filter === "no_steps" ? "orphaned - no steps" : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const text = `## Plugins in '${env.name}'${suffix ? ` (${suffix})` : ""}\n\nFound ${results.length} plugin(s).\n\n${formatTable(headers, rows)}`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
