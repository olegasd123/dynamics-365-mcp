import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEnvironment } from "../../config/environments.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  fetchColumnsByLogicalName,
  listTables,
  type TableColumnRecord,
  type TableRecord,
} from "../tables/table-metadata.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_COLUMN_SCAN_LIMIT = 50;
const MAX_COLUMN_SCAN_LIMIT = 100;
const RECORD_COUNT_CHUNK_SIZE = 50;

const FILE_DATABASE_TABLES = new Set([
  "activitymimeattachment",
  "annotation",
  "fileattachment",
  "ribbonclientmetadata",
  "webresource",
]);

const LOG_TABLES = new Set(["audit", "plugintracelog"]);
const FILE_COLUMN_TYPES = new Set(["file", "filetype", "image", "imagetype"]);

const storageBreakdownSchema = {
  environment: z.string().optional().describe("Environment name"),
  tables: z
    .array(z.string())
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional table logical, schema, display, or entity set names. If omitted, all tables are counted.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(`Max table rows to return. Defaults to ${DEFAULT_LIMIT}.`),
  includeColumns: z
    .boolean()
    .optional()
    .describe(
      "Scan file and image columns for tables in the result. Defaults to true when tables are provided, otherwise false.",
    ),
  columnScanLimit: z
    .number()
    .int()
    .min(1)
    .max(MAX_COLUMN_SCAN_LIMIT)
    .optional()
    .describe(
      `Max tables to scan for file and image columns. Defaults to ${DEFAULT_COLUMN_SCAN_LIMIT}.`,
    ),
};

type StorageBreakdownParams = ToolParams<typeof storageBreakdownSchema>;
type StorageBucket = "database" | "file_database" | "log" | "unknown";

interface RetrieveCurrentOrganizationResponse {
  Detail?: Record<string, unknown>;
}

interface RetrieveTotalRecordCountResponse {
  EntityRecordCountCollection?: {
    Keys?: string[];
    Values?: number[];
  };
}

interface FileColumnSummary {
  logicalName: string;
  displayName: string;
  attributeType: string;
}

interface TableStorageBreakdown {
  logicalName: string;
  schemaName: string;
  displayName: string;
  entitySetName: string;
  rowCount: number | null;
  storageSignal: StorageBucket;
  storageSignalLabel: string;
  reason: string;
  fileOrImageColumns: FileColumnSummary[];
  isCustomEntity: boolean;
  isActivity: boolean;
}

interface CountFailure {
  table: string;
  message: string;
}

interface BucketSummary {
  key: StorageBucket;
  label: string;
  tableCount: number;
  rowCount: number;
}

