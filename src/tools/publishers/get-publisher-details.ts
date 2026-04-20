import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchPublisherDetails } from "./publisher-metadata.js";

const getPublisherDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  publisher: z
    .string()
    .describe("Publisher display name, unique name, customization prefix, or publisher id"),
};

type GetPublisherDetailsParams = ToolParams<typeof getPublisherDetailsSchema>;

export async function handleGetPublisherDetails(
  { environment, publisher }: GetPublisherDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const details = await fetchPublisherDetails(env, client, publisher);
    const lines: string[] = [];

    lines.push(`## Publisher: ${details.publisher.friendlyname}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Unique Name: ${details.publisher.uniquename || "-"}`);
    lines.push(`- Publisher Id: ${details.publisher.publisherid}`);
    lines.push(`- Customization Prefix: ${details.publisher.customizationprefix || "-"}`);
    lines.push(
      `- Option Value Prefix: ${details.publisher.customizationoptionvalueprefix === null ? "-" : String(details.publisher.customizationoptionvalueprefix)}`,
    );
    lines.push(`- Read Only: ${details.publisher.isreadonly ? "Yes" : "No"}`);
    lines.push(`- Modified: ${details.publisher.modifiedon.slice(0, 10) || "-"}`);
    lines.push(`- Row Version: ${details.publisher.versionnumber || "-"}`);
    lines.push(`- Email: ${details.publisher.emailaddress || "-"}`);
    lines.push(`- Website: ${details.publisher.supportingwebsiteurl || "-"}`);
    lines.push(`- Description: ${details.publisher.description || "-"}`);
    lines.push(`- Related Solutions: ${details.solutions.length}`);
    lines.push("");
    lines.push("### Solutions");

    if (details.solutions.length === 0) {
      lines.push("No solutions found for this publisher.");
    } else {
      lines.push(
        formatTable(
          ["Display Name", "Unique Name", "Version", "Managed", "Modified"],
          details.solutions.map((solution) => [
            solution.friendlyname,
            solution.uniquename,
            solution.version || "-",
            solution.ismanaged ? "Yes" : "No",
            solution.modifiedon.slice(0, 10) || "-",
          ]),
        ),
      );
    }

    return createToolSuccessResponse(
      "get_publisher_details",
      lines.join("\n"),
      `Loaded publisher '${details.publisher.friendlyname}' in '${env.name}'.`,
      {
        environment: env.name,
        publisher: details.publisher,
        relatedSolutionsCount: details.solutions.length,
        relatedSolutions: details.solutions,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_publisher_details", error);
  }
}

export const getPublisherDetailsTool = defineTool({
  name: "get_publisher_details",
  description:
    "Show one Dataverse solution publisher with prefix metadata and the solutions that use it.",
  schema: getPublisherDetailsSchema,
  handler: handleGetPublisherDetails,
});

export function registerGetPublisherDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getPublisherDetailsTool, { config, client });
}
