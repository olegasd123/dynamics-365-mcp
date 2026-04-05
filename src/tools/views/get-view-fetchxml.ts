import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { ViewScope } from "../../queries/view-queries.js";
import { normalizeXml } from "../../utils/xml-metadata.js";
import { fetchViewDetails } from "./view-metadata.js";

export function registerGetViewFetchXml(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_view_fetchxml",
    "Return normalized FetchXML for one system or personal view.",
    {
      environment: z.string().optional().describe("Environment name"),
      viewName: z.string().describe("View name"),
      table: z.string().optional().describe("Optional table logical name"),
      scope: z.enum(["system", "personal", "all"]).optional().describe("View scope"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name. Applied to system views only."),
    },
    async ({ environment, viewName, table, scope, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const view = await fetchViewDetails(env, client, viewName, {
          table,
          scope: scope as ViewScope | undefined,
          solution,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `## View FetchXML: ${view.name}\n\n\`\`\`xml\n${normalizeXml(view.fetchxml)}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    },
  );
}
