import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient, ODataPageResult } from "../../client/dynamics-client.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { listAuditActivityTrendQuery } from "../../queries/audit-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { listTables, type TableRecord } from "../tables/table-metadata.js";
import { normalizeDateTimeInput } from "../system-jobs/system-job-metadata.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_TABLES = 25;
const DEFAULT_MAX_RECORDS = 5000;
const MAX_RECORDS = 50000;
const PAGE_SIZE = 200;
const MAX_DAYS = 366;
const TEXT_DAILY_ROW_LIMIT = 80;

const AUDIT_DEPENDENCY_NOTE =
  "This report mostly depends on Dataverse audit data. If audit is disabled, not readable, or old audit rows were removed, activity can be missing.";

const recordActivityTrendsSchema = {
  environment: z.string().optional().describe("Environment name"),
  tables: z
    .array(z.string())
    .min(1)
    .max(MAX_TABLES)
    .describe("Table logical, schema, display, or entity set names."),
  createdAfter: z
    .string()
    .optional()
    .describe(
      "Optional audit window start in ISO format like 2026-04-20T08:00:00Z. Defaults to 30 days before createdBefore or now.",
    ),
  createdBefore: z
    .string()
    .optional()
    .describe(
      "Optional audit window end in ISO format like 2026-04-20T09:00:00Z. Defaults to now.",
    ),
  maxRecords: z
    .number()
    .int()
    .min(1)
    .max(MAX_RECORDS)
    .optional()
    .describe(`Optional maximum audit records to scan. Defaults to ${DEFAULT_MAX_RECORDS}.`),
  includeEmptyDays: z
    .boolean()
    .optional()
    .describe("Include days with zero activity in the daily trend rows. Defaults to true."),
};

type RecordActivityTrendsParams = ToolParams<typeof recordActivityTrendsSchema>;
type ActivityKind = "created" | "modified" | "deleted" | "other";

interface AuditActivityRecord extends Record<string, unknown> {
  auditid?: unknown;
  createdon?: unknown;
  action?: unknown;
  operation?: unknown;
  objecttypecode?: unknown;
}

interface ActivityCounts {
  created: number;
  modified: number;
  deleted: number;
  other: number;
  total: number;
}

interface TableActivitySummary extends ActivityCounts {
  tableLogicalName: string;
  tableDisplayName: string;
  isAuditEnabled: boolean;
  firstActivityOn: string | null;
  lastActivityOn: string | null;
  activeDays: number;
}

interface DailyActivityRow extends ActivityCounts {
  date: string;
  tableLogicalName: string;
  tableDisplayName: string;
}

interface TimeWindow {
  createdAfter: string;
  createdBefore: string;
}

export async function handleRecordActivityTrends(
  {
    environment,
    tables,
    createdAfter,
    createdBefore,
    maxRecords,
    includeEmptyDays,
  }: RecordActivityTrendsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const timeWindow = resolveTimeWindow(createdAfter, createdBefore);
    const dayCount = countUtcDays(timeWindow.createdAfter, timeWindow.createdBefore);
    if (dayCount > MAX_DAYS) {
      throw new Error(
        `The selected time window covers ${dayCount} days. Use ${MAX_DAYS} days or less.`,
      );
    }

    const resolvedMaxRecords = maxRecords ?? DEFAULT_MAX_RECORDS;
    const resolvedIncludeEmptyDays = includeEmptyDays ?? true;
    const resolvedTables = resolveRequestedTables(await listTables(env, client), tables);
    const auditRows = await fetchAuditRows(env, client, {
      tableLogicalNames: resolvedTables.map((table) => table.logicalName),
      timeWindow,
      maxRecords: resolvedMaxRecords,
    });
    const normalizedRows = auditRows.items
      .map(normalizeAuditActivityRecord)
      .filter((record): record is NormalizedAuditActivityRecord => record !== null);
    const dailyRows = buildDailyRows(normalizedRows, resolvedTables, {
      includeEmptyDays: resolvedIncludeEmptyDays,
      timeWindow,
    });
    const summaries = buildTableSummaries(dailyRows, resolvedTables, normalizedRows);
    const warnings = buildWarnings({
      hasMore: auditRows.hasMore,
      maxRecords: resolvedMaxRecords,
      resolvedTables,
    });

    const text = buildResponseText({
      dailyRows,
      env,
      summaries,
      timeWindow,
      totalCount: auditRows.totalCount,
      scannedCount: normalizedRows.length,
      warnings,
    });

    return createToolSuccessResponse(
      "record_activity_trends",
      text,
      `Built audit-based record activity trends for '${env.name}' across ${resolvedTables.length} table(s).`,
      {
        environment: env.name,
        filters: {
          tables: resolvedTables.map((table) => table.logicalName),
          createdAfter: timeWindow.createdAfter,
          createdBefore: timeWindow.createdBefore,
          includeEmptyDays: resolvedIncludeEmptyDays,
        },
        auditDependencyNote: AUDIT_DEPENDENCY_NOTE,
        maxRecords: resolvedMaxRecords,
        scannedAuditRecordCount: normalizedRows.length,
        totalAuditRecordCount: auditRows.totalCount,
        hasMore: auditRows.hasMore,
        warnings,
        summaries,
        dailyRows,
      },
    );
  } catch (error) {
    return createToolErrorResponse("record_activity_trends", error);
  }
}

