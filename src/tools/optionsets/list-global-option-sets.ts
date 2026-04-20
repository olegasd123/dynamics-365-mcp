import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { listGlobalOptionSets } from "./option-set-metadata.js";

const listGlobalOptionSetsSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z
    .string()
    .optional()
    .describe("Optional filter for option set name, display name, or metadata id"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListGlobalOptionSetsParams = ToolParams<typeof listGlobalOptionSetsSchema>;

export async function handleListGlobalOptionSets(
  { environment, nameFilter, limit, cursor }: ListGlobalOptionSetsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const optionSets = await listGlobalOptionSets(env, client, nameFilter);
    const page = buildPaginatedListData(
      optionSets,
      {
        environment: env.name,
        filters: {
          nameFilter: nameFilter || null,
        },
      },
      { limit, cursor },
    );

    if (page.totalCount === 0) {
      const text = `No global option sets found in '${env.name}'${nameFilter ? ` for '${nameFilter}'.` : "."}`;
      return createToolSuccessResponse("list_global_option_sets", text, text, page);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "global option set",
      itemLabelPlural: "global option sets",
      narrowHint: page.hasMore ? "Use nameFilter to narrow the result." : undefined,
    });
    const text = `## Global Option Sets in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\n${pageSummary}\n\n${formatTable(
      ["Name", "Display Name", "Type", "Options", "Managed", "Custom", "Parent"],
      page.items.map((optionSet) => [
        optionSet.name,
        optionSet.displayName || "-",
        optionSet.optionSetType || "-",
        String(optionSet.optionCount),
        optionSet.isManaged ? "Yes" : "No",
        optionSet.isCustomOptionSet ? "Yes" : "No",
        optionSet.parentOptionSetName || "-",
      ]),
    )}`;

    return createToolSuccessResponse(
      "list_global_option_sets",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_global_option_sets", error);
  }
}

export const listGlobalOptionSetsTool = defineTool({
  name: "list_global_option_sets",
  description:
    "List Dataverse global option sets (shared choices) separately from column-local option sets.",
  schema: listGlobalOptionSetsSchema,
  handler: handleListGlobalOptionSets,
});

export function registerListGlobalOptionSets(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listGlobalOptionSetsTool, { config, client });
}
