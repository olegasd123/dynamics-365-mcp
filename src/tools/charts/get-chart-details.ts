import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { ChartScope } from "../../queries/chart-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchChartDetails } from "./chart-metadata.js";

const getChartDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  chartName: z.string().describe("Chart name or chart id"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("Chart scope"),
  solution: z
    .string()
    .optional()
    .describe("Optional solution display name or unique name. Applied to system charts only."),
  includeRawXml: z
    .boolean()
    .optional()
    .describe("Include normalized data and presentation XML in the text response."),
};

type GetChartDetailsParams = ToolParams<typeof getChartDetailsSchema>;

export async function handleGetChartDetails(
  { environment, chartName, table, scope, solution, includeRawXml }: GetChartDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const chart = await fetchChartDetails(env, client, chartName, {
      table,
      scope: scope as ChartScope | undefined,
      solution,
    });

    const lines: string[] = [];
    lines.push(`## Chart: ${chart.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${chart.primaryentitytypecode || "-"}`);
    lines.push(`- Scope: ${chart.scope}`);
    lines.push(`- Chart Type: ${chart.chartTypeLabel}`);
    lines.push(`- Default: ${chart.isdefault ? "Yes" : "No"}`);
    lines.push(`- Managed: ${chart.scope === "system" ? (chart.ismanaged ? "Yes" : "No") : "N/A"}`);
    lines.push(`- Modified: ${String(chart.modifiedon || "").slice(0, 10) || "-"}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    if (chart.description) {
      lines.push(`- Description: ${chart.description}`);
    }

    lines.push("");
    lines.push("### XML Summary");
    lines.push(
      formatTable(
        ["Area", "Values"],
        [
          ["Entity", chart.summary.entityName || "-"],
          ["Attributes", chart.summary.attributes.join(", ") || "-"],
          ["Group By", chart.summary.groupByAttributes.join(", ") || "-"],
          ["Aggregates", chart.summary.aggregateAttributes.join(", ") || "-"],
          ["Measures", chart.summary.measureAliases.join(", ") || "-"],
          ["Categories", chart.summary.categoryAliases.join(", ") || "-"],
          ["Presentation Types", chart.summary.chartTypes.join(", ") || "-"],
          ["Data Hash", chart.summary.dataHash],
          ["Presentation Hash", chart.summary.presentationHash],
        ],
      ),
    );

    if (includeRawXml) {
      lines.push("");
      lines.push("### Data XML");
      lines.push("");
      lines.push("```xml");
      lines.push(chart.summary.normalizedDataXml);
      lines.push("```");
      lines.push("");
      lines.push("### Presentation XML");
      lines.push("");
      lines.push("```xml");
      lines.push(chart.summary.normalizedPresentationXml);
      lines.push("```");
    }

    return createToolSuccessResponse(
      "get_chart_details",
      lines.join("\n"),
      `Loaded chart '${chart.name}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          table: table || null,
          scope: scope || null,
          solution: solution || null,
          includeRawXml: Boolean(includeRawXml),
        },
        chart,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_chart_details", error);
  }
}

export const getChartDetailsTool = defineTool({
  name: "get_chart_details",
  description: "Show one chart with data XML and presentation XML summary.",
  schema: getChartDetailsSchema,
  handler: handleGetChartDetails,
});

export function registerGetChartDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getChartDetailsTool, { config, client });
}
