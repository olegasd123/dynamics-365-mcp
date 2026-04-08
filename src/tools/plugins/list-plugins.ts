import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  countStepsByPluginTypeId,
  fetchPluginMetadata,
  filterPluginClassesByRegistration,
} from "./plugin-class-metadata.js";

export function registerListPlugins(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "list_plugins",
    "List plugin classes (IPlugin implementations, also called plugin types) registered in Dynamics 365. Workflow activities (CodeActivity) are excluded. Use filter='no_steps' to find orphaned plugin classes with no registered steps.",
    {
      environment: z.string().optional().describe("Environment name (e.g. 'dev', 'prod')"),
      filter: z
        .enum(["all", "no_steps"])
        .optional()
        .describe("Filter: 'all' (default) or 'no_steps' for orphaned plugin classes"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, filter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchPluginMetadata(env, client, {
          solution,
          includeSteps: true,
          includeImages: false,
        });
        const stepCountByPluginId = countStepsByPluginTypeId(inventory.steps);
        const plugins = filterPluginClassesByRegistration(
          inventory.pluginClasses,
          inventory.steps,
          filter,
        );

        if (plugins.length === 0) {
          const text =
            filter === "no_steps"
              ? `No orphaned plugin classes found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`
              : `No plugin classes found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`;

          return createToolSuccessResponse("list_plugins", text, text, {
            environment: env.name,
            filter: filter || "all",
            solution: solution || null,
            count: 0,
            items: [],
          });
        }

        const headers = ["Plugin", "Full Name", "Assembly", "Steps"];
        const rows = plugins.map((plugin) => [
          plugin.name,
          plugin.fullName,
          plugin.assemblyName,
          String(stepCountByPluginId.get(plugin.pluginTypeId) || 0),
        ]);
        const items = plugins.map((plugin) => ({
          ...plugin,
          stepCount: stepCountByPluginId.get(plugin.pluginTypeId) || 0,
        }));
        const suffix = [
          filter === "no_steps" ? "orphaned - no steps" : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const pluginLabel = plugins.length === 1 ? "plugin class" : "plugin classes";
        const text = `## Plugins in '${env.name}'${suffix ? ` (${suffix})` : ""}\n\nFound ${plugins.length} ${pluginLabel}.\n\n${formatTable(headers, rows)}`;

        return createToolSuccessResponse(
          "list_plugins",
          text,
          `Found ${plugins.length} ${pluginLabel} in '${env.name}'.`,
          {
            environment: env.name,
            filter: filter || "all",
            solution: solution || null,
            count: plugins.length,
            items,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_plugins", error);
      }
    },
  );
}
