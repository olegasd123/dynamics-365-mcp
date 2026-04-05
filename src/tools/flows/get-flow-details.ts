import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchFlowDetails } from "./flow-metadata.js";

export function registerGetFlowDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_flow_details",
    "Show cloud flow metadata and a parsed summary of triggers, actions, and connections.",
    {
      environment: z.string().optional().describe("Environment name"),
      flowName: z.string().describe("Cloud flow display name or unique name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, flowName, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const flow = await fetchFlowDetails(env, client, flowName, solution);
        const lines: string[] = [];

        lines.push(`## Cloud Flow: ${flow.name}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Unique Name: ${flow.uniquename || "-"}`);
        lines.push(`- Workflow Id: ${flow.workflowid}`);
        lines.push(`- Workflow Id Unique: ${flow.workflowidunique || "-"}`);
        lines.push(`- State: ${flow.stateLabel}`);
        lines.push(`- Type: ${flow.typeLabel}`);
        lines.push(`- Primary Entity: ${flow.primaryentity || "-"}`);
        lines.push(`- Owner: ${flow.ownerName || "-"}`);
        lines.push(`- Created By: ${flow.createdByName || "-"}`);
        lines.push(`- Modified By: ${flow.modifiedByName || "-"}`);
        lines.push(`- Managed: ${flow.ismanaged ? "Yes" : "No"}`);
        lines.push(`- Created: ${String(flow.createdon || "").slice(0, 10)}`);
        lines.push(`- Modified: ${String(flow.modifiedon || "").slice(0, 10)}`);
        lines.push(`- Solution Filter: ${solution || "-"}`);

        if (flow.description) {
          lines.push(`- Description: ${flow.description}`);
        }

        lines.push("");
        lines.push("### Parsed Definition Summary");
        lines.push(
          formatTable(
            ["Area", "Values"],
            [
              ["Schema", flow.summary.schemaVersion || "-"],
              ["Triggers", flow.summary.triggerNames.join(", ") || "-"],
              ["Actions", flow.summary.actionNames.join(", ") || "-"],
              ["Connections", flow.summary.connectionReferenceNames.join(", ") || "-"],
              ["Summary Hash", flow.summary.hash],
            ],
          ),
        );

        return createToolSuccessResponse("get_flow_details", lines.join("\n"), `Loaded cloud flow '${flow.name}' in '${env.name}'.`, {
          environment: env.name,
          solution: solution || null,
          flow,
        });
      } catch (error) {
        return createToolErrorResponse("get_flow_details", error);
      }
    },
  );
}
