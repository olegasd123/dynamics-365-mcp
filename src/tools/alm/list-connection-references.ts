import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listConnectionReferences } from "./alm-metadata.js";

export function registerListConnectionReferences(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_connection_references",
    "List connection references with connector and connection status details.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z
        .string()
        .optional()
        .describe("Optional filter for display name or logical name"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const references = await listConnectionReferences(env, client, { nameFilter, solution });

        if (references.length === 0) {
          const text = `No connection references found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_connection_references", text, text, {
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

        const text = `## Connection References in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${references.length} reference(s).\n\n${formatTable(
          ["Display Name", "Logical Name", "Connector", "Status", "Managed"],
          references.map((reference) => [
            reference.displayname || reference.connectionreferencelogicalname,
            reference.connectionreferencelogicalname,
            reference.connectorName || reference.connectorid || "-",
            reference.connectionStatus,
            reference.ismanaged ? "Yes" : "No",
          ]),
        )}`;

        return createToolSuccessResponse(
          "list_connection_references",
          text,
          `Found ${references.length} connection reference(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              nameFilter: nameFilter || null,
              solution: solution || null,
            },
            count: references.length,
            items: references,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_connection_references", error);
      }
    },
  );
}
