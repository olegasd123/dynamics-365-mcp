import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { findWebResourceUsageData } from "./usage-analysis.js";

const findWebResourceUsageSchema = {
  environment: z.string().optional().describe("Environment name"),
  name: z.string().describe("Web resource name or web resource id"),
};

type FindWebResourceUsageParams = ToolParams<typeof findWebResourceUsageSchema>;

export async function handleFindWebResourceUsage(
  { environment, name }: FindWebResourceUsageParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const usage = await findWebResourceUsageData(env, client, name);
    const lines: string[] = [];

    lines.push(`## Web Resource Usage: ${usage.resourceName}`);
    lines.push(`- Environment: ${env.name}`);
    if (usage.warnings && usage.warnings.length > 0) {
      lines.push(`- Warnings: ${usage.warnings.join(" | ")}`);
    }
    lines.push(
      `- Summary: Forms ${usage.forms.length} | Other Web Resources ${usage.webResources.length}`,
    );

    if (usage.forms.length > 0) {
      lines.push("");
      lines.push("### Forms");
      lines.push(
        formatTable(
          ["Table", "Form", "Type", "Usage"],
          usage.forms.map((form) => [form.table, form.name, form.typeLabel, form.usage]),
        ),
      );
    }

    if (usage.webResources.length > 0) {
      lines.push("");
      lines.push("### Other Web Resources");
      lines.push(
        formatTable(
          ["Name", "Type"],
          usage.webResources.map((resource) => [resource.name, String(resource.type)]),
        ),
      );
    }

    return createToolSuccessResponse(
      "find_web_resource_usage",
      lines.join("\n"),
      `Analyzed usage for web resource '${usage.resourceName}' in '${env.name}'.`,
      {
        environment: env.name,
        warnings: usage.warnings || [],
        usage,
      },
    );
  } catch (error) {
    return createToolErrorResponse("find_web_resource_usage", error);
  }
}

export const findWebResourceUsageTool = defineTool({
  name: "find_web_resource_usage",
  description: "Find where one web resource is used in forms and other text web resources.",
  schema: findWebResourceUsageSchema,
  handler: handleFindWebResourceUsage,
});

export function registerFindWebResourceUsage(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, findWebResourceUsageTool, { config, client });
}