export async function handleStorageBreakdown(
  { environment, tables, limit, includeColumns, columnScanLimit }: StorageBreakdownParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const resolvedLimit = limit ?? DEFAULT_LIMIT;
    const resolvedColumnScanLimit = columnScanLimit ?? DEFAULT_COLUMN_SCAN_LIMIT;
    const shouldScanColumns = includeColumns ?? Boolean(tables?.length);

    const [organization, allTables] = await Promise.all([
      fetchCurrentOrganization(env, client),
      listTables(env, client),
    ]);
    const selectedTables = resolveSelectedTables(allTables, tables);
    const { counts, failures } = await fetchRecordCounts(env, client, selectedTables);
    const baseRows = selectedTables
      .map((table) => buildBreakdownRow(table, counts.get(table.logicalName), []))
      .sort(compareBreakdownRows);
    const scanTargets = shouldScanColumns ? baseRows.slice(0, resolvedColumnScanLimit) : [];
    const fileColumnsByTable = await fetchFileColumnsForRows(env, client, scanTargets);
    const allRows = selectedTables
      .map((table) =>
        buildBreakdownRow(
          table,
          counts.get(table.logicalName),
          fileColumnsByTable.get(table.logicalName) || [],
        ),
      )
      .sort(compareBreakdownRows);
    const returnedRows = allRows.slice(0, resolvedLimit);
    const bucketSummary = buildBucketSummary(allRows);

    const organizationSummary = normalizeOrganization(organization);
    const lines = buildResponseText({
      bucketSummary,
      columnScanLimit: resolvedColumnScanLimit,
      env,
      failures,
      organization: organizationSummary,
      returnedRows,
      scannedColumnTableCount: scanTargets.length,
      selectedTableCount: selectedTables.length,
      shouldScanColumns,
      totalRowCount: sumRows(allRows),
    });

    return createToolSuccessResponse(
      "storage_breakdown",
      lines.join("\n"),
      `Built estimated storage breakdown for '${env.name}' across ${selectedTables.length} table(s).`,
      {
        environment: env.name,
        organization: organizationSummary,
        requestedTables: tables || null,
        analyzedTableCount: selectedTables.length,
        returnedTableCount: returnedRows.length,
        totalKnownRowCount: sumRows(allRows),
        rowCountSource: "RetrieveTotalRecordCount snapshot from the last 24 hours",
        capacityAccuracy:
          "Estimated storage signal only. It is not exact database, file, or log capacity in GB.",
        columnScan: {
          enabled: shouldScanColumns,
          scannedTableCount: scanTargets.length,
          scanLimit: resolvedColumnScanLimit,
        },
        bucketSummary,
        tables: returnedRows,
        failedRecordCounts: failures,
      },
    );
  } catch (error) {
    return createToolErrorResponse("storage_breakdown", error);
  }
}

async function fetchCurrentOrganization(
  env: EnvironmentConfig,
  client: DynamicsClient,
): Promise<Record<string, unknown> | null> {
  const response = await client.getPath<RetrieveCurrentOrganizationResponse>(
    env,
    "RetrieveCurrentOrganization(AccessType=@p1)",
    "@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'",
  );

  return response?.Detail || null;
}

async function fetchRecordCounts(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tables: TableRecord[],
): Promise<{ counts: Map<string, number>; failures: CountFailure[] }> {
  const counts = new Map<string, number>();
  const failures: CountFailure[] = [];

  for (const chunk of chunkArray(tables, RECORD_COUNT_CHUNK_SIZE)) {
    try {
      mergeCounts(counts, await fetchRecordCountChunk(env, client, chunk));
    } catch {
      for (const table of chunk) {
        try {
          mergeCounts(counts, await fetchRecordCountChunk(env, client, [table]));
        } catch (innerError) {
          failures.push({
            table: table.logicalName,
            message: getErrorMessage(innerError),
          });
        }
      }
    }
  }

  return { counts, failures };
}

async function fetchRecordCountChunk(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tables: TableRecord[],
): Promise<Map<string, number>> {
  const tableNames = tables.map((table) => table.logicalName);
  const response = await client.getPath<RetrieveTotalRecordCountResponse>(
    env,
    `RetrieveTotalRecordCount(EntityNames=[${tableNames.map(toODataStringLiteral).join(",")}])`,
  );
  const collection = response?.EntityRecordCountCollection;
  const keys = collection?.Keys || [];
  const values = collection?.Values || [];
  const counts = new Map<string, number>();

  keys.forEach((key, index) => {
    const value = values[index];
    if (typeof value === "number" && Number.isFinite(value)) {
      counts.set(key, value);
    }
  });

  return counts;
}

async function fetchFileColumnsForRows(
  env: EnvironmentConfig,
  client: DynamicsClient,
  rows: TableStorageBreakdown[],
): Promise<Map<string, FileColumnSummary[]>> {
  const result = new Map<string, FileColumnSummary[]>();

  await Promise.all(
    rows.map(async (row) => {
      const columns = await fetchColumnsByLogicalName(env, client, row.logicalName);
      result.set(row.logicalName, getFileColumns(columns));
    }),
  );

  return result;
}

