import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { getGlobalOptionSetDetails } from "./option-set-metadata.js";

const getOptionSetDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  optionSet: z.string().describe("Global option set name, display name, or metadata id"),
};

type GetOptionSetDetailsParams = ToolParams<typeof getOptionSetDetailsSchema>;

export async function handleGetOptionSetDetails(
  { environment, optionSet }: GetOptionSetDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const details = await getGlobalOptionSetDetails(env, client, optionSet);
    const lines: string[] = [];

    lines.push(`## Global Option Set: ${details.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Display Name: ${details.displayName || "-"}`);
    lines.push(`- Metadata Id: ${details.metadataId}`);
    lines.push(`- Type: ${details.optionSetType || "-"}`);
    lines.push(`- Is Global: ${details.isGlobal ? "Yes" : "No"}`);
    lines.push(`- Managed: ${details.isManaged ? "Yes" : "No"}`);
    lines.push(`- Custom: ${details.isCustomOptionSet ? "Yes" : "No"}`);
    lines.push(`- Parent Option Set: ${details.parentOptionSetName || "-"}`);
    lines.push(`- Option Count: ${details.optionCount}`);
    lines.push(`- Description: ${details.description || "-"}`);
    lines.push("");
    lines.push("### Options");

    if (details.options.length === 0) {
      lines.push("No options found.");
    } else {
      lines.push(
        formatTable(
          ["Value", "Label", "Description", "Color", "External Value", "Managed"],
          details.options.map((option) => [
            option.value === undefined ? "-" : String(option.value),
            option.label || "-",
            option.description || "-",
            option.color || "-",
            option.externalValue || "-",
            option.isManaged ? "Yes" : "No",
          ]),
        ),
      );
    }

    return createToolSuccessResponse(
      "get_option_set_details",
      lines.join("\n"),
      `Loaded global option set '${details.name}' in '${env.name}'.`,
      {
        environment: env.name,
        optionSet: details,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_option_set_details", error);
  }
}

export const getOptionSetDetailsTool = defineTool({
  name: "get_option_set_details",
  description:
    "Show one Dataverse global option set (shared choice) with full option metadata and labels.",
  schema: getOptionSetDetailsSchema,
  handler: handleGetOptionSetDetails,
});

export function registerGetOptionSetDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getOptionSetDetailsTool, { config, client });
}
