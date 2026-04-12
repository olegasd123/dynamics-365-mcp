import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchConnectionReferenceDetails } from "./alm-metadata.js";

const getConnectionReferenceDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  referenceName: z.string().describe("Connection reference display name or logical name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type GetConnectionReferenceDetailsParams = ToolParams<typeof getConnectionReferenceDetailsSchema>;

export async function handleGetConnectionReferenceDetails(
  { environment, referenceName, solution }: GetConnectionReferenceDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const reference = await fetchConnectionReferenceDetails(env, client, referenceName, solution);
    const lines: string[] = [];

    lines.push(
      `## Connection Reference: ${reference.displayname || reference.connectionreferencelogicalname}`,
    );
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Logical Name: ${reference.connectionreferencelogicalname}`);
    lines.push(`- Connector: ${reference.connectorName || "-"}`);
    lines.push(`- Connector Id: ${reference.connectorid || "-"}`);
    lines.push(`- Connection Id: ${reference.connectionid || "-"}`);
    lines.push(`- State: ${reference.stateLabel}`);
    lines.push(`- Connection Status: ${reference.connectionStatus}`);
    lines.push(`- Managed: ${reference.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${reference.modifiedon.slice(0, 10)}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    return createToolSuccessResponse(
      "get_connection_reference_details",
      lines.join("\n"),
      `Loaded connection reference '${reference.displayname || reference.connectionreferencelogicalname}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        reference,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_connection_reference_details", error);
  }
}

export const getConnectionReferenceDetailsTool = defineTool({
  name: "get_connection_reference_details",
  description: "Show one connection reference with connector and connection status details.",
  schema: getConnectionReferenceDetailsSchema,
  handler: handleGetConnectionReferenceDetails,
});

export function registerGetConnectionReferenceDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getConnectionReferenceDetailsTool, { config, client });
}
