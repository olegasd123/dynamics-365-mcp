import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listViews } from "./view-metadata.js";

const STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

export function registerListViews(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_views",
    "List system or personal views with normalized metadata.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z.string().optional().describe("Optional table logical name"),
      scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
      nameFilter: z.string().optional().describe("Optional view name filter"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name. Applied to system views only."),
    },
    async ({ environment, table, scope, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const views = await listViews(env, client, {
          table,
          scope: scope as ViewScope | undefined,
          nameFilter,
          solution,
        });

        if (views.length === 0) {
          const text = `No views found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_views", text, text, {
            environment: env.name,
            filters: { table: table || null, scope: scope || null, nameFilter: nameFilter || null, solution: solution || null },
            count: 0,
            items: [],
          });
        }

        const rows = views.map((view) => [
          view.returnedtypecode,
          view.scope,
          view.name,
          view.queryTypeLabel,
          view.isdefault ? "Yes" : "No",
          view.isquickfindquery ? "Yes" : "No",
          STATE_LABELS[view.statecode] || String(view.statecode),
          String(view.modifiedon || "").slice(0, 10),
        ]);

        const filterDesc = [
          table ? `table='${table}'` : "",
          scope ? `scope='${scope}'` : "",
          nameFilter ? `filter='${nameFilter}'` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Views in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${views.length} view(s).\n\n${formatTable(
          ["Table", "Scope", "Name", "Type", "Default", "Quick Find", "State", "Modified"],
          rows,
        )}`;
        return createToolSuccessResponse("list_views", text, `Found ${views.length} view(s) in '${env.name}'.`, {
          environment: env.name,
          filters: { table: table || null, scope: scope || null, nameFilter: nameFilter || null, solution: solution || null },
          count: views.length,
          items: views,
        });
      } catch (error) {
        return createToolErrorResponse("list_views", error);
      }
    },
  );
}
