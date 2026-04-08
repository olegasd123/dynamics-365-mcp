import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPluginMetadata, filterAssembliesByRegistration } from "./plugin-class-metadata.js";

export function registerListPluginAssemblies(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_plugin_assemblies",
    "List plugin assemblies registered in Dynamics 365. Use filter='no_steps' to find orphaned plugin assemblies with no registered steps.",
    {
      environment: z.string().optional().describe("Environment name (e.g. 'dev', 'prod')"),
      filter: z
        .enum(["all", "no_steps"])
        .optional()
        .describe("Filter: 'all' (default) or 'no_steps' for orphaned plugin assemblies"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({
      environment,
      filter,
      solution,
    }: {
      environment?: string;
      filter?: "all" | "no_steps";
      solution?: string;
    }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchPluginMetadata(env, client, {
          solution,
          includeSteps: true,
          includeImages: false,
        });
        const results = filterAssembliesByRegistration(
          inventory.assemblies,
          inventory.steps,
          filter,
        );

        const items = results.map((assembly) => ({
          ...assembly,
          isolation: assembly.isolationmode === 2 ? "Sandbox" : "None",
          managed: Boolean(assembly.ismanaged),
          modifiedOn: String(assembly.modifiedon || "").slice(0, 10),
        }));

        if (results.length === 0) {
          const text =
            filter === "no_steps"
              ? `No orphaned plugin assemblies found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`
              : `No plugin assemblies found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`;

          return createToolSuccessResponse("list_plugin_assemblies", text, text, {
            environment: env.name,
            filter: filter || "all",
            solution: solution || null,
            count: 0,
            items: [],
          });
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
        const assemblyLabel = results.length === 1 ? "plugin assembly" : "plugin assemblies";
        const text = `## Plugin Assemblies in '${env.name}'${suffix ? ` (${suffix})` : ""}\n\nFound ${results.length} ${assemblyLabel}.\n\n${formatTable(headers, rows)}`;

        return createToolSuccessResponse(
          "list_plugin_assemblies",
          text,
          `Found ${results.length} ${assemblyLabel} in '${env.name}'.`,
          {
            environment: env.name,
            filter: filter || "all",
            solution: solution || null,
            count: results.length,
            items,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_plugin_assemblies", error);
      }
    },
  );
}
