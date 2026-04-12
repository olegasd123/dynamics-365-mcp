import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { getWebResourceContentByNameQuery } from "../../queries/web-resource-queries.js";

const TEXT_TYPES = new Set([1, 2, 3, 4, 9, 12]); // HTML, CSS, JS, XML, XSL, RESX

const getWebResourceContentSchema = {
  environment: z.string().optional().describe("Environment name"),
  name: z.string().describe("Web resource name (e.g. 'new_/scripts/main.js')"),
};

type GetWebResourceContentParams = ToolParams<typeof getWebResourceContentSchema>;

export async function handleGetWebResourceContent(
  { environment, name: resourceName }: GetWebResourceContentParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);

    const resources = await client.query<Record<string, unknown>>(
      env,
      "webresourceset",
      getWebResourceContentByNameQuery(resourceName),
    );

    if (resources.length === 0) {
      const text = `Web resource '${resourceName}' not found in '${env.name}'.`;
      return createToolSuccessResponse("get_web_resource_content", text, text, {
        environment: env.name,
        found: false,
        name: resourceName,
      });
    }

    const resource = resources[0];
    const base64Content = resource.content as string;
    const resourceType = resource.webresourcetype as number;

    if (!base64Content) {
      const text = `Web resource '${resourceName}' has no content.`;
      return createToolSuccessResponse("get_web_resource_content", text, text, {
        environment: env.name,
        found: true,
        name: resourceName,
        resourceType,
        hasContent: false,
      });
    }

    if (TEXT_TYPES.has(resourceType)) {
      const decoded = Buffer.from(base64Content, "base64").toString("utf-8");
      const text = `## ${resource.name}\n\n\`\`\`\n${decoded}\n\`\`\``;
      return createToolSuccessResponse(
        "get_web_resource_content",
        text,
        `Loaded text content for web resource '${String(resource.name || resourceName)}' in '${env.name}'.`,
        {
          environment: env.name,
          found: true,
          name: String(resource.name || resourceName),
          resourceType,
          isText: true,
          content: decoded,
        },
      );
    }

    // Binary content — return metadata and base64 size
    const sizeKb = Math.round((base64Content.length * 3) / 4 / 1024);
    const text = `## ${resource.name}\n\nBinary web resource (type: ${resourceType}), size: ~${sizeKb} KB.\nBase64 content available but not decoded (binary format).`;
    return createToolSuccessResponse(
      "get_web_resource_content",
      text,
      `Loaded binary metadata for web resource '${String(resource.name || resourceName)}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        name: String(resource.name || resourceName),
        resourceType,
        isText: false,
        sizeKb,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_web_resource_content", error);
  }
}

export const getWebResourceContentTool = defineTool({
  name: "get_web_resource_content",
  description: "Fetch the content of a specific web resource from Dynamics 365.",
  schema: getWebResourceContentSchema,
  handler: handleGetWebResourceContent,
});

export function registerGetWebResourceContent(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getWebResourceContentTool, { config, client });
}