function resolveSelectedTables(allTables: TableRecord[], tableRefs?: string[]): TableRecord[] {
  if (!tableRefs?.length) {
    return allTables;
  }

  const selected = tableRefs.map((tableRef) => resolveTableFromList(allTables, tableRef));
  const uniqueByLogicalName = new Map(selected.map((table) => [table.logicalName, table]));
  return [...uniqueByLogicalName.values()].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName),
  );
}

function resolveTableFromList(allTables: TableRecord[], tableRef: string): TableRecord {
  const needle = tableRef.trim().toLowerCase();
  const matches = allTables.filter(
    (table) =>
      table.logicalName.toLowerCase() === needle ||
      table.schemaName.toLowerCase() === needle ||
      table.displayName.toLowerCase() === needle ||
      table.entitySetName.toLowerCase() === needle,
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `Table '${tableRef}' matches more than one table. Use the logical name to select one table.`,
    );
  }

  throw new Error(`Table '${tableRef}' was not found.`);
}

function buildBreakdownRow(
  table: TableRecord,
  rowCount: number | undefined,
  fileOrImageColumns: FileColumnSummary[],
): TableStorageBreakdown {
  const classification = classifyTable(table, fileOrImageColumns);

  return {
    logicalName: table.logicalName,
    schemaName: table.schemaName,
    displayName: table.displayName,
    entitySetName: table.entitySetName,
    rowCount: typeof rowCount === "number" ? rowCount : null,
    storageSignal: classification.bucket,
    storageSignalLabel: getBucketLabel(classification.bucket),
    reason: classification.reason,
    fileOrImageColumns,
    isCustomEntity: table.isCustomEntity,
    isActivity: table.isActivity,
  };
}

function classifyTable(
  table: TableRecord,
  fileOrImageColumns: FileColumnSummary[],
): { bucket: StorageBucket; reason: string } {
  const logicalName = table.logicalName.toLowerCase();
  const displayName = table.displayName.toLowerCase();

  if (LOG_TABLES.has(logicalName)) {
    return { bucket: "log", reason: "Known log table" };
  }

  if (FILE_DATABASE_TABLES.has(logicalName)) {
    return { bucket: "file_database", reason: "Known file and database table" };
  }

  if (logicalName.endsWith("analytics") || displayName.endsWith("analytics")) {
    return { bucket: "file_database", reason: "Analytics table" };
  }

  if (fileOrImageColumns.length > 0) {
    return { bucket: "file_database", reason: "Has file or image columns" };
  }

  if (!table.logicalName) {
    return { bucket: "unknown", reason: "Missing table metadata" };
  }

  return { bucket: "database", reason: "Default Dataverse table storage signal" };
}

function getFileColumns(columns: TableColumnRecord[]): FileColumnSummary[] {
  return columns
    .filter((column) => FILE_COLUMN_TYPES.has(column.attributeType.toLowerCase()))
    .map((column) => ({
      logicalName: column.logicalName,
      displayName: column.displayName,
      attributeType: column.attributeType,
    }));
}

function buildBucketSummary(rows: TableStorageBreakdown[]): BucketSummary[] {
  const summaries = new Map<StorageBucket, BucketSummary>(
    (["database", "file_database", "log", "unknown"] as StorageBucket[]).map((bucket) => [
      bucket,
      {
        key: bucket,
        label: getBucketLabel(bucket),
        tableCount: 0,
        rowCount: 0,
      },
    ]),
  );

  for (const row of rows) {
    const summary = summaries.get(row.storageSignal);
    if (!summary) {
      continue;
    }
    summary.tableCount += 1;
    summary.rowCount += row.rowCount ?? 0;
  }

  return [...summaries.values()].filter((summary) => summary.tableCount > 0);
}

