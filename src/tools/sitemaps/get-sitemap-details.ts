import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchSitemapDetails } from "./sitemap-metadata.js";
import type { SitemapArea } from "./sitemap-parser.js";

const getSitemapDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  sitemapName: z.string().optional().describe("Sitemap name, unique name, or id"),
  appName: z.string().optional().describe("Optional app module name or unique name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  includeRawXml: z.boolean().optional().describe("Set true to include raw sitemap XML in output"),
};

type GetSitemapDetailsParams = ToolParams<typeof getSitemapDetailsSchema>;

export async function handleGetSitemapDetails(
  { environment, sitemapName, appName, solution, includeRawXml }: GetSitemapDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const sitemap = await fetchSitemapDetails(env, client, { sitemapName, appName, solution });
    const lines: string[] = [];

    lines.push(`## Sitemap: ${sitemap.sitemapname}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Unique Name: ${sitemap.sitemapnameunique || "-"}`);
    lines.push(`- App Module: ${sitemap.appModule?.name || appName || "-"}`);
    lines.push(`- App Aware: ${sitemap.isappaware ? "Yes" : "No"}`);
    lines.push(`- Managed: ${sitemap.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${sitemap.modifiedon ? sitemap.modifiedon.slice(0, 10) : "-"}`);
    lines.push(`- XML Hash: ${sitemap.summary.hash}`);
    lines.push(
      `- Navigation: ${sitemap.summary.areaCount} area(s), ${sitemap.summary.groupCount} group(s), ${sitemap.summary.subAreaCount} subarea(s)`,
    );

    if (sitemap.summary.tableNames.length > 0) {
      lines.push(`- Tables: ${sitemap.summary.tableNames.join(", ")}`);
    }

    lines.push("");
    lines.push(formatNavigation(sitemap.summary.areas));

    if (includeRawXml) {
      lines.push("");
      lines.push("### Raw XML");
      lines.push("```xml");
      lines.push(sitemap.sitemapxml || sitemap.sitemapxmlmanaged);
      lines.push("```");
    }

    return createToolSuccessResponse(
      "get_sitemap_details",
      lines.join("\n"),
      `Loaded sitemap '${sitemap.sitemapname}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          sitemapName: sitemapName || null,
          appName: appName || null,
          solution: solution || null,
          includeRawXml: Boolean(includeRawXml),
        },
        sitemap,
        rawXml: includeRawXml ? sitemap.sitemapxml || sitemap.sitemapxmlmanaged : undefined,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_sitemap_details", error);
  }
}

export const getSitemapDetailsTool = defineTool({
  name: "get_sitemap_details",
  description: "Show one sitemap with parsed area, group, and subarea navigation details.",
  schema: getSitemapDetailsSchema,
  handler: handleGetSitemapDetails,
});

export function registerGetSitemapDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getSitemapDetailsTool, { config, client });
}

function formatNavigation(areas: SitemapArea[]): string {
  if (areas.length === 0) {
    return "No sitemap navigation nodes found.";
  }

  const rows = areas.flatMap((area) =>
    area.groups.flatMap((group) =>
      group.subAreas.map((subArea) => [
        area.title || area.id,
        group.title || group.id,
        subArea.title || subArea.id,
        subArea.entity || "-",
        subArea.url || "-",
      ]),
    ),
  );

  if (rows.length === 0) {
    return formatTable(
      ["Area", "Groups"],
      areas.map((area) => [area.title || area.id, String(area.groups.length)]),
    );
  }

  return formatTable(["Area", "Group", "Subarea", "Table", "URL"], rows);
}
