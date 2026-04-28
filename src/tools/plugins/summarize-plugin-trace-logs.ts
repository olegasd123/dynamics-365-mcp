import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient, ODataPageResult } from "../../client/dynamics-client.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import {
  listPluginStepsByIdsQuery,
  summarizePluginTraceLogsQuery,
} from "../../queries/plugin-queries.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchPluginMetadata, resolvePluginClass } from "./plugin-class-metadata.js";

const DEFAULT_MAX_RECORDS = 1000;
const MAX_RECORDS = 5000;
const PAGE_SIZE = 200;
const DEFAULT_TOP_EXCEPTIONS = 5;
const MAX_TOP_EXCEPTIONS = 20;
const TEXT_GROUP_LIMIT = 25;

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
  50: "Post-Commit",
};

const summarizePluginTraceLogsSchema = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z
    .string()
    .optional()
    .describe("Optional plugin class name, full type name, or plugin type id"),
  assemblyName: z
    .string()
    .optional()
    .describe("Optional plugin assembly name or id to narrow pluginName matches"),
  createdAfter: z
    .string()
    .optional()
    .describe(
      "Optional start time in ISO format like 2026-04-20T08:00:00Z. Defaults to 24 hours before createdBefore or now.",
    ),
  createdBefore: z
    .string()
    .optional()
    .describe("Optional end time in ISO format like 2026-04-20T09:00:00Z. Defaults to now."),
  groupBy: z
    .enum(["plugin", "plugin_step"])
    .optional()
    .describe("Optional grouping mode. Defaults to plugin_step."),
  maxRecords: z
    .number()
    .int()
    .min(1)
    .max(MAX_RECORDS)
    .optional()
    .describe(`Optional maximum trace records to scan. Defaults to ${DEFAULT_MAX_RECORDS}.`),
  topExceptions: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_EXCEPTIONS)
    .optional()
    .describe(
      `Optional exception signature count per group. Defaults to ${DEFAULT_TOP_EXCEPTIONS}.`,
    ),
};

type SummarizePluginTraceLogsParams = ToolParams<typeof summarizePluginTraceLogsSchema>;
type GroupBy = "plugin" | "plugin_step";

interface TraceRecord {
  typeName: string;
  pluginName: string;
  messageName: string;
  primaryEntity: string;
  mode: number | null;
  modeLabel: string;
  executionDurationMs: number | null;
  exceptionSignature: string | null;
  pluginStepId: string | null;
}

interface StepMetadata {
  name: string;
  messageName: string;
  primaryEntity: string;
  stage: number | null;
  stageLabel: string;
  mode: number | null;
  modeLabel: string;
  rank: number | null;
}

interface GroupAccumulator {
  key: string;
  pluginTypeName: string;
  pluginName: string;
  pluginStepId: string | null;
  fallbackStepLabel: string | null;
  count: number;
  failureCount: number;
  durations: number[];
  exceptions: Map<string, number>;
}

interface ExceptionSummary {
  message: string;
  count: number;
}

interface TraceSummaryGroup {
  key: string;
  pluginTypeName: string;
  pluginName: string;
  pluginStepId: string | null;
  stepName: string | null;
  messageName: string | null;
  primaryEntity: string | null;
  stage: number | null;
  stageLabel: string | null;
  mode: number | null;
  modeLabel: string | null;
  rank: number | null;
  count: number;
  failureCount: number;
  failureRatePercent: number;
  durationSampleCount: number;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  maxDurationMs: number | null;
  topExceptions: ExceptionSummary[];
}