function buildResponseText(options: {
  bucketSummary: BucketSummary[];
  columnScanLimit: number;
  env: EnvironmentConfig;
  failures: CountFailure[];
  organization: Record<string, unknown>;
  returnedRows: TableStorageBreakdown[];
  scannedColumnTableCount: number;
  selectedTableCount: number;
  shouldScanColumns: boolean;
  totalRowCount: number;
}): string[] {
  const lines: string[] = [];
  lines.push("## Storage Breakdown");
  lines.push(`- Environment: ${options.env.name}`);
  lines.push(`- Organization: ${String(options.organization.friendlyName || "-")}`);
  lines.push(`- Tables Analyzed: ${options.selectedTableCount}`);
  lines.push(`- Known Row Count: ${options.totalRowCount}`);
  lines.push("- Row Count Source: RetrieveTotalRecordCount snapshot from the last 24 hours");
  lines.push("- Capacity Accuracy: Estimated storage signal only, not exact GB capacity");
  lines.push(
    `- Column Scan: ${
      options.shouldScanColumns
        ? `${options.scannedColumnTableCount} table(s), limit ${options.columnScanLimit}`
        : "disabled"
    }`,
  );
  lines.push("");
  lines.push("### Storage Signal Summary");
  lines.push(
    formatTable(
      ["Signal", "Tables", "Rows"],
      options.bucketSummary.map((summary) => [
        summary.label,
        String(summary.tableCount),
        String(summary.rowCount),
      ]),
    ),
  );
  lines.push("");
  lines.push("### Top Tables By Row Count");
  lines.push(
    formatTable(
      ["Table", "Display Name", "Rows", "Signal", "Reason", "File/Image Columns"],
      options.returnedRows.map((row) => [
        row.logicalName,
        row.displayName || "-",
        row.rowCount === null ? "-" : String(row.rowCount),
        row.storageSignalLabel,
        row.reason,
        row.fileOrImageColumns.map((column) => column.logicalName).join(", ") || "-",
      ]),
    ),
  );

  if (options.failures.length > 0) {
    lines.push("");
    lines.push("### Count Failures");
    lines.push(
      formatTable(
        ["Table", "Message"],
        options.failures.map((failure) => [failure.table, failure.message]),
      ),
    );
  }

  return lines;
}

function normalizeOrganization(
  organization: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!organization) {
    return {};
  }

  return {
    friendlyName: organization.FriendlyName || null,
    organizationId: organization.OrganizationId || null,
    environmentId: organization.EnvironmentId || null,
    organizationVersion: organization.OrganizationVersion || null,
    organizationType: normalizeEnumValue(organization.OrganizationType),
    geo: organization.Geo || null,
  };
}

function compareBreakdownRows(left: TableStorageBreakdown, right: TableStorageBreakdown): number {
  return (
    (right.rowCount ?? -1) - (left.rowCount ?? -1) ||
    left.logicalName.localeCompare(right.logicalName)
  );
}

function sumRows(rows: TableStorageBreakdown[]): number {
  return rows.reduce((total, row) => total + (row.rowCount ?? 0), 0);
}

function mergeCounts(target: Map<string, number>, source: Map<string, number>) {
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function toODataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeEnumValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.Value === "string" || typeof record.Value === "number") {
      return String(record.Value);
    }
    if (typeof record.value === "string" || typeof record.value === "number") {
      return String(record.value);
    }
  }

  return "";
}

function getBucketLabel(bucket: StorageBucket): string {
  switch (bucket) {
    case "database":
      return "Database";
    case "file_database":
      return "File And Database";
    case "log":
      return "Log";
    case "unknown":
      return "Unknown";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const storageBreakdownTool = defineTool({
  name: "storage_breakdown",
  description:
    "Estimate Dataverse storage drivers by table using organization context, table row counts, and storage type signals.",
  schema: storageBreakdownSchema,
  handler: handleStorageBreakdown,
});

export function registerStorageBreakdown(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, storageBreakdownTool, { config, client });
}
