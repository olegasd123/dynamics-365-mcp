import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listAppModules } from "./alm-metadata.js";

export function registerListAppModules(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_app_modules",
    "List app modules with state and managed status.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional filter for name or unique name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const apps = await listAppModules(env, client, { nameFilter, solution });

        if (apps.length === 0) {
          const text = `No app modules found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_app_modules", text, text, {
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

        const text = `## App Modules in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${apps.length} app module(s).\n\n${formatTable(
          ["Name", "Unique Name", "State", "Managed", "Modified"],
          apps.map((app) => [
            app.name,
            app.uniquename,
            app.stateLabel,
            app.ismanaged ? "Yes" : "No",
            app.modifiedon.slice(0, 10),
          ]),
        )}`;

        return createToolSuccessResponse(
          "list_app_modules",
          text,
          `Found ${apps.length} app module(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: apps.length,
            items: apps,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_app_modules", error);
      }
    },
  );
}
