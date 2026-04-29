import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { getEnvironment } from "../../config/environments.js";
import { formatTable } from "../../utils/formatters.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  fetchTableColumns,
  type TableColumnRecord,
  type TableRecord,
} from "../tables/table-metadata.js";
import {
  decodeAuditHistoryCursor,
  listAuditHistoryPage,
  normalizeAuditDateTimeInput,
  validateAuditDateRange,
  type AuditHistoryItem,
} from "./audit-history.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_MAX_RECORDS = 500;
const MAX_RECORDS = 5000;
const PAGE_SIZE = 100;
const DEFAULT_TOP_FIELDS = 25;
const MAX_TOP_FIELDS = 100;

const AUDIT_DEPENDENCY_NOTE =
  "This report depends on Dataverse audit data and audit detail payloads. If audit is disabled, not readable, or old audit rows were removed, field changes can be missing.";

const fieldChangeFrequencySchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
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
  topFields: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_FIELDS)
    .optional()
    .describe(`Optional number of fields to return. Defaults to ${DEFAULT_TOP_FIELDS}.`),
  includeSystemUsers: z
    .boolean()
    .optional()
    .describe(
      "Include likely system, application, service, or integration users. Defaults to true.",
    ),
};

type FieldChangeFrequencyParams = ToolParams<typeof fieldChangeFrequencySchema>;
type ActorKind = "human" | "automation" | "unknown";

interface TimeWindow {
  createdAfter: string;
  createdBefore: string;
}

interface FieldChangeSummary extends Record<string, unknown> {
  logicalName: string;
  displayName: string;
  attributeType: string;
  isAuditEnabled: boolean;
  isCustomAttribute: boolean;
  isSecured: boolean;
  changeCount: number;
  recordsChanged: number;
  changedByUsers: number;
  firstChangedOn: string | null;
  lastChangedOn: string | null;
  percentageOfFieldDiffEntries: number;
  actorBreakdown: Record<ActorKind, number>;
}

interface FieldAccumulator {
  logicalName: string;
  changeCount: number;
  recordIds: Set<string>;
  users: Set<string>;
  firstChangedOn: string | null;
  lastChangedOn: string | null;
  actorBreakdown: Record<ActorKind, number>;
}

interface AuditScanResult {
  items: AuditHistoryItem[];
  scannedCount: number;
  totalCount: number | null;
  hasMore: boolean;
}

