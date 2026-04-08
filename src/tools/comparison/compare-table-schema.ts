import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { diffCollections } from "../../utils/diff.js";
import { formatNamedDiffSection } from "./diff-section.js";
import { buildRelationshipComparisonKey, fetchTableSchema } from "../tables/table-metadata.js";

const TABLE_COMPARE_FIELDS = [
  "schemaName",
  "displayName",
  "entitySetName",
  "primaryIdAttribute",
  "primaryNameAttribute",
  "ownershipType",
  "isCustomEntity",
  "isManaged",
  "isActivity",
  "isAuditEnabled",
  "isValidForAdvancedFind",
  "changeTrackingEnabled",
];

const COLUMN_COMPARE_FIELDS = [
  "schemaName",
  "attributeType",
  "requiredLevel",
  "isPrimaryId",
  "isPrimaryName",
  "isAuditEnabled",
  "isValidForAdvancedFind",
  "isValidForCreate",
  "isValidForRead",
  "isValidForUpdate",
  "isCustomAttribute",
  "isSecured",
  "targets",
  "maxLength",
  "precision",
  "minValue",
  "maxValue",
  "formatName",
  "choiceKind",
  "optionSetName",
  "isGlobalChoice",
  "optionCount",
];

const KEY_COMPARE_FIELDS = ["schemaName", "keyAttributes", "indexStatus", "isManaged"];

const RELATIONSHIP_COMPARE_FIELDS = [
  "kind",
  "referencedEntity",
  "referencedAttribute",
  "referencingEntity",
  "referencingAttribute",
  "entity1LogicalName",
  "entity1IntersectAttribute",
  "entity2LogicalName",
  "entity2IntersectAttribute",
  "intersectEntityName",
  "isCustomRelationship",
  "isManaged",
  "securityTypes",
];

export function registerCompareTableSchema(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_table_schema",
    "Compare one Dataverse table schema across two environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      table: z.string().describe("Source table logical name, schema name, or display name"),
      targetTable: z
        .string()
        .optional()
        .describe("Optional target table logical name, schema name, or display name"),
    },
    async ({ sourceEnvironment, targetEnvironment, table, targetTable }) => {
      try {
        const sourceEnv = getEnvironment(config, sourceEnvironment);
        const targetEnv = getEnvironment(config, targetEnvironment);
        const [sourceSchema, targetSchema] = await Promise.all([
          fetchTableSchema(sourceEnv, client, table),
          fetchTableSchema(targetEnv, client, targetTable || table),
        ]);

        const tableDiff = diffCollections(
          [sourceSchema.table],
          [targetSchema.table],
          (item) => item.logicalName,
          TABLE_COMPARE_FIELDS,
        );
        const columnDiff = diffCollections(
          sourceSchema.columns,
          targetSchema.columns,
          (item) => item.logicalName,
          COLUMN_COMPARE_FIELDS,
        );
        const keyDiff = diffCollections(
          sourceSchema.keys,
          targetSchema.keys,
          (item) => item.logicalName || item.schemaName,
          KEY_COMPARE_FIELDS,
        );
        const relationshipDiff = diffCollections(
          sourceSchema.relationships,
          targetSchema.relationships,
          buildRelationshipComparisonKey,
          RELATIONSHIP_COMPARE_FIELDS,
        );

        const lines: string[] = [];
        lines.push("## Table Schema Comparison");
        lines.push(`- Source: ${sourceEnvironment} :: ${sourceSchema.table.logicalName}`);
        lines.push(`- Target: ${targetEnvironment} :: ${targetSchema.table.logicalName}`);
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Table",
            result: tableDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "logicalName",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Columns",
            result: columnDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "logicalName",
            emptyMessage: "No columns found.",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Alternate Keys",
            result: keyDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "logicalName",
            emptyMessage: "No alternate keys found.",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Relationships",
            result: relationshipDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "schemaName",
            emptyMessage: "No relationships found.",
          }),
        );

        return createToolSuccessResponse(
          "compare_table_schema",
          lines.join("\n"),
          `Compared table schema '${sourceSchema.table.logicalName}' between '${sourceEnvironment}' and '${targetEnvironment}'.`,
          {
            sourceEnvironment,
            targetEnvironment,
            sourceTable: sourceSchema.table,
            targetTable: targetSchema.table,
            tableComparison: tableDiff,
            columnComparison: columnDiff,
            keyComparison: keyDiff,
            relationshipComparison: relationshipDiff,
          },
        );
      } catch (error) {
        return createToolErrorResponse("compare_table_schema", error);
      }
    },
  );
}
