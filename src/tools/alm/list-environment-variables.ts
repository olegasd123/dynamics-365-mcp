import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listEnvironmentVariables } from "./alm-metadata.js";

export function registerListEnvironmentVariables(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_environment_variables",
    "List environment variables with definition and current value metadata.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional filter for schema name or display name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const variables = await listEnvironmentVariables(env, client, { nameFilter, solution });

        if (variables.length === 0) {
          const text = `No environment variables found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_environment_variables", text, text, {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: 0,
            items: [],
          });
        }

        const filterDesc = [
          nameFilter ? `filter='${nameFilter}'` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Environment Variables in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${variables.length} variable(s).\n\n${formatTable(
          ["Schema Name", "Display Name", "Type", "Current Value", "Default Value", "Managed"],
          variables.map((variable) => [
            variable.schemaname,
            variable.displayname || "-",
            variable.typeLabel,
            variable.hasCurrentValue ? variable.currentValue || "(empty)" : "-",
            variable.defaultvalue || "-",
            variable.ismanaged ? "Yes" : "No",
          ]),
        )}`;

        return createToolSuccessResponse(
          "list_environment_variables",
          text,
          `Found ${variables.length} environment variable(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: variables.length,
            items: variables,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_environment_variables", error);
      }
    },
  );
}
