import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { WorkflowState } from "../../queries/workflow-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { listCloudFlows } from "./flow-metadata.js";

export function registerListCloudFlows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_cloud_flows",
    "List cloud flows stored in Dataverse workflow metadata.",
    {
      environment: z.string().optional().describe("Environment name"),
      status: z.enum(["draft", "activated", "suspended"]).optional().describe("Optional status filter"),
      nameFilter: z.string().optional().describe("Optional name or unique name filter"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, status, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const flows = await listCloudFlows(env, client, {
          status: status as WorkflowState | undefined,
          nameFilter,
          solution,
        });

        if (flows.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No cloud flows found in '${env.name}'.` },
            ],
          };
        }

        const rows = flows.map((flow) => [
          flow.name,
          flow.uniquename || "-",
          flow.stateLabel,
          flow.typeLabel,
          flow.ownerName || "-",
          flow.ismanaged ? "Yes" : "No",
          String(flow.modifiedon || "").slice(0, 10),
        ]);

        const filterDesc = [
          status ? `status='${status}'` : "",
          nameFilter ? `filter='${nameFilter}'` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Cloud Flows in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${flows.length} flow(s).\n\n${formatTable(
          ["Name", "Unique Name", "State", "Type", "Owner", "Managed", "Modified"],
          rows,
        )}`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    },
  );
}
