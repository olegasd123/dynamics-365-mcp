import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { formatTable } from "../../utils/formatters.js";

const TYPE_LABELS: Record<number, string> = {
  1: "HTML",
  2: "CSS",
  3: "JS",
  4: "XML",
  5: "PNG",
  6: "JPG",
  7: "GIF",
  8: "XAP",
  9: "XSL",
  10: "ICO",
  11: "SVG",
  12: "RESX",
};

export function registerListWebResources(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_web_resources",
    "List web resources in Dynamics 365, optionally filtered by type or name.",
    {
      environment: z.string().optional().describe("Environment name"),
      type: z
        .enum(["html", "css", "js", "xml", "png", "jpg", "gif", "xap", "xsl", "ico", "svg", "resx"])
        .optional()
        .describe("Filter by web resource type"),
      nameFilter: z.string().optional().describe("Filter by name (contains match)"),
    },
    async ({ environment, type, nameFilter }) => {
      try {
        const env = getEnvironment(config, environment);
        const resources = await client.query<Record<string, unknown>>(
          env,
          "webresourceset",
          listWebResourcesQuery({
            type: type as WebResourceType | undefined,
            nameFilter,
          }),
        );

        if (resources.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No web resources found in '${env.name}' with the specified filters.`,
              },
            ],
          };
        }

        const headers = ["Name", "Display Name", "Type", "Managed", "Modified"];
        const rows = resources.map((r) => [
          String(r.name || ""),
          String(r.displayname || ""),
          TYPE_LABELS[r.webresourcetype as number] || String(r.webresourcetype),
          r.ismanaged ? "Yes" : "No",
          String(r.modifiedon || "").slice(0, 10),
        ]);

        const filterDesc = [
          type ? `type=${type}` : "",
          nameFilter ? `name contains '${nameFilter}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Web Resources in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${resources.length} resource(s).\n\n${formatTable(headers, rows)}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
