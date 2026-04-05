import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import {
  buildRelationshipDetails,
  buildRelationshipRelatedTable,
  formatYesNo,
} from "./table-display.js";
import { fetchTableRelationships } from "./table-metadata.js";

export function registerListTableRelationships(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_table_relationships",
    "List Dataverse table relationships for one table.",
    {
      environment: z.string().optional().describe("Environment name"),
      table: z
        .string()
        .describe("Table logical name, schema name, or display name"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name"),
    },
    async ({ environment, table, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const result = await fetchTableRelationships(env, client, table, solution);

        if (result.relationships.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No relationships found for table '${result.table.logicalName}' in '${env.name}'.`,
              },
            ],
          };
        }

        const rows = result.relationships.map((relationship) => [
          relationship.schemaName,
          relationship.kind,
          buildRelationshipRelatedTable(relationship),
          buildRelationshipDetails(relationship),
          formatYesNo(relationship.isCustomRelationship),
          formatYesNo(relationship.isManaged),
        ]);

        const text = `## Relationships: ${result.table.logicalName}\n\nEnvironment: ${env.name}\nSolution Filter: ${solution || "-"}\nFound ${result.relationships.length} relationship(s).\n\n${formatTable(
          ["Schema Name", "Kind", "Related Table", "Details", "Custom", "Managed"],
          rows,
        )}`;

        return { content: [{ type: "text" as const, text }] };
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
