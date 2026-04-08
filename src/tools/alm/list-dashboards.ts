import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listDashboards } from "./alm-metadata.js";

export function registerListDashboards(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_dashboards",
    "List dashboards with table, type, and managed status.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional filter for dashboard name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const dashboards = await listDashboards(env, client, { nameFilter, solution });

        if (dashboards.length === 0) {
          const text = `No dashboards found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_dashboards", text, text, {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: 0,
            items: [],
          });
        }

        const filterDesc = [
          nameFilter ? `filter='${nameFilter}'` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Dashboards in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${dashboards.length} dashboard(s).\n\n${formatTable(
          ["Name", "Table", "Type", "Managed", "Modified"],
          dashboards.map((dashboard) => [
            dashboard.name,
            dashboard.objecttypecode || "-",
            dashboard.typeLabel,
            dashboard.ismanaged ? "Yes" : "No",
            dashboard.modifiedon.slice(0, 10),
          ]),
        )}`;

        return createToolSuccessResponse(
          "list_dashboards",
          text,
          `Found ${dashboards.length} dashboard(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: dashboards.length,
            items: dashboards,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_dashboards", error);
      }
    },
  );
}
