import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchViewDetails } from "./view-metadata.js";

const STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

const getViewDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  viewName: z.string().describe("View name or view id"),
  table: z.string().optional().describe("Optional table logical name"),
  scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
  solution: z
    .string()
    .optional()
    .describe("Optional solution display name or unique name. Applied to system views only."),
};

type GetViewDetailsParams = ToolParams<typeof getViewDetailsSchema>;

export async function handleGetViewDetails(
  { environment, viewName, table, scope, solution }: GetViewDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const view = await fetchViewDetails(env, client, viewName, {
      table,
      scope: scope as ViewScope | undefined,
      solution,
    });

    const lines: string[] = [];
    lines.push(`## View: ${view.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${view.returnedtypecode}`);
    lines.push(`- Scope: ${view.scope}`);
    lines.push(`- Type: ${view.queryTypeLabel}`);
    lines.push(`- Default: ${view.isdefault ? "Yes" : "No"}`);
    lines.push(`- Quick Find: ${view.isquickfindquery ? "Yes" : "No"}`);
    lines.push(`- State: ${STATE_LABELS[view.statecode] || view.statecode}`);
    lines.push(`- Managed: ${view.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${String(view.modifiedon || "").slice(0, 10)}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    if (view.description) {
      lines.push(`- Description: ${view.description}`);
    }

    lines.push("");
    lines.push("### Query Summary");
    lines.push(
      formatTable(
        ["Area", "Values"],
        [
          ["Entity", view.summary.entityName || "-"],
          ["Columns", view.summary.attributes.join(", ") || "-"],
          ["Sort", view.summary.orders.join(", ") || "-"],
          ["Links", view.summary.linkEntities.join(", ") || "-"],
          ["Filters", String(view.summary.filterCount)],
          ["Layout Columns", view.summary.layoutColumns.join(", ") || "-"],
          ["Fetch Hash", view.summary.fetchHash],
          ["Layout Hash", view.summary.layoutHash],
        ],
      ),
    );

    return createToolSuccessResponse(
      "get_view_details",
      lines.join("\n"),
      `Loaded view '${view.name}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: { table: table || null, scope: scope || null, solution: solution || null },
        view,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_view_details", error);
  }
}

export const getViewDetailsTool = defineTool({
  name: "get_view_details",
  description: "Show one view with normalized FetchXML and layout summary.",
  schema: getViewDetailsSchema,
  handler: handleGetViewDetails,
});

export function registerGetViewDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getViewDetailsTool, { config, client });
}
