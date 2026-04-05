import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { buildTableFlags } from "./table-display.js";
import { listTables } from "./table-metadata.js";

export function registerListTables(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_tables",
    "List Dataverse tables with schema flags. Optionally filter by name or solution.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z
        .string()
        .optional()
        .describe("Optional filter for logical name, schema name, or entity set name"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name"),
    },
    async ({ environment, nameFilter, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const tables = await listTables(env, client, { nameFilter, solution });

        if (tables.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No tables found in '${env.name}' with the specified filters.`,
              },
            ],
          };
        }

        const rows = tables.map((table) => [
          table.logicalName,
          table.schemaName,
          table.displayName,
          table.entitySetName,
          table.primaryNameAttribute || "-",
          table.primaryIdAttribute,
          table.ownershipType || "-",
          buildTableFlags(table),
        ]);

        const filterDesc = [
          nameFilter ? `filter='${nameFilter}'` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Tables in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${tables.length} table(s).\n\n${formatTable(
          [
            "Logical Name",
            "Schema Name",
            "Display Name",
            "Entity Set",
            "Primary Name",
            "Primary ID",
            "Ownership",
            "Flags",
          ],
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
