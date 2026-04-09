import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listSolutions } from "./solution-inventory.js";

export function registerListSolutions(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_solutions",
    "List Dynamics 365 solutions. Users can later select a solution by display name or unique name.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional filter for display name or unique name"),
      limit: LIST_LIMIT_SCHEMA,
      cursor: LIST_CURSOR_SCHEMA,
    },
    async ({ environment, nameFilter, limit, cursor }) => {
      try {
        const env = getEnvironment(config, environment);
        const solutions = (await listSolutions(env, client, nameFilter)).sort(
          (left, right) =>
            left.friendlyname.localeCompare(right.friendlyname) ||
            left.uniquename.localeCompare(right.uniquename),
        );
        const page = buildPaginatedListData(
          solutions,
          {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
            },
          },
          { limit, cursor },
        );

        if (page.totalCount === 0) {
          const text = `No solutions found in '${env.name}'${nameFilter ? ` for '${nameFilter}'.` : "."}`;
          return createToolSuccessResponse("list_solutions", text, text, page);
        }

        const headers = ["Display Name", "Unique Name", "Version", "Managed", "Modified"];
        const rows = page.items.map((solution) => [
          solution.friendlyname,
          solution.uniquename,
          String(solution.version || ""),
          solution.ismanaged ? "Yes" : "No",
          String(solution.modifiedon || "").slice(0, 10),
        ]);
        const pageSummary = buildPaginatedListSummary({
          cursor: page.cursor,
          returnedCount: page.returnedCount,
          totalCount: page.totalCount,
          hasMore: page.hasMore,
          nextCursor: page.nextCursor,
          itemLabelSingular: "solution",
          itemLabelPlural: "solutions",
          narrowHint: page.hasMore ? "Use nameFilter to narrow the result." : undefined,
        });

        const text = `## Solutions in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\n${pageSummary}\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse(
          "list_solutions",
          text,
          `${pageSummary} Environment: '${env.name}'.`,
          page,
        );
      } catch (error) {
        return createToolErrorResponse("list_solutions", error);
      }
    },
  );
}
