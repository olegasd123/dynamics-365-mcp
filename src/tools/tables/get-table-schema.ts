import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import {
  buildColumnDetails,
  buildRelationshipDetails,
  buildRelationshipRelatedTable,
  buildTableFlags,
  formatYesNo,
} from "./table-display.js";
import { fetchTableSchema } from "./table-metadata.js";

export function registerGetTableSchema(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_table_schema",
    "Show table schema details, including columns, alternate keys, and relationships.",
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
        const schema = await fetchTableSchema(env, client, table, solution);
        const lines: string[] = [];

        lines.push(`## Table: ${schema.table.logicalName}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Display Name: ${schema.table.displayName || "-"}`);
        lines.push(`- Schema Name: ${schema.table.schemaName}`);
        lines.push(`- Entity Set: ${schema.table.entitySetName}`);
        lines.push(`- Collection Name: ${schema.table.collectionName || "-"}`);
        lines.push(`- Primary ID: ${schema.table.primaryIdAttribute}`);
        lines.push(`- Primary Name: ${schema.table.primaryNameAttribute || "-"}`);
        lines.push(`- Ownership: ${schema.table.ownershipType || "-"}`);
        lines.push(`- Flags: ${buildTableFlags(schema.table)}`);
        lines.push(`- Description: ${schema.table.description || "-"}`);
        lines.push(`- Solution Filter: ${solution || "-"}`);
        lines.push("");
        lines.push("### Columns");
        lines.push(
          formatTable(
            [
              "Logical Name",
              "Type",
              "Required",
              "Primary",
              "Audit",
              "Search",
              "Details",
            ],
            schema.columns.map((column) => [
              column.logicalName,
              column.attributeType || "-",
              column.requiredLevel || "-",
              column.isPrimaryId ? "Primary ID" : column.isPrimaryName ? "Primary Name" : "-",
              formatYesNo(column.isAuditEnabled),
              formatYesNo(column.isValidForAdvancedFind),
              buildColumnDetails(column) || "-",
            ]),
          ),
        );

        lines.push("");
        lines.push("### Alternate Keys");
        if (schema.keys.length === 0) {
          lines.push("No alternate keys found.");
        } else {
          lines.push(
            formatTable(
              ["Logical Name", "Schema Name", "Columns", "Status", "Managed"],
              schema.keys.map((key) => [
                key.logicalName,
                key.schemaName,
                key.keyAttributes.join(", "),
                key.indexStatus || "-",
                formatYesNo(key.isManaged),
              ]),
            ),
          );
        }

        lines.push("");
        lines.push("### Relationships");
        if (schema.relationships.length === 0) {
          lines.push("No relationships found.");
        } else {
          lines.push(
            formatTable(
              ["Schema Name", "Kind", "Related Table", "Details", "Managed"],
              schema.relationships.map((relationship) => [
                relationship.schemaName,
                relationship.kind,
                buildRelationshipRelatedTable(relationship),
                buildRelationshipDetails(relationship),
                formatYesNo(relationship.isManaged),
              ]),
            ),
          );
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
