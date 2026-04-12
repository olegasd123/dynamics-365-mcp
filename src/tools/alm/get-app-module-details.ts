import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchAppModuleDetails } from "./alm-metadata.js";

const getAppModuleDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  appName: z.string().describe("App module name or unique name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type GetAppModuleDetailsParams = ToolParams<typeof getAppModuleDetailsSchema>;

export async function handleGetAppModuleDetails(
  { environment, appName, solution }: GetAppModuleDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const app = await fetchAppModuleDetails(env, client, appName, solution);
    const lines: string[] = [];

    lines.push(`## App Module: ${app.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Unique Name: ${app.uniquename}`);
    lines.push(`- State: ${app.stateLabel}`);
    lines.push(`- Managed: ${app.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${app.modifiedon.slice(0, 10)}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    return createToolSuccessResponse(
      "get_app_module_details",
      lines.join("\n"),
      `Loaded app module '${app.name}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        app,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_app_module_details", error);
  }
}

export const getAppModuleDetailsTool = defineTool({
  name: "get_app_module_details",
  description: "Show one app module with unique name and state details.",
  schema: getAppModuleDetailsSchema,
  handler: handleGetAppModuleDetails,
});

export function registerGetAppModuleDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getAppModuleDetailsTool, { config, client });
}
