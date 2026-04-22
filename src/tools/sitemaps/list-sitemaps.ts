import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { listSitemaps } from "./sitemap-metadata.js";

const listSitemapsSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z.string().optional().describe("Optional filter for sitemap name or unique name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  appName: z.string().optional().describe("Optional app module name or unique name"),
};

type ListSitemapsParams = ToolParams<typeof listSitemapsSchema>;

export async function handleListSitemaps(
  { environment, nameFilter, solution, appName }: ListSitemapsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const sitemaps = await listSitemaps(env, client, { nameFilter, solution, appName });

    if (sitemaps.length === 0) {
      const text = `No sitemaps found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_sitemaps", text, text, {
        environment: env.name,
        filters: {
          nameFilter: nameFilter || null,
          solution: solution || null,
          appName: appName || null,
        },
        count: 0,
        items: [],
      });
    }

    const filterDesc = [
      nameFilter ? `filter='${nameFilter}'` : "",
      solution ? `solution='${solution}'` : "",
      appName ? `app='${appName}'` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Sitemaps in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${sitemaps.length} sitemap(s).\n\n${formatTable(
      ["Name", "Unique Name", "App Aware", "Areas", "Groups", "Subareas", "Managed", "Modified"],
      sitemaps.map((sitemap) => [
        sitemap.sitemapname,
        sitemap.sitemapnameunique,
        sitemap.isappaware ? "Yes" : "No",
        String(sitemap.summary.areaCount),
        String(sitemap.summary.groupCount),
        String(sitemap.summary.subAreaCount),
        sitemap.ismanaged ? "Yes" : "No",
        sitemap.modifiedon ? sitemap.modifiedon.slice(0, 10) : "",
      ]),
    )}`;

    return createToolSuccessResponse(
      "list_sitemaps",
      text,
      `Found ${sitemaps.length} sitemap(s) in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          nameFilter: nameFilter || null,
          solution: solution || null,
          appName: appName || null,
        },
        count: sitemaps.length,
        items: sitemaps,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_sitemaps", error);
  }
}

export const listSitemapsTool = defineTool({
  name: "list_sitemaps",
  description: "List app sitemaps with navigation counts and managed status.",
  schema: listSitemapsSchema,
  handler: handleListSitemaps,
});

export function registerListSitemaps(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listSitemapsTool, { config, client });
}
