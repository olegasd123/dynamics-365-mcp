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
import { listPublishers } from "./publisher-metadata.js";

const listPublishersSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z
    .string()
    .optional()
    .describe("Optional filter for publisher display name or unique name"),
  prefixFilter: z.string().optional().describe("Optional filter for customization prefix"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListPublishersParams = ToolParams<typeof listPublishersSchema>;

export async function handleListPublishers(
  { environment, nameFilter, prefixFilter, limit, cursor }: ListPublishersParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const publishers = (await listPublishers(env, client, { nameFilter, prefixFilter })).sort(
      (left, right) =>
        left.friendlyname.localeCompare(right.friendlyname) ||
        left.uniquename.localeCompare(right.uniquename),
    );
    const page = buildPaginatedListData(
      publishers,
      {
        environment: env.name,
        filters: {
          nameFilter: nameFilter || null,
          prefixFilter: prefixFilter || null,
        },
      },
      { limit, cursor },
    );

    if (page.totalCount === 0) {
      const appliedFilters = [
        nameFilter ? `name='${nameFilter}'` : null,
        prefixFilter ? `prefix='${prefixFilter}'` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const text = `No publishers found in '${env.name}'${appliedFilters ? ` for ${appliedFilters}.` : "."}`;
      return createToolSuccessResponse("list_publishers", text, text, page);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "publisher",
      itemLabelPlural: "publishers",
      narrowHint: page.hasMore ? "Use nameFilter or prefixFilter to narrow the result." : undefined,
    });
    const filterSummary = [
      nameFilter ? `name='${nameFilter}'` : null,
      prefixFilter ? `prefix='${prefixFilter}'` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Publishers in '${env.name}'${filterSummary ? ` (${filterSummary})` : ""}\n\n${pageSummary}\n\n${formatTable(
      [
        "Display Name",
        "Unique Name",
        "Prefix",
        "Option Prefix",
        "Read Only",
        "Modified",
        "Row Version",
      ],
      page.items.map((publisher) => [
        publisher.friendlyname,
        publisher.uniquename,
        publisher.customizationprefix,
        publisher.customizationoptionvalueprefix === null
          ? "-"
          : String(publisher.customizationoptionvalueprefix),
        publisher.isreadonly ? "Yes" : "No",
        publisher.modifiedon.slice(0, 10),
        publisher.versionnumber || "-",
      ]),
    )}`;

    return createToolSuccessResponse(
      "list_publishers",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_publishers", error);
  }
}

export const listPublishersTool = defineTool({
  name: "list_publishers",
  description:
    "List Dataverse solution publishers with customization prefixes and option value prefixes.",
  schema: listPublishersSchema,
  handler: handleListPublishers,
});

export function registerListPublishers(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listPublishersTool, { config, client });
}