export async function handleSummarizePluginTraceLogs(
  {
    environment,
    pluginName,
    assemblyName,
    createdAfter,
    createdBefore,
    groupBy,
    maxRecords,
    topExceptions,
  }: SummarizePluginTraceLogsParams,
  { config, client }: ToolContext,
) {
  try {
    if (assemblyName && !pluginName) {
      throw new Error("assemblyName can only be used together with pluginName.");
    }

    const env = getEnvironment(config, environment);
    const timeWindow = resolveTimeWindow(createdAfter, createdBefore);
    const resolvedGroupBy = groupBy || "plugin_step";
    const resolvedMaxRecords = maxRecords ?? DEFAULT_MAX_RECORDS;
    const resolvedTopExceptions = topExceptions ?? DEFAULT_TOP_EXCEPTIONS;

    const resolvedPlugin = pluginName
      ? resolvePluginClass(
          (
            await fetchPluginMetadata(env, client, {
              includeSteps: false,
              includeImages: false,
            })
          ).pluginClasses,
          pluginName,
          assemblyName,
        )
      : null;

    const pageResult = await fetchTraceRecords(env, client, {
      pluginTypeName: resolvedPlugin?.fullName,
      createdAfter: timeWindow.createdAfter,
      createdBefore: timeWindow.createdBefore,
      maxRecords: resolvedMaxRecords,
    });
    const traceRecords = pageResult.items.map(normalizeTraceRecord);
    const stepMetadataById =
      resolvedGroupBy === "plugin_step"
        ? await fetchStepMetadataById(env, client, collectStepIds(traceRecords))
        : new Map<string, StepMetadata>();
    const groups = buildSummaryGroups(
      traceRecords,
      stepMetadataById,
      resolvedGroupBy,
      resolvedTopExceptions,
    );
    const topExceptionMessages = getTopExceptions(
      traceRecords.map((record) => record.exceptionSignature),
      resolvedTopExceptions,
    );

    const responseData = {
      environment: env.name,
      plugin:
        resolvedPlugin === null
          ? null
          : {
              pluginTypeId: resolvedPlugin.pluginTypeId,
              name: resolvedPlugin.name,
              fullName: resolvedPlugin.fullName,
              assemblyName: resolvedPlugin.assemblyName,
            },
      filters: {
        pluginName: resolvedPlugin?.fullName || null,
        createdAfter: timeWindow.createdAfter,
        createdBefore: timeWindow.createdBefore,
      },
      groupBy: resolvedGroupBy,
      maxRecords: resolvedMaxRecords,
      scannedCount: traceRecords.length,
      totalCount: pageResult.totalCount,
      hasMore: pageResult.hasMore,
      topExceptions: resolvedTopExceptions,
      groupCount: groups.length,
      groups,
      topExceptionMessages,
    };

    if (traceRecords.length === 0) {
      const text = `No plugin trace logs found in '${env.name}' for the selected time window.`;
      return createToolSuccessResponse("summarize_plugin_trace_logs", text, text, responseData);
    }

    const tableGroups = groups.slice(0, TEXT_GROUP_LIMIT);
    const rows = tableGroups.map((group) => [
      formatGroupLabel(group),
      String(group.count),
      formatPercent(group.failureRatePercent),
      formatNullableNumber(group.p50DurationMs),
      formatNullableNumber(group.p95DurationMs),
      formatNullableNumber(group.maxDurationMs),
      group.topExceptions[0]?.message || "-",
    ]);
    const moreGroupsText =
      groups.length > TEXT_GROUP_LIMIT
        ? ` Showing top ${TEXT_GROUP_LIMIT} of ${groups.length} groups.`
        : "";
    const totalText =
      typeof pageResult.totalCount === "number" ? ` of ${pageResult.totalCount}` : "";
    const moreRecordsText = pageResult.hasMore
      ? ` Scanned ${traceRecords.length}${totalText} trace logs and stopped because maxRecords was reached.`
      : ` Scanned ${traceRecords.length} trace log(s).`;
    const text = `## Plugin Trace Log Summary in '${env.name}'\n\n${moreRecordsText}${moreGroupsText}\n\n- Plugin: ${
      resolvedPlugin?.fullName || "Any"
    }\n- Created After: ${timeWindow.createdAfter}\n- Created Before: ${
      timeWindow.createdBefore
    }\n- Group By: ${formatGroupBy(resolvedGroupBy)}\n\n${formatTable(
      ["Plugin / Step", "Count", "Fail %", "p50 ms", "p95 ms", "Max ms", "Top exception"],
      rows,
    )}`;

    return createToolSuccessResponse(
      "summarize_plugin_trace_logs",
      text,
      `Summarized ${traceRecords.length} plugin trace log(s) in '${env.name}'.`,
      responseData,
    );
  } catch (error) {
    return createToolErrorResponse("summarize_plugin_trace_logs", error);
  }
}

export const summarizePluginTraceLogsTool = defineTool({
  name: "summarize_plugin_trace_logs",
  description:
    "Summarize Dataverse plug-in trace logs over a time window with counts, duration percentiles, failure rate, and top exception messages.",
  schema: summarizePluginTraceLogsSchema,
  handler: handleSummarizePluginTraceLogs,
});

export function registerSummarizePluginTraceLogs(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, summarizePluginTraceLogsTool, { config, client });
}

