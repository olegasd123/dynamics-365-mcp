import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";

const TYPE_LABELS: Record<number, string> = {
  1: "HTML",
  2: "CSS",
  3: "JS",
  4: "XML",
  5: "PNG",
  6: "JPG",
  7: "GIF",
  8: "XAP",
  9: "XSL",
  10: "ICO",
  11: "SVG",
  12: "RESX",
};

export function registerListWebResources(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_web_resources",
    "List web resources in Dynamics 365, optionally filtered by type or name.",
    {
      environment: z.string().optional().describe("Environment name"),
      type: z
        .enum(["html", "css", "js", "xml", "png", "jpg", "gif", "xap", "xsl", "ico", "svg", "resx"])
        .optional()
        .describe("Filter by web resource type"),
      nameFilter: z.string().optional().describe("Filter by name (contains match)"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
      limit: LIST_LIMIT_SCHEMA,
      cursor: LIST_CURSOR_SCHEMA,
    },
    async ({ environment, type, nameFilter, solution, limit, cursor }) => {
      try {
        const env = getEnvironment(config, environment);
        let resources = await client.query<Record<string, unknown>>(
          env,
          "webresourceset",
          listWebResourcesQuery({
            type: type as WebResourceType | undefined,
            nameFilter,
          }),
        );

        if (solution) {
          const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
          resources = resources.filter((resource) =>
            solutionComponents.webResourceIds.has(String(resource.webresourceid || "")),
          );
        }
        const items = resources
          .map((resource) => ({
            ...resource,
            name: String(resource.name || ""),
            displayname: String(resource.displayname || ""),
            ismanaged: Boolean(resource.ismanaged),
            modifiedon: String(resource.modifiedon || ""),
            typeLabel:
              TYPE_LABELS[resource.webresourcetype as number] || String(resource.webresourcetype),
          }))
          .sort((left, right) => left.name.localeCompare(right.name));
        const page = buildPaginatedListData(
          items,
          {
            environment: env.name,
            filters: {
              type: type || null,
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
          },
          { limit, cursor },
        );

        if (page.totalCount === 0) {
          const text = `No web resources found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_web_resources", text, text, page);
        }

        const headers = ["Name", "Display Name", "Type", "Managed", "Modified"];
        const rows = page.items.map((resource) => [
          String(resource.name || ""),
          String(resource.displayname || ""),
          String(resource.typeLabel || ""),
          resource.ismanaged ? "Yes" : "No",
          String(resource.modifiedon || "").slice(0, 10),
        ]);

        const filterDesc = [
          type ? `type=${type}` : "",
          nameFilter ? `name contains '${nameFilter}'` : "",
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
          itemLabelSingular: "web resource",
          itemLabelPlural: "web resources",
          narrowHint: page.hasMore
            ? "Use type, nameFilter, or solution to narrow the result."
            : undefined,
        });
        const text = `## Web Resources in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse(
          "list_web_resources",
          text,
          `${pageSummary} Environment: '${env.name}'.`,
          page,
        );
      } catch (error) {
        return createToolErrorResponse("list_web_resources", error);
      }
    },
  );
}
