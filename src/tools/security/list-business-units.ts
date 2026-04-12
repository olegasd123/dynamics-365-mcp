import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listBusinessUnits } from "./business-unit-metadata.js";

const listBusinessUnitsSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z.string().optional().describe("Optional business unit name filter"),
};

type ListBusinessUnitsParams = ToolParams<typeof listBusinessUnitsSchema>;

export async function handleListBusinessUnits(
  { environment, nameFilter }: ListBusinessUnitsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const businessUnits = await listBusinessUnits(env, client, nameFilter);

    if (businessUnits.length === 0) {
      const text = `No business units found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_business_units", text, text, {
        environment: env.name,
        nameFilter: nameFilter || null,
        count: 0,
        items: [],
      });
    }

    const text = `## Business Units in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\nFound ${businessUnits.length} business unit(s).\n\n${formatTable(
      ["Name", "Parent", "Disabled", "Modified"],
      businessUnits.map((businessUnit) => [
        businessUnit.name,
        businessUnit.parentBusinessUnitName || "-",
        businessUnit.isdisabled ? "Yes" : "No",
        String(businessUnit.modifiedon || "").slice(0, 10),
      ]),
    )}`;

    return createToolSuccessResponse(
      "list_business_units",
      text,
      `Found ${businessUnits.length} business unit(s) in '${env.name}'.`,
      {
        environment: env.name,
        nameFilter: nameFilter || null,
        count: businessUnits.length,
        items: businessUnits,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_business_units", error);
  }
}

export const listBusinessUnitsTool = defineTool({
  name: "list_business_units",
  description: "List business units with parent and state details.",
  schema: listBusinessUnitsSchema,
  handler: handleListBusinessUnits,
});

export function registerListBusinessUnits(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listBusinessUnitsTool, { config, client });
}