async function fetchTraceRecords(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: {
    pluginTypeName?: string;
    createdAfter: string;
    createdBefore: string;
    maxRecords: number;
  },
): Promise<{
  items: Record<string, unknown>[];
  totalCount: number | null;
  hasMore: boolean;
}> {
  const items: Record<string, unknown>[] = [];
  let nextLink: string | null = null;
  let totalCount: number | null = null;

  while (items.length < options.maxRecords) {
    const remaining = options.maxRecords - items.length;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    const page: ODataPageResult<Record<string, unknown>> = await client.queryPage<
      Record<string, unknown>
    >(
      env,
      "plugintracelogs",
      summarizePluginTraceLogsQuery({
        pluginTypeName: options.pluginTypeName,
        createdAfter: options.createdAfter,
        createdBefore: options.createdBefore,
        top: pageSize,
      }),
      {
        pageLink: nextLink || undefined,
        cacheTier: CACHE_TIERS.VOLATILE,
      },
    );

    items.push(...page.items);
    totalCount = totalCount ?? page.totalCount;
    nextLink = page.nextLink;

    if (!nextLink || page.items.length === 0) {
      break;
    }
  }

  const hasMore =
    Boolean(nextLink) ||
    (typeof totalCount === "number" &&
      totalCount > items.length &&
      items.length >= options.maxRecords);

  return {
    items,
    totalCount,
    hasMore,
  };
}

async function fetchStepMetadataById(
  env: EnvironmentConfig,
  client: DynamicsClient,
  stepIds: string[],
): Promise<Map<string, StepMetadata>> {
  if (stepIds.length === 0) {
    return new Map();
  }

  const rows = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "sdkmessageprocessingsteps",
    stepIds,
    "sdkmessageprocessingstepid",
    listPluginStepsByIdsQuery,
  );

  return new Map(
    rows.map((row) => [String(row.sdkmessageprocessingstepid || ""), normalizeStep(row)]),
  );
}

function buildSummaryGroups(
  records: TraceRecord[],
  stepMetadataById: Map<string, StepMetadata>,
  groupBy: GroupBy,
  topExceptions: number,
): TraceSummaryGroup[] {
  const groups = new Map<string, GroupAccumulator>();

  for (const record of records) {
    const key = getGroupKey(record, groupBy);
    const group =
      groups.get(key) ||
      createGroupAccumulator(
        key,
        record,
        groupBy === "plugin_step" ? getFallbackStepLabel(record) : null,
      );

    group.count += 1;
    if (record.executionDurationMs !== null) {
      group.durations.push(record.executionDurationMs);
    }
    if (record.exceptionSignature) {
      group.failureCount += 1;
      group.exceptions.set(
        record.exceptionSignature,
        (group.exceptions.get(record.exceptionSignature) || 0) + 1,
      );
    }

    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) =>
      finalizeGroup(group, stepMetadataById.get(group.pluginStepId || ""), topExceptions),
    )
    .sort(compareSummaryGroups);
}

function createGroupAccumulator(
  key: string,
  record: TraceRecord,
  fallbackStepLabel: string | null,
): GroupAccumulator {
  return {
    key,
    pluginTypeName: record.typeName,
    pluginName: record.pluginName,
    pluginStepId: record.pluginStepId,
    fallbackStepLabel,
    count: 0,
    failureCount: 0,
    durations: [],
    exceptions: new Map(),
  };
}

function finalizeGroup(
  group: GroupAccumulator,
  step: StepMetadata | undefined,
  topExceptions: number,
): TraceSummaryGroup {
  const sortedDurations = [...group.durations].sort((left, right) => left - right);

  return {
    key: group.key,
    pluginTypeName: group.pluginTypeName,
    pluginName: group.pluginName,
    pluginStepId: group.pluginStepId,
    stepName: step?.name || group.fallbackStepLabel,
    messageName: step?.messageName || null,
    primaryEntity: step?.primaryEntity || null,
    stage: step?.stage ?? null,
    stageLabel: step?.stageLabel || null,
    mode: step?.mode ?? null,
    modeLabel: step?.modeLabel || null,
    rank: step?.rank ?? null,
    count: group.count,
    failureCount: group.failureCount,
    failureRatePercent: roundNumber((group.failureCount / group.count) * 100),
    durationSampleCount: sortedDurations.length,
    p50DurationMs: percentile(sortedDurations, 50),
    p95DurationMs: percentile(sortedDurations, 95),
    maxDurationMs: sortedDurations.length > 0 ? sortedDurations[sortedDurations.length - 1] : null,
    topExceptions: getTopExceptions([...group.exceptions.entries()], topExceptions),
  };
}

