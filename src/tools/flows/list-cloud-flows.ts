import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { WorkflowState } from "../../queries/workflow-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
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
      status: z
        .enum(["draft", "activated", "suspended"])
        .optional()
        .describe("Optional status filter"),
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
          const text = `No cloud flows found in '${env.name}'.`;
          return createToolSuccessResponse("list_cloud_flows", text, text, {
            environment: env.name,
            filters: {
              status: status || null,
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: 0,
            items: [],
          });
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

        return createToolSuccessResponse(
          "list_cloud_flows",
          text,
          `Found ${flows.length} cloud flow(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              status: status || null,
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: flows.length,
            items: flows,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_cloud_flows", error);
      }
    },
  );
}
