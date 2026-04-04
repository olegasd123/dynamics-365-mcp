import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
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
      nameFilter: z
        .string()
        .optional()
        .describe("Optional filter for display name or unique name"),
    },
    async ({ environment, nameFilter }) => {
      try {
        const env = getEnvironment(config, environment);
        const solutions = await listSolutions(env, client, nameFilter);

        if (solutions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No solutions found in '${env.name}'${nameFilter ? ` for '${nameFilter}'.` : "."}`,
              },
            ],
          };
        }

        const headers = ["Display Name", "Unique Name", "Version", "Managed", "Modified"];
        const rows = solutions.map((solution) => [
          solution.friendlyname,
          solution.uniquename,
          String(solution.version || ""),
          solution.ismanaged ? "Yes" : "No",
          String(solution.modifiedon || "").slice(0, 10),
        ]);

        const text = `## Solutions in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\nFound ${solutions.length} solution(s).\n\n${formatTable(headers, rows)}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
