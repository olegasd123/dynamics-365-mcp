import type { TableColumnRecord, TableRelationshipRecord, TableRecord } from "./table-metadata.js";

export function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

export function buildTableFlags(table: TableRecord): string {
  return [
    `Custom=${formatYesNo(table.isCustomEntity)}`,
    `Managed=${formatYesNo(table.isManaged)}`,
    `Audit=${formatYesNo(table.isAuditEnabled)}`,
    `Search=${formatYesNo(table.isValidForAdvancedFind)}`,
    `ChangeTracking=${formatYesNo(table.changeTrackingEnabled)}`,
  ].join(" | ");
}

export function buildColumnDetails(column: TableColumnRecord): string {
  const parts: string[] = [];

  if (column.choiceKind) {
    parts.push(
      `${column.choiceKind}${column.optionCount !== undefined ? ` (${column.optionCount})` : ""}${column.optionSetName ? ` ${column.optionSetName}` : ""}${column.isGlobalChoice ? " global" : ""}`,
    );
  }

  if (column.targets.length > 0) {
    parts.push(`targets=${column.targets.join(",")}`);
  }

  if (column.maxLength !== undefined) {
    parts.push(`maxLength=${column.maxLength}`);
  }
  if (column.precision !== undefined) {
    parts.push(`precision=${column.precision}`);
  }
  if (column.minValue !== undefined || column.maxValue !== undefined) {
    parts.push(`range=${column.minValue ?? ""}..${column.maxValue ?? ""}`);
  }
  if (column.formatName) {
    parts.push(`format=${column.formatName}`);
  }

  return parts.join(" | ");
}

export function buildRelationshipRelatedTable(relationship: TableRelationshipRecord): string {
  return relationship.relatedTable;
}

export function buildRelationshipDetails(relationship: TableRelationshipRecord): string {
  return relationship.details;
}
