import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { normalizeXml } from "../../utils/xml-metadata.js";
import { fetchViewDetails } from "./view-metadata.js";

const getViewFetchXmlSchema = {
  environment: z.string().optional().describe("Environment name"),
  viewName: z.string().describe("View name"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
  solution: z
    .string()
    .optional()
    .describe("Optional solution display name or unique name. Applied to system views only."),
};

type GetViewFetchXmlParams = ToolParams<typeof getViewFetchXmlSchema>;

export async function handleGetViewFetchXml(
  { environment, viewName, table, scope, solution }: GetViewFetchXmlParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const view = await fetchViewDetails(env, client, viewName, {
      table,
      scope: scope as ViewScope | undefined,
      solution,
    });

    const normalizedFetchXml = normalizeXml(view.fetchxml);
    const text = `## View FetchXML: ${view.name}\n\n\`\`\`xml\n${normalizedFetchXml}\n\`\`\``;
    return createToolSuccessResponse(
      "get_view_fetchxml",
      text,
      `Loaded FetchXML for view '${view.name}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: { table: table || null, scope: scope || null, solution: solution || null },
        view: {
          name: view.name,
          scope: view.scope,
          table: view.returnedtypecode,
          fetchXml: normalizedFetchXml,
        },
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_view_fetchxml", error);
  }
}

export const getViewFetchXmlTool = defineTool({
  name: "get_view_fetchxml",
  description: "Return normalized FetchXML for one system or personal view.",
  schema: getViewFetchXmlSchema,
  handler: handleGetViewFetchXml,
});

export function registerGetViewFetchXml(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getViewFetchXmlTool, { config, client });
}
