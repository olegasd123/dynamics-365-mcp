import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  countStepsByPluginTypeId,
  fetchPluginMetadata,
  filterPluginClassesByRegistration,
} from "./plugin-class-metadata.js";

const listPluginsSchema = {
  environment: z.string().optional().describe("Environment name (e.g. 'dev', 'prod')"),
  filter: z
    .enum(["all", "no_steps"])
    .optional()
    .describe("Filter: 'all' (default) or 'no_steps' for orphaned plugin classes"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListPluginsParams = ToolParams<typeof listPluginsSchema>;

export async function handleListPlugins(
  { environment, filter, solution, limit, cursor }: ListPluginsParams,
  { config, client }: ToolContext,
) {
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
    const items = plugins
      .map((plugin) => ({
        ...plugin,
        stepCount: stepCountByPluginId.get(plugin.pluginTypeId) || 0,
      }))
      .sort(
        (left, right) =>
          left.assemblyName.localeCompare(right.assemblyName) ||
          left.fullName.localeCompare(right.fullName),
      );
    const page = buildPaginatedListData(
      items,
      {
        environment: env.name,
        filters: {
          filter: filter || "all",
          solution: solution || null,
        },
      },
      { limit, cursor },
    );

    if (page.totalCount === 0) {
      const text =
        filter === "no_steps"
          ? `No orphaned plugin classes found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`
          : `No plugin classes found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`;

      return createToolSuccessResponse("list_plugins", text, text, page);
    }

    const headers = ["Plugin", "Full Name", "Assembly", "Steps"];
    const rows = page.items.map((plugin) => [
      plugin.name,
      plugin.fullName,
      plugin.assemblyName,
      String(stepCountByPluginId.get(plugin.pluginTypeId) || 0),
    ]);
    const suffix = [
      filter === "no_steps" ? "orphaned - no steps" : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "plugin class",
      itemLabelPlural: "plugin classes",
      narrowHint: page.hasMore ? "Use filter or solution to narrow the result." : undefined,
    });
    const text = `## Plugins in '${env.name}'${suffix ? ` (${suffix})` : ""}\n\n${pageSummary}\n\n${formatTable(headers, rows)}`;

    return createToolSuccessResponse(
      "list_plugins",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_plugins", error);
  }
}

export const listPluginsTool = defineTool({
  name: "list_plugins",
  description:
    "List plugin classes (IPlugin implementations, also called plugin types) registered in Dynamics 365. Workflow activities (CodeActivity) are excluded. Use filter='no_steps' to find orphaned plugin classes with no registered steps.",
  schema: listPluginsSchema,
  handler: handleListPlugins,
});

export function registerListPlugins(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listPluginsTool, { config, client });
}