export const recordActivityTrendsTool = defineTool({
  name: "record_activity_trends",
  description:
    "Report audit-based created, modified, and deleted record activity counts per table per day.",
  schema: recordActivityTrendsSchema,
  handler: handleRecordActivityTrends,
});

export function registerRecordActivityTrends(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, recordActivityTrendsTool, { config, client });
}

interface FetchAuditRowsOptions {
  tableLogicalNames: string[];
  timeWindow: TimeWindow;
  maxRecords: number;
}

async function fetchAuditRows(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: FetchAuditRowsOptions,
): Promise<{
  items: AuditActivityRecord[];
  totalCount: number | null;
  hasMore: boolean;
}> {
  const items: AuditActivityRecord[] = [];
  let nextLink: string | null = null;
  let totalCount: number | null = null;

  do {
    const remaining = options.maxRecords - items.length;
    const page = await fetchAuditPage(env, client, {
      ...options,
      pageLink: nextLink,
      top: Math.min(PAGE_SIZE, remaining),
    });
    if (totalCount === null && page.totalCount !== null) {
      totalCount = page.totalCount;
    }

    items.push(...page.items.slice(0, remaining));
    nextLink = page.nextLink;
  } while (nextLink && items.length < options.maxRecords);

  return {
    items,
    totalCount,
    hasMore: Boolean(nextLink) || (totalCount !== null && totalCount > items.length),
  };
}

async function fetchAuditPage(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: FetchAuditRowsOptions & {
    pageLink: string | null;
    top: number;
  },
): Promise<ODataPageResult<AuditActivityRecord>> {
  if (options.pageLink) {
    return client.queryPagePath<AuditActivityRecord>(env, "audits", undefined, {
      pageLink: options.pageLink,
      cacheTier: CACHE_TIERS.VOLATILE,
    });
  }

  return client.queryPage<AuditActivityRecord>(
    env,
    "audits",
    listAuditActivityTrendQuery({
      tableLogicalNames: options.tableLogicalNames,
      createdAfter: options.timeWindow.createdAfter,
      createdBefore: options.timeWindow.createdBefore,
      top: options.top,
    }),
    { cacheTier: CACHE_TIERS.VOLATILE },
  );
}

interface NormalizedAuditActivityRecord {
  auditId: string;
  tableLogicalName: string;
  changedOn: string;
  date: string;
  kind: ActivityKind;
}

function normalizeAuditActivityRecord(
  record: AuditActivityRecord,
): NormalizedAuditActivityRecord | null {
  const changedOn = normalizeOptionalString(record.createdon);
  const tableLogicalName = normalizeOptionalString(record.objecttypecode);
  if (!changedOn || !tableLogicalName) {
    return null;
  }

  const parsedDate = new Date(changedOn);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return {
    auditId: normalizeOptionalString(record.auditid) || "",
    tableLogicalName,
    changedOn: parsedDate.toISOString(),
    date: toUtcDateKey(parsedDate),
    kind: classifyActivityKind(record),
  };
}

