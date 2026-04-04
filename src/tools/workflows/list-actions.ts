import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listActionsQuery } from "../../queries/workflow-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";

const STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

export function registerListActions(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "list_actions",
    "List custom actions registered in Dynamics 365.",
    {
      environment: z.string().optional().describe("Environment name"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name"),
    },
    async ({ environment, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        let actions = await client.query<Record<string, unknown>>(
          env,
          "workflows",
          listActionsQuery(),
        );

        if (solution) {
          const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
          actions = actions.filter((action) =>
            solutionComponents.workflowIds.has(String(action.workflowid || "")),
          );
        }

        if (actions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No custom actions found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`,
              },
            ],
          };
        }

        const headers = ["Name", "Unique Name", "Status", "Entity", "Managed", "Modified"];
        const rows = actions.map((a) => [
          String(a.name || ""),
          String(a.uniquename || ""),
          STATE_LABELS[a.statecode as number] || String(a.statecode),
          String(a.primaryentity || "none"),
          a.ismanaged ? "Yes" : "No",
          String(a.modifiedon || "").slice(0, 10),
        ]);

        const text = `## Custom Actions in '${env.name}'${solution ? ` (solution='${solution}')` : ""}\n\nFound ${actions.length} action(s).\n\n${formatTable(headers, rows)}`;
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
