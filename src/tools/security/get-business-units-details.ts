import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchBusinessUnitDetails } from "./business-unit-metadata.js";

export function registerGetBusinessUnitsDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_business_units_details",
    "Show one business unit with parent and child context.",
    {
      environment: z.string().optional().describe("Environment name"),
      businessUnitName: z.string().describe("Business unit name or business unit id"),
    },
    async ({ environment, businessUnitName }) => {
      try {
        const env = getEnvironment(config, environment);
        const details = await fetchBusinessUnitDetails(env, client, businessUnitName);
        const lines: string[] = [];

        lines.push(`## Business Unit: ${details.businessUnit.name}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Parent: ${details.parent?.name || "-"}`);
        lines.push(`- Organization: ${details.businessUnit.organizationName || "-"}`);
        lines.push(`- Root Unit: ${details.businessUnit.isRoot ? "Yes" : "No"}`);
        lines.push(`- Disabled: ${details.businessUnit.isdisabled ? "Yes" : "No"}`);
        lines.push(`- Created: ${details.businessUnit.createdon.slice(0, 10) || "-"}`);
        lines.push(`- Modified: ${details.businessUnit.modifiedon.slice(0, 10) || "-"}`);
        lines.push(`- Path: ${details.path.join(" > ") || "-"}`);
        lines.push(`- Direct Children: ${details.children.length}`);
        lines.push("");
        lines.push("### Direct Children");

        if (details.children.length === 0) {
          lines.push("No direct child business units.");
        } else {
          lines.push(
            formatTable(
              ["Name", "Disabled", "Modified"],
              details.children.map((child) => [
                child.name,
                child.isdisabled ? "Yes" : "No",
                child.modifiedon.slice(0, 10),
              ]),
            ),
          );
        }

        return createToolSuccessResponse(
          "get_business_units_details",
          lines.join("\n"),
          `Loaded business unit '${details.businessUnit.name}' in '${env.name}'.`,
          {
            environment: env.name,
            businessUnit: details.businessUnit,
            parent: details.parent,
            path: details.path,
            directChildrenCount: details.children.length,
            directChildren: details.children,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_business_units_details", error);
      }
    },
  );
}