function classifyActivityKind(record: AuditActivityRecord): ActivityKind {
  const operationNumber = getNumber(record.operation);
  if (operationNumber === 1) {
    return "created";
  }
  if (operationNumber === 2) {
    return "modified";
  }
  if (operationNumber === 3) {
    return "deleted";
  }

  const actionNumber = getNumber(record.action);
  if (actionNumber === 1) {
    return "created";
  }
  if (actionNumber === 2) {
    return "modified";
  }
  if (actionNumber === 3) {
    return "deleted";
  }

  const label = [
    readFormattedValue(record, "operation"),
    readFormattedValue(record, "action"),
    normalizeOptionalString(record.operation),
    normalizeOptionalString(record.action),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (label.includes("create")) {
    return "created";
  }
  if (label.includes("update") || label.includes("modify")) {
    return "modified";
  }
  if (label.includes("delete")) {
    return "deleted";
  }

  return "other";
}

function buildDailyRows(
  records: NormalizedAuditActivityRecord[],
  tables: TableRecord[],
  options: {
    includeEmptyDays: boolean;
    timeWindow: TimeWindow;
  },
): DailyActivityRow[] {
  const rowsByKey = new Map<string, DailyActivityRow>();
  const tableByLogicalName = new Map(tables.map((table) => [table.logicalName, table]));

  if (options.includeEmptyDays) {
    for (const date of enumerateUtcDateKeys(options.timeWindow)) {
      for (const table of tables) {
        rowsByKey.set(buildDailyKey(table.logicalName, date), createDailyRow(table, date));
      }
    }
  }

  for (const record of records) {
    const table = tableByLogicalName.get(record.tableLogicalName);
    if (!table) {
      continue;
    }

    const key = buildDailyKey(table.logicalName, record.date);
    const row = rowsByKey.get(key) || createDailyRow(table, record.date);
    incrementCounts(row, record.kind);
    rowsByKey.set(key, row);
  }

  return [...rowsByKey.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.tableLogicalName.localeCompare(right.tableLogicalName),
  );
}

function buildTableSummaries(
  dailyRows: DailyActivityRow[],
  tables: TableRecord[],
  records: NormalizedAuditActivityRecord[],
): TableActivitySummary[] {
  const recordsByTable = new Map<string, NormalizedAuditActivityRecord[]>();
  for (const record of records) {
    const tableRecords = recordsByTable.get(record.tableLogicalName) || [];
    tableRecords.push(record);
    recordsByTable.set(record.tableLogicalName, tableRecords);
  }

  return tables
    .map((table) => {
      const rows = dailyRows.filter((row) => row.tableLogicalName === table.logicalName);
      const tableRecords = recordsByTable.get(table.logicalName) || [];
      const counts = rows.reduce<ActivityCounts>(
        (accumulator, row) => addCounts(accumulator, row),
        createCounts(),
      );
      const activeDays = rows.filter((row) => row.total > 0).length;
      const sortedActivity = [...tableRecords].sort((left, right) =>
        left.changedOn.localeCompare(right.changedOn),
      );

      return {
        tableLogicalName: table.logicalName,
        tableDisplayName: table.displayName,
        isAuditEnabled: table.isAuditEnabled,
        ...counts,
        firstActivityOn: sortedActivity[0]?.changedOn || null,
        lastActivityOn: sortedActivity[sortedActivity.length - 1]?.changedOn || null,
        activeDays,
      };
    })
    .sort(
      (left, right) =>
        right.total - left.total || left.tableLogicalName.localeCompare(right.tableLogicalName),
    );
}

function buildResponseText(options: {
  dailyRows: DailyActivityRow[];
  env: EnvironmentConfig;
  scannedCount: number;
  summaries: TableActivitySummary[];
  timeWindow: TimeWindow;
  totalCount: number | null;
  warnings: string[];
}): string {
  const shownDailyRows = options.dailyRows.slice(0, TEXT_DAILY_ROW_LIMIT);
  const dailyRowNote =
    options.dailyRows.length > shownDailyRows.length
      ? `Showing ${shownDailyRows.length} of ${options.dailyRows.length} daily rows in text. The structured response contains all rows.`
      : `Showing ${shownDailyRows.length} daily rows.`;

  const lines = [
    "## Record Activity Trends",
    "",
    AUDIT_DEPENDENCY_NOTE,
    "",
    `- Environment: ${options.env.name}`,
    `- Created After: ${options.timeWindow.createdAfter}`,
    `- Created Before: ${options.timeWindow.createdBefore}`,
    "- Daily Bucket: UTC date",
    `- Scanned Audit Records: ${options.scannedCount}`,
    `- Total Matching Audit Records: ${options.totalCount ?? "Unknown"}`,
  ];

  if (options.warnings.length > 0) {
    lines.push("", "### Warnings", "", ...options.warnings.map((warning) => `- ${warning}`));
  }

  lines.push(
    "",
    "### Table Summary",
    "",
    formatTable(
      [
        "Table",
        "Audit",
        "Created",
        "Modified",
        "Deleted",
        "Other",
        "Total",
        "Active Days",
        "Last Activity",
      ],
      options.summaries.map((summary) => [
        summary.tableLogicalName,
        summary.isAuditEnabled ? "Enabled" : "Disabled",
        String(summary.created),
        String(summary.modified),
        String(summary.deleted),
        String(summary.other),
        String(summary.total),
        String(summary.activeDays),
        summary.lastActivityOn || "-",
      ]),
    ),
    "",
    "### Daily Counts",
    "",
    dailyRowNote,
    "",
    formatTable(
      ["Date", "Table", "Created", "Modified", "Deleted", "Other", "Total"],
      shownDailyRows.map((row) => [
        row.date,
        row.tableLogicalName,
        String(row.created),
        String(row.modified),
        String(row.deleted),
        String(row.other),
        String(row.total),
      ]),
    ),
  );

  return lines.join("\n");
}

function buildWarnings(options: {
  hasMore: boolean;
  maxRecords: number;
  resolvedTables: TableRecord[];
}): string[] {
  const warnings = [AUDIT_DEPENDENCY_NOTE];
  const disabledTables = options.resolvedTables
    .filter((table) => !table.isAuditEnabled)
    .map((table) => table.logicalName);

  if (disabledTables.length > 0) {
    warnings.push(`Audit is disabled in table metadata for: ${disabledTables.join(", ")}.`);
  }

  if (options.hasMore) {
    warnings.push(
      `The scan reached maxRecords=${options.maxRecords}. Counts can be lower than the real audit activity.`,
    );
  }

  return warnings;
}

function resolveRequestedTables(
  allTables: TableRecord[],
  requestedTables: string[],
): TableRecord[] {
  const resolvedTables = requestedTables.map((tableRef) => resolveOneTable(allTables, tableRef));
  const uniqueByLogicalName = new Map<string, TableRecord>();

  for (const table of resolvedTables) {
    uniqueByLogicalName.set(table.logicalName, table);
  }

  return [...uniqueByLogicalName.values()];
}

function resolveOneTable(allTables: TableRecord[], tableRef: string): TableRecord {
  const needle = tableRef.trim();
  if (!needle) {
    throw new Error("Table names must not be empty.");
  }

  const exactMatches = allTables.filter(
    (table) =>
      table.logicalName === needle ||
      table.schemaName === needle ||
      table.displayName === needle ||
      table.entitySetName === needle,
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const lowerNeedle = needle.toLowerCase();
  const caseMatches = allTables.filter(
    (table) =>
      table.logicalName.toLowerCase() === lowerNeedle ||
      table.schemaName.toLowerCase() === lowerNeedle ||
      table.displayName.toLowerCase() === lowerNeedle ||
      table.entitySetName.toLowerCase() === lowerNeedle,
  );
  if (caseMatches.length === 1) {
    return caseMatches[0];
  }

  const partialMatches = allTables.filter(
    (table) =>
      table.logicalName.toLowerCase().includes(lowerNeedle) ||
      table.schemaName.toLowerCase().includes(lowerNeedle) ||
      table.displayName.toLowerCase().includes(lowerNeedle) ||
      table.entitySetName.toLowerCase().includes(lowerNeedle),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1 || caseMatches.length > 1 || exactMatches.length > 1) {
    throw new Error(`Table '${tableRef}' matched more than one table. Use the logical name.`);
  }

  throw new Error(`Table '${tableRef}' was not found.`);
}

function resolveTimeWindow(
  createdAfter: string | undefined,
  createdBefore: string | undefined,
): TimeWindow {
  const normalizedBefore =
    normalizeDateTimeInput(createdBefore, "createdBefore") || new Date().toISOString();
  const normalizedAfter =
    normalizeDateTimeInput(createdAfter, "createdAfter") ||
    new Date(
      new Date(normalizedBefore).getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

  if (normalizedAfter > normalizedBefore) {
    throw new Error("createdAfter must be earlier than or equal to createdBefore.");
  }

  return {
    createdAfter: normalizedAfter,
    createdBefore: normalizedBefore,
  };
}

function countUtcDays(createdAfter: string, createdBefore: string): number {
  return enumerateUtcDateKeys({ createdAfter, createdBefore }).length;
}

function enumerateUtcDateKeys(timeWindow: TimeWindow): string[] {
  const start = new Date(toUtcDateKey(new Date(timeWindow.createdAfter)));
  const end = new Date(toUtcDateKey(new Date(timeWindow.createdBefore)));
  const days: string[] = [];

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += 24 * 60 * 60 * 1000) {
    days.push(toUtcDateKey(new Date(cursor)));
  }

  return days;
}

function createDailyRow(table: TableRecord, date: string): DailyActivityRow {
  return {
    date,
    tableLogicalName: table.logicalName,
    tableDisplayName: table.displayName,
    ...createCounts(),
  };
}

function createCounts(): ActivityCounts {
  return {
    created: 0,
    modified: 0,
    deleted: 0,
    other: 0,
    total: 0,
  };
}

function addCounts(left: ActivityCounts, right: ActivityCounts): ActivityCounts {
  return {
    created: left.created + right.created,
    modified: left.modified + right.modified,
    deleted: left.deleted + right.deleted,
    other: left.other + right.other,
    total: left.total + right.total,
  };
}

function incrementCounts(counts: ActivityCounts, kind: ActivityKind): void {
  counts[kind] += 1;
  counts.total += 1;
}

function buildDailyKey(tableLogicalName: string, date: string): string {
  return `${tableLogicalName}:${date}`;
}

function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function readFormattedValue(record: Record<string, unknown>, fieldName: string): string | null {
  return normalizeOptionalString(record[`${fieldName}@OData.Community.Display.V1.FormattedValue`]);
}

function normalizeOptionalString(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function getNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