function compareSummaryGroups(left: TraceSummaryGroup, right: TraceSummaryGroup): number {
  return (
    right.failureCount - left.failureCount ||
    (right.p95DurationMs ?? -1) - (left.p95DurationMs ?? -1) ||
    right.count - left.count ||
    formatGroupLabel(left).localeCompare(formatGroupLabel(right))
  );
}

function normalizeTraceRecord(record: Record<string, unknown>): TraceRecord {
  const typeName = String(record.typename || "");
  const pluginName = typeName.split(".").pop() || typeName || "(unknown)";
  const mode = getNumber(record.mode);

  return {
    typeName,
    pluginName,
    messageName: String(record.messagename || ""),
    primaryEntity: String(record.primaryentity || ""),
    mode,
    modeLabel: mode === null ? "-" : (MODE_LABELS[mode] ?? String(mode)),
    executionDurationMs: getNumber(record.performanceexecutionduration),
    exceptionSignature: normalizeExceptionSignature(record.exceptiondetails),
    pluginStepId: normalizeOptionalString(record.pluginstepid),
  };
}

function normalizeStep(record: Record<string, unknown>): StepMetadata {
  const message = getRecord(record.sdkmessageid);
  const filter = getRecord(record.sdkmessagefilterid);
  const stage = getNumber(record.stage);
  const mode = getNumber(record.mode);

  return {
    name: String(record.name || ""),
    messageName: String(message?.name || ""),
    primaryEntity: String(filter?.primaryobjecttypecode || ""),
    stage,
    stageLabel: stage === null ? "-" : (STAGE_LABELS[stage] ?? String(stage)),
    mode,
    modeLabel: mode === null ? "-" : (MODE_LABELS[mode] ?? String(mode)),
    rank: getNumber(record.rank),
  };
}

function getGroupKey(record: TraceRecord, groupBy: GroupBy): string {
  if (groupBy === "plugin") {
    return record.typeName || record.pluginName;
  }

  return record.pluginStepId
    ? `${record.typeName}|${record.pluginStepId}`
    : `${record.typeName}|${record.messageName}|${record.primaryEntity}|${record.mode ?? ""}`;
}

function getFallbackStepLabel(record: TraceRecord): string {
  const parts = [record.messageName || "Unknown message", record.primaryEntity || "none"];
  if (record.modeLabel && record.modeLabel !== "-") {
    parts.push(record.modeLabel);
  }

  return parts.join(" / ");
}

function collectStepIds(records: TraceRecord[]): string[] {
  return [...new Set(records.map((record) => record.pluginStepId).filter(isNonEmptyString))];
}

function getTopExceptions(
  values: Array<string | null> | Array<[string, number]>,
  limit: number,
): ExceptionSummary[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (Array.isArray(value)) {
      counts.set(value[0], (counts.get(value[0]) || 0) + value[1]);
      continue;
    }
    if (value) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((left, right) => right.count - left.count || left.message.localeCompare(right.message))
    .slice(0, limit);
}

function resolveTimeWindow(
  createdAfter: string | undefined,
  createdBefore: string | undefined,
): { createdAfter: string; createdBefore: string } {
  const normalizedBefore =
    normalizeDateTimeInput(createdBefore, "createdBefore") || new Date().toISOString();
  const normalizedAfter =
    normalizeDateTimeInput(createdAfter, "createdAfter") ||
    new Date(new Date(normalizedBefore).getTime() - 24 * 60 * 60 * 1000).toISOString();

  if (normalizedAfter > normalizedBefore) {
    throw new Error("createdAfter must be earlier than or equal to createdBefore.");
  }

  return {
    createdAfter: normalizedAfter,
    createdBefore: normalizedBefore,
  };
}

function normalizeDateTimeInput(value: string | undefined, fieldName: string): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date/time string.`);
  }

  return parsed.toISOString();
}

function normalizeExceptionSignature(value: unknown): string | null {
  const rawText = String(value || "").trim();
  if (!rawText) {
    return null;
  }

  const line =
    rawText
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !part.startsWith("at ")) || rawText;
  const normalized = line.replace(/\s+/g, " ");

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function percentile(sortedValues: number[], percentileValue: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index];
}

function getNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonEmptyString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "-" : String(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatGroupLabel(group: TraceSummaryGroup): string {
  if (group.stepName) {
    return `${group.pluginName} / ${group.stepName}`;
  }

  return group.pluginName;
}

function formatGroupBy(groupBy: GroupBy): string {
  return groupBy === "plugin_step" ? "Plugin step" : "Plugin";
}
