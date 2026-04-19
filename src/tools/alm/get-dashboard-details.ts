import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchDashboardDetails } from "./alm-metadata.js";

const getDashboardDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  dashboardName: z.string().describe("Dashboard name or form id"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type GetDashboardDetailsParams = ToolParams<typeof getDashboardDetailsSchema>;

export async function handleGetDashboardDetails(
  { environment, dashboardName, solution }: GetDashboardDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const dashboard = await fetchDashboardDetails(env, client, dashboardName, solution);
    const lines: string[] = [];

    lines.push(`## Dashboard: ${dashboard.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${dashboard.objecttypecode || "-"}`);
    lines.push(`- Type: ${dashboard.typeLabel}`);
    lines.push(`- Managed: ${dashboard.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Published: ${dashboard.publishedon ? dashboard.publishedon.slice(0, 10) : "-"}`);
    lines.push(`- Modified: ${dashboard.modifiedon.slice(0, 10)}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    if (dashboard.description) {
      lines.push(`- Description: ${dashboard.description}`);
    }

    return createToolSuccessResponse(
      "get_dashboard_details",
      lines.join("\n"),
      `Loaded dashboard '${dashboard.name}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        dashboard,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_dashboard_details", error);
  }
}

export const getDashboardDetailsTool = defineTool({
  name: "get_dashboard_details",
  description: "Show one dashboard with table and managed status details.",
  schema: getDashboardDetailsSchema,
  handler: handleGetDashboardDetails,
});

export function registerGetDashboardDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getDashboardDetailsTool, { config, client });
}
