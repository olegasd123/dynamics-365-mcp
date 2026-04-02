import { z } from "zod";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listWebResourcesQuery } from "../../queries/web-resource-queries.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import { diffCollections } from "../../utils/diff.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { buildQueryString } from "../../utils/odata-helpers.js";

export function registerCompareWebResources(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "compare_web_resources",
    "Compare web resources between two Dynamics 365 environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      type: z.enum(["html", "css", "js", "xml", "png", "jpg", "gif", "xap", "xsl", "ico", "svg", "resx"]).optional().describe("Filter by type"),
      nameFilter: z.string().optional().describe("Filter by name (contains match)"),
      compareContent: z.boolean().optional().describe("Compare content hashes (slower, requires fetching content). Default: false"),
    },
    async ({ sourceEnvironment, targetEnvironment, type, nameFilter, compareContent }) => {
      try {
        const sourceEnv = getEnvironment(config, sourceEnvironment);
        const targetEnv = getEnvironment(config, targetEnvironment);

        const queryParams = compareContent
          ? buildQueryString({
              select: ["webresourceid", "name", "displayname", "webresourcetype", "ismanaged", "modifiedon", "content"],
              filter: [
                type ? `webresourcetype eq ${({ html: 1, css: 2, js: 3, xml: 4, png: 5, jpg: 6, gif: 7, xap: 8, xsl: 9, ico: 10, svg: 11, resx: 12 } as Record<string, number>)[type]}` : "",
                nameFilter ? `contains(name,'${nameFilter}')` : "",
              ].filter(Boolean).join(" and ") || undefined,
              orderby: "name asc",
            })
          : listWebResourcesQuery({ type: type as WebResourceType | undefined, nameFilter });

        const [sourceResources, targetResources] = await Promise.all([
          client.query<Record<string, unknown>>(sourceEnv, "webresourceset", queryParams),
          client.query<Record<string, unknown>>(targetEnv, "webresourceset", queryParams),
        ]);

        // If comparing content, add content hash field
        if (compareContent) {
          for (const r of [...sourceResources, ...targetResources]) {
            if (r.content) {
              r.contentHash = createHash("sha256").update(String(r.content)).digest("hex").slice(0, 12);
            } else {
              r.contentHash = "(empty)";
            }
          }
        }

        const compareFields = compareContent
          ? ["webresourcetype", "ismanaged", "contentHash"]
          : ["webresourcetype", "ismanaged"];

        const result = diffCollections(
          sourceResources,
          targetResources,
          (r) => String(r.name),
          compareFields
        );

        const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