export async function handleFieldChangeFrequency(
  {
    environment,
    table,
    createdAfter,
    createdBefore,
    maxRecords,
    topFields,
    includeSystemUsers,
  }: FieldChangeFrequencyParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const timeWindow = resolveTimeWindow(createdAfter, createdBefore);
    validateAuditDateRange(timeWindow.createdAfter, timeWindow.createdBefore);

    const { table: resolvedTable, columns } = await fetchTableColumns(env, client, table);
    const resolvedMaxRecords = maxRecords ?? DEFAULT_MAX_RECORDS;
    const resolvedTopFields = topFields ?? DEFAULT_TOP_FIELDS;
    const resolvedIncludeSystemUsers = includeSystemUsers ?? true;
    const scan = await scanAuditHistory(env, client, {
      tableLogicalName: resolvedTable.logicalName,
      timeWindow,
      maxRecords: resolvedMaxRecords,
    });
    const includedItems = resolvedIncludeSystemUsers
      ? scan.items
      : scan.items.filter(
          (item) => classifyActor(item.userName, item.callingUserName) !== "automation",
        );
    const entriesWithFieldDiff = includedItems.filter(
      (item) => item.changedFields.length > 0,
    ).length;
    const fields = buildFieldSummaries(includedItems, columns, entriesWithFieldDiff).slice(
      0,
      resolvedTopFields,
    );
    const warnings = buildWarnings({
      resolvedTable,
      scan,
      includedItems,
      entriesWithFieldDiff,
      resolvedMaxRecords,
    });
    const text = buildResponseText({
      env,
      table: resolvedTable,
      timeWindow,
      fields,
      scan,
      entriesWithFieldDiff,
      warnings,
    });

    return createToolSuccessResponse(
      "field_change_frequency",
      text,
      `Analyzed audit-based field change frequency for '${resolvedTable.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: resolvedTable,
        filters: {
          createdAfter: timeWindow.createdAfter,
          createdBefore: timeWindow.createdBefore,
          includeSystemUsers: resolvedIncludeSystemUsers,
        },
        auditDependencyNote: AUDIT_DEPENDENCY_NOTE,
        maxRecords: resolvedMaxRecords,
        scannedAuditRecordCount: scan.scannedCount,
        includedAuditRecordCount: includedItems.length,
        totalAuditRecordCount: scan.totalCount,
        hasMore: scan.hasMore,
        entriesWithFieldDiff,
        warnings,
        fields,
      },
    );
  } catch (error) {
    return createToolErrorResponse("field_change_frequency", error);
  }
}

export const fieldChangeFrequencyTool = defineTool({
  name: "field_change_frequency",
  description:
    "Rank table fields by audit-based edit frequency, with distinct records, distinct users, actor hints, and audit coverage warnings.",
  schema: fieldChangeFrequencySchema,
  handler: handleFieldChangeFrequency,
});

export function registerFieldChangeFrequency(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, fieldChangeFrequencyTool, { config, client });
}

async function scanAuditHistory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: {
    tableLogicalName: string;
    timeWindow: TimeWindow;
    maxRecords: number;
  },
): Promise<AuditScanResult> {
  const items: AuditHistoryItem[] = [];
  let cursor = decodeAuditHistoryCursor(undefined);
  let totalCount: number | null = null;
  let hasMore = false;

  do {
    const remaining = options.maxRecords - items.length;
    const page = await listAuditHistoryPage(env, client, {
      tableLogicalName: options.tableLogicalName,
      createdAfter: options.timeWindow.createdAfter,
      createdBefore: options.timeWindow.createdBefore,
      limit: Math.min(PAGE_SIZE, remaining),
      cursor,
      includeDetails: true,
    });

    items.push(...page.items);
    totalCount = page.totalCount;
    hasMore = page.hasMore;
    cursor = page.nextCursor ? decodeAuditHistoryCursor(page.nextCursor) : null;
  } while (cursor && items.length < options.maxRecords);

  return {
    items,
    scannedCount: items.length,
    totalCount,
    hasMore: hasMore && items.length >= options.maxRecords,
  };
}

function buildFieldSummaries(
  items: AuditHistoryItem[],
  columns: TableColumnRecord[],
  entriesWithFieldDiff: number,
): FieldChangeSummary[] {
  const columnsByLogicalName = new Map(columns.map((column) => [column.logicalName, column]));
  const accumulators = new Map<string, FieldAccumulator>();

  for (const item of items) {
    const actorKind = classifyActor(item.userName, item.callingUserName);
    const actorName = item.userName && item.userName !== "-" ? item.userName : item.callingUserName;

    for (const field of item.changedFields) {
      const accumulator = getFieldAccumulator(accumulators, field.logicalName);
      accumulator.changeCount += 1;
      accumulator.actorBreakdown[actorKind] += 1;

      if (item.recordId) {
        accumulator.recordIds.add(item.recordId);
      }
      if (actorName) {
        accumulator.users.add(actorName);
      }

      accumulator.firstChangedOn = earlierDate(accumulator.firstChangedOn, item.changedOn);
      accumulator.lastChangedOn = laterDate(accumulator.lastChangedOn, item.changedOn);
    }
  }

  return [...accumulators.values()]
    .map((item) => {
      const column = columnsByLogicalName.get(item.logicalName);

      return {
        logicalName: item.logicalName,
        displayName: column?.displayName || item.logicalName,
        attributeType: column?.attributeType || "",
        isAuditEnabled: column?.isAuditEnabled ?? false,
        isCustomAttribute: column?.isCustomAttribute ?? false,
        isSecured: column?.isSecured ?? false,
        changeCount: item.changeCount,
        recordsChanged: item.recordIds.size,
        changedByUsers: item.users.size,
        firstChangedOn: item.firstChangedOn,
        lastChangedOn: item.lastChangedOn,
        percentageOfFieldDiffEntries:
          entriesWithFieldDiff > 0
            ? Math.round((item.changeCount / entriesWithFieldDiff) * 1000) / 10
            : 0,
        actorBreakdown: item.actorBreakdown,
      };
    })
    .sort(
      (left, right) =>
        right.changeCount - left.changeCount ||
        right.recordsChanged - left.recordsChanged ||
        left.logicalName.localeCompare(right.logicalName),
    );
}

function getFieldAccumulator(
  accumulators: Map<string, FieldAccumulator>,
  logicalName: string,
): FieldAccumulator {
  const existing = accumulators.get(logicalName);
  if (existing) {
    return existing;
  }

  const created: FieldAccumulator = {
    logicalName,
    changeCount: 0,
    recordIds: new Set<string>(),
    users: new Set<string>(),
    firstChangedOn: null,
    lastChangedOn: null,
    actorBreakdown: {
      human: 0,
      automation: 0,
      unknown: 0,
    },
  };
  accumulators.set(logicalName, created);

  return created;
}

function buildWarnings(options: {
  resolvedTable: TableRecord;
  scan: AuditScanResult;
  includedItems: AuditHistoryItem[];
  entriesWithFieldDiff: number;
  resolvedMaxRecords: number;
}): string[] {
  const warnings: string[] = [];

  if (!options.resolvedTable.isAuditEnabled) {
    warnings.push(
      `Audit is disabled in table metadata for '${options.resolvedTable.logicalName}'.`,
    );
  }

  if (options.scan.hasMore) {
    warnings.push(
      `The scan reached maxRecords=${options.resolvedMaxRecords}. Counts can be lower than the real field activity.`,
    );
  }

  if (options.scan.scannedCount > 0 && options.entriesWithFieldDiff === 0) {
    warnings.push(
      "Audit rows were found, but no field diff details were readable in the scanned rows.",
    );
  }

  if (options.includedItems.length < options.scan.scannedCount) {
    warnings.push("Some likely system or integration user rows were excluded.");
  }

  return warnings;
}

function buildResponseText(options: {
  env: EnvironmentConfig;
  table: TableRecord;
  timeWindow: TimeWindow;
  fields: FieldChangeSummary[];
  scan: AuditScanResult;
  entriesWithFieldDiff: number;
  warnings: string[];
}): string {
  const lines = [
    "## Field Change Frequency",
    "",
    AUDIT_DEPENDENCY_NOTE,
    "",
    `- Environment: ${options.env.name}`,
    `- Table: ${options.table.logicalName}`,
    `- Created After: ${options.timeWindow.createdAfter}`,
    `- Created Before: ${options.timeWindow.createdBefore}`,
    `- Scanned Audit Records: ${options.scan.scannedCount}`,
    `- Audit Entries With Field Diffs: ${options.entriesWithFieldDiff}`,
  ];

  if (options.warnings.length > 0) {
    lines.push("", "### Warnings", ...options.warnings.map((warning) => `- ${warning}`));
  }

  if (options.fields.length === 0) {
    lines.push("", "No changed fields found in the scanned audit rows.");
    return lines.join("\n");
  }

  lines.push(
    "",
    formatTable(
      ["Field", "Display Name", "Changes", "Records", "Users", "Last Changed", "% Diff Entries"],
      options.fields.map((field) => [
        field.logicalName,
        field.displayName,
        String(field.changeCount),
        String(field.recordsChanged),
        String(field.changedByUsers),
        field.lastChangedOn || "-",
        `${field.percentageOfFieldDiffEntries}%`,
      ]),
    ),
  );

  return lines.join("\n");
}

function resolveTimeWindow(createdAfter?: string, createdBefore?: string): TimeWindow {
  const normalizedCreatedBefore =
    normalizeAuditDateTimeInput(createdBefore, "createdBefore") || new Date().toISOString();
  const normalizedCreatedAfter =
    normalizeAuditDateTimeInput(createdAfter, "createdAfter") ||
    new Date(
      new Date(normalizedCreatedBefore).getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

  return {
    createdAfter: normalizedCreatedAfter,
    createdBefore: normalizedCreatedBefore,
  };
}

function classifyActor(userName: string, callingUserName: string | null): ActorKind {
  const label = `${userName || ""} ${callingUserName || ""}`.trim().toLowerCase();
  if (!label || label === "-") {
    return "unknown";
  }

  if (
    label.includes("system") ||
    label.includes("application") ||
    label.includes("service") ||
    label.includes("integration")
  ) {
    return "automation";
  }

  return "human";
}

function earlierDate(current: string | null, candidate: string): string | null {
  if (!candidate) {
    return current;
  }
  if (!current || candidate < current) {
    return candidate;
  }
  return current;
}

function laterDate(current: string | null, candidate: string): string | null {
  if (!candidate) {
    return current;
  }
  if (!current || candidate > current) {
    return candidate;
  }
  return current;
}
