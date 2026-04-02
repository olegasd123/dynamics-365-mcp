import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { getWebResourceContentByNameQuery } from "../../queries/web-resource-queries.js";

const TEXT_TYPES = new Set([1, 2, 3, 4, 9, 12]); // HTML, CSS, JS, XML, XSL, RESX

export function registerGetWebResourceContent(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_web_resource_content",
    "Fetch the content of a specific web resource from Dynamics 365.",
    {
      environment: z.string().optional().describe("Environment name"),
      name: z.string().describe("Web resource name (e.g. 'new_/scripts/main.js')"),
    },
    async ({ environment, name: resourceName }) => {
      try {
        const env = getEnvironment(config, environment);

        const resources = await client.query<Record<string, unknown>>(
          env,
          "webresourceset",
          getWebResourceContentByNameQuery(resourceName),
        );

        if (resources.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Web resource '${resourceName}' not found in '${env.name}'.`,
              },
            ],
          };
        }

        const resource = resources[0];
        const base64Content = resource.content as string;
        const resourceType = resource.webresourcetype as number;

        if (!base64Content) {
          return {
            content: [
              { type: "text" as const, text: `Web resource '${resourceName}' has no content.` },
            ],
          };
        }

        if (TEXT_TYPES.has(resourceType)) {
          const decoded = Buffer.from(base64Content, "base64").toString("utf-8");
          return {
            content: [
              { type: "text" as const, text: `## ${resource.name}\n\n\`\`\`\n${decoded}\n\`\`\`` },
            ],
          };
        }

        // Binary content — return metadata and base64 size
        const sizeKb = Math.round((base64Content.length * 3) / 4 / 1024);
        return {
          content: [
            {
              type: "text" as const,
              text: `## ${resource.name}\n\nBinary web resource (type: ${resourceType}), size: ~${sizeKb} KB.\nBase64 content available but not decoded (binary format).`,
            },
          ],
        };
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
