import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient, ODataPageResult } from "../../client/dynamics-client.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import {
  summarizeSystemJobsQuery,
  type SystemJobStatus,
  type SystemJobType,
} from "../../queries/system-job-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { normalizeDateTimeInput, normalizeSystemJob } from "./system-job-metadata.js";

const DEFAULT_MAX_RECORDS = 1000;
const MAX_RECORDS = 5000;
const PAGE_SIZE = 200;
const DEFAULT_BUCKET_MINUTES = 60;
const MAX_BUCKETS = 500;
const DEFAULT_TOP_MESSAGES = 5;
const MAX_TOP_MESSAGES = 20;
const TEXT_GROUP_LIMIT = 25;
const TEXT_BUCKET_LIMIT = 24;
const TOP_SLOWEST_JOBS_LIMIT = 10;

const summarizeSystemJobsSchema = {
  environment: z.string().optional().describe("Environment name"),
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
  jobType: z
    .enum(["workflow", "plugin", "bulkdelete", "import"])
    .optional()
    .describe("Optional job type filter"),
  status: z
    .enum(["waiting", "inprogress", "succeeded", "failed", "canceled", "suspended"])
    .optional()
    .describe("Optional status filter"),
  groupBy: z
    .enum(["category", "operation", "name"])
    .optional()
    .describe("Optional grouping mode. Defaults to category."),
  bucketMinutes: z
    .number()
    .int()
    .min(5)
    .max(1440)
    .optional()
    .describe(`Optional queue bucket size in minutes. Defaults to ${DEFAULT_BUCKET_MINUTES}.`),
  maxRecords: z
    .number()
    .int()
    .min(1)
    .max(MAX_RECORDS)
    .optional()
    .describe(`Optional maximum system jobs to scan. Defaults to ${DEFAULT_MAX_RECORDS}.`),
  topMessages: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_MESSAGES)
    .optional()
    .describe(`Optional failure message count. Defaults to ${DEFAULT_TOP_MESSAGES}.`),
};

type SummarizeSystemJobsParams = ToolParams<typeof summarizeSystemJobsSchema>;
type GroupBy = "category" | "operation" | "name";
type StatusKey = "waiting" | "inProgress" | "succeeded" | "failed" | "canceled" | "suspended";

interface StatusCounts {
  waiting: number;
  inProgress: number;
  succeeded: number;
  failed: number;
  canceled: number;
  suspended: number;
}

interface DurationStats {
  sampleCount: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

interface SystemJobSummaryRecord {
  asyncOperationId: string;
  name: string;
  category: string;
  operationLabel: string;
  statusLabel: string;
  createdOn: string;
  startedOn: string;
  completedOn: string;
  statusKey: StatusKey;
  createdMs: number | null;
  startedMs: number | null;
  completedMs: number | null;
  runtimeMs: number | null;
  waitMs: number | null;
  problemMessage: string | null;
}

interface GroupAccumulator {
  key: string;
  label: string;
  count: number;
  statusCounts: StatusCounts;
  runtimesMs: number[];
  waitsMs: number[];
  messages: Map<string, number>;
}

interface SystemJobSummaryGroup {
  key: string;
  label: string;
  count: number;
  statusCounts: StatusCounts;
  failureRatePercent: number;
  cancelRatePercent: number;
  runtime: DurationStats;
  wait: DurationStats;
  topMessages: MessageSummary[];
}

interface MessageSummary {
  message: string;
  count: number;
}

interface QueueBucket {
  start: string;
  end: string;
  createdCount: number;
  completedCount: number;
  failedCount: number;
  canceledCount: number;
  estimatedOpenCount: number;
}

interface SlowSystemJob {
  asyncOperationId: string;
  name: string;
  category: string;
  operationLabel: string;
  statusLabel: string;
  createdOn: string;
  startedOn: string;
  completedOn: string;
  runtimeMs: number;
  runtimeSeconds: number;
}

export async function handleSummarizeSystemJobs(
  {
    environment,
    createdAfter,
    createdBefore,
    jobType,
    status,
    groupBy,
    bucketMinutes,
    maxRecords,
    topMessages,
  }: SummarizeSystemJobsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const timeWindow = resolveTimeWindow(createdAfter, createdBefore);
    const resolvedGroupBy = groupBy || "category";
    const resolvedBucketMinutes = bucketMinutes ?? DEFAULT_BUCKET_MINUTES;
    const resolvedMaxRecords = maxRecords ?? DEFAULT_MAX_RECORDS;
    const resolvedTopMessages = topMessages ?? DEFAULT_TOP_MESSAGES;

    const bucketCount = Math.ceil(
      (new Date(timeWindow.createdBefore).getTime() - new Date(timeWindow.createdAfter).getTime()) /
        (resolvedBucketMinutes * 60 * 1000),
    );
    if (bucketCount > MAX_BUCKETS) {
      throw new Error(
        `The selected time window creates ${bucketCount} queue buckets. Increase bucketMinutes to keep it at ${MAX_BUCKETS} or less.`,
      );
    }

    const pageResult = await fetchSystemJobRecords(env, client, {
      createdAfter: timeWindow.createdAfter,
      createdBefore: timeWindow.createdBefore,
      status: status as SystemJobStatus | undefined,
      jobType: jobType as SystemJobType | undefined,
      maxRecords: resolvedMaxRecords,
    });
    const records = pageResult.items.map(normalizeSummaryRecord);
    const statusCounts = countStatuses(records);
    const runtimeStats = buildDurationStats(records.map((record) => record.runtimeMs));
    const waitStats = buildDurationStats(records.map((record) => record.waitMs));
    const groups = buildSummaryGroups(records, resolvedGroupBy, resolvedTopMessages);
    const topSlowestJobs = getTopSlowestJobs(records, TOP_SLOWEST_JOBS_LIMIT);
    const queueBuckets = buildQueueBuckets(records, {
      createdAfter: timeWindow.createdAfter,
      createdBefore: timeWindow.createdBefore,
      bucketMinutes: resolvedBucketMinutes,
    });
    const topProblemMessages = getTopMessages(
      records.map((record) => record.problemMessage),
      resolvedTopMessages,
    );

    const responseData = {
      environment: env.name,
      filters: {
        createdAfter: timeWindow.createdAfter,
        createdBefore: timeWindow.createdBefore,
        jobType: jobType || null,
        status: status || null,
      },
      groupBy: resolvedGroupBy,
      bucketMinutes: resolvedBucketMinutes,
      maxRecords: resolvedMaxRecords,
      scannedCount: records.length,
      totalCount: pageResult.totalCount,
      hasMore: pageResult.hasMore,
      statusCounts,
      failureRatePercent: records.length
        ? roundNumber((statusCounts.failed / records.length) * 100)
        : 0,
      cancelRatePercent: records.length
        ? roundNumber((statusCounts.canceled / records.length) * 100)
        : 0,
      runtime: runtimeStats,
      wait: waitStats,
      topMessages: topProblemMessages,
      topSlowestJobs,
      groupCount: groups.length,
      groups,
      queueBuckets,
      queueDepthNote:
        "estimatedOpenCount is based only on the retained system jobs scanned by this tool.",
    };

    if (records.length === 0) {
      const text = `No system jobs found in '${env.name}' for the selected time window.`;
      return createToolSuccessResponse("summarize_system_jobs", text, text, responseData);
    }

    const totalText =
      typeof pageResult.totalCount === "number" ? ` of ${pageResult.totalCount}` : "";
    const moreRecordsText = pageResult.hasMore
      ? `Scanned ${records.length}${totalText} system job(s) and stopped because maxRecords was reached.`
      : `Scanned ${records.length} system job(s).`;
    const tableGroups = groups.slice(0, TEXT_GROUP_LIMIT);
    const groupRows = tableGroups.map((group) => [
      group.label,
      String(group.count),
      String(group.statusCounts.succeeded),
      String(group.statusCounts.failed),
      String(group.statusCounts.canceled),
      formatPercent(group.failureRatePercent),
      formatDuration(group.runtime.averageMs),
      formatDuration(group.runtime.p95Ms),
      group.topMessages[0]?.message || "-",
    ]);
    const bucketRows = queueBuckets
      .slice(-TEXT_BUCKET_LIMIT)
      .map((bucket) => [
        bucket.start.slice(0, 16).replace("T", " "),
        String(bucket.createdCount),
        String(bucket.completedCount),
        String(bucket.failedCount),
        String(bucket.canceledCount),
        String(bucket.estimatedOpenCount),
      ]);
    const moreGroupsText =
      groups.length > TEXT_GROUP_LIMIT ? ` Showing top ${TEXT_GROUP_LIMIT} groups.` : "";
    const moreBucketsText =
      queueBuckets.length > TEXT_BUCKET_LIMIT
        ? ` Showing the most recent ${TEXT_BUCKET_LIMIT} queue buckets.`
        : "";

    const text = `## System Job Summary in '${env.name}'\n\n${moreRecordsText}${moreGroupsText}\n\n- Created After: ${
      timeWindow.createdAfter
    }\n- Created Before: ${timeWindow.createdBefore}\n- Job Type: ${
      jobType || "Any"
    }\n- Status: ${status || "Any"}\n- Group By: ${formatGroupBy(
      resolvedGroupBy,
    )}\n- Counts: ${records.length} total, ${statusCounts.succeeded} succeeded, ${
      statusCounts.failed
    } failed, ${statusCounts.canceled} canceled, ${
      statusCounts.inProgress
    } in progress, ${statusCounts.waiting} waiting, ${
      statusCounts.suspended
    } suspended\n- Runtime: avg ${formatDuration(runtimeStats.averageMs)}, p95 ${formatDuration(
      runtimeStats.p95Ms,
    )}, max ${formatDuration(runtimeStats.maxMs)}\n\n${formatTable(
      ["Group", "Count", "OK", "Failed", "Canceled", "Fail %", "Avg", "p95", "Top message"],
      groupRows,
    )}\n\n### Slowest Jobs\n\n${formatTable(
      ["Runtime", "Created", "Name", "Category", "Operation", "Status", "Job Id"],
      topSlowestJobs.map((job) => [
        formatDuration(job.runtimeMs),
        job.createdOn.slice(0, 19).replace("T", " "),
        job.name || "(no name)",
        job.category,
        job.operationLabel,
        job.statusLabel,
        job.asyncOperationId,
      ]),
    )}\n\n### Estimated Queue Buckets\n\n${formatTable(
      ["Bucket", "Created", "Completed", "Failed", "Canceled", "Open"],
      bucketRows,
    )}\n\n${moreBucketsText} Estimated open counts use only scanned retained system jobs.`;

    return createToolSuccessResponse(
      "summarize_system_jobs",
      text,
      `Summarized ${records.length} system job(s) in '${env.name}'.`,
      responseData,
    );
  } catch (error) {
    return createToolErrorResponse("summarize_system_jobs", error);
  }
}

export const summarizeSystemJobsTool = defineTool({
  name: "summarize_system_jobs",
  description:
    "Summarize Dataverse system jobs over a time window with status counts, runtime stats, grouped failures, and estimated queue depth.",
  schema: summarizeSystemJobsSchema,
  handler: handleSummarizeSystemJobs,
});

export function registerSummarizeSystemJobs(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, summarizeSystemJobsTool, { config, client });
}

async function fetchSystemJobRecords(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: {
    createdAfter: string;
    createdBefore: string;
    status?: SystemJobStatus;
    jobType?: SystemJobType;
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
      "asyncoperations",
      summarizeSystemJobsQuery({
        createdAfter: options.createdAfter,
        createdBefore: options.createdBefore,
        status: options.status,
        jobType: options.jobType,
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

  return {
    items,
    totalCount,
    hasMore:
      Boolean(nextLink) ||
      (typeof totalCount === "number" &&
        totalCount > items.length &&
        items.length >= options.maxRecords),
  };
}

function normalizeSummaryRecord(record: Record<string, unknown>): SystemJobSummaryRecord {
  const job = normalizeSystemJob(record);
  const createdMs = parseDateMs(job.createdOn);
  const startedMs = parseDateMs(job.startedOn);
  const completedMs = parseDateMs(job.completedOn);
  const statusKey = getStatusKey(job.state, job.status);

  return {
    asyncOperationId: job.asyncOperationId,
    name: job.name,
    category: job.category,
    operationLabel: job.operationLabel,
    statusLabel: job.statusLabel,
    createdOn: job.createdOn,
    startedOn: job.startedOn,
    completedOn: job.completedOn,
    statusKey,
    createdMs,
    startedMs,
    completedMs,
    runtimeMs: getRuntimeMs(job.executionTimeSpan, startedMs, completedMs),
    waitMs:
      createdMs !== null && startedMs !== null && startedMs >= createdMs
        ? startedMs - createdMs
        : null,
    problemMessage: isProblemStatus(statusKey) ? normalizeMessage(job.effectiveMessage) : null,
  };
}

function buildSummaryGroups(
  records: SystemJobSummaryRecord[],
  groupBy: GroupBy,
  topMessages: number,
): SystemJobSummaryGroup[] {
  const groups = new Map<string, GroupAccumulator>();

  for (const record of records) {
    const { key, label } = getGroup(record, groupBy);
    const group = groups.get(key) || createGroupAccumulator(key, label);

    group.count += 1;
    group.statusCounts[record.statusKey] += 1;
    if (record.runtimeMs !== null) {
      group.runtimesMs.push(record.runtimeMs);
    }
    if (record.waitMs !== null) {
      group.waitsMs.push(record.waitMs);
    }
    if (record.problemMessage) {
      group.messages.set(
        record.problemMessage,
        (group.messages.get(record.problemMessage) || 0) + 1,
      );
    }

    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => finalizeGroup(group, topMessages))
    .sort(compareSummaryGroups);
}

function createGroupAccumulator(key: string, label: string): GroupAccumulator {
  return {
    key,
    label,
    count: 0,
    statusCounts: createStatusCounts(),
    runtimesMs: [],
    waitsMs: [],
    messages: new Map(),
  };
}

function finalizeGroup(group: GroupAccumulator, topMessages: number): SystemJobSummaryGroup {
  return {
    key: group.key,
    label: group.label,
    count: group.count,
    statusCounts: group.statusCounts,
    failureRatePercent: roundNumber((group.statusCounts.failed / group.count) * 100),
    cancelRatePercent: roundNumber((group.statusCounts.canceled / group.count) * 100),
    runtime: buildDurationStats(group.runtimesMs),
    wait: buildDurationStats(group.waitsMs),
    topMessages: getTopMessages([...group.messages.entries()], topMessages),
  };
}

function compareSummaryGroups(left: SystemJobSummaryGroup, right: SystemJobSummaryGroup): number {
  return (
    right.statusCounts.failed +
      right.statusCounts.canceled -
      (left.statusCounts.failed + left.statusCounts.canceled) ||
    (right.runtime.p95Ms ?? -1) - (left.runtime.p95Ms ?? -1) ||
    right.count - left.count ||
    left.label.localeCompare(right.label)
  );
}

function buildQueueBuckets(
  records: SystemJobSummaryRecord[],
  options: { createdAfter: string; createdBefore: string; bucketMinutes: number },
): QueueBucket[] {
  const startMs = new Date(options.createdAfter).getTime();
  const endMs = new Date(options.createdBefore).getTime();
  const bucketMs = options.bucketMinutes * 60 * 1000;
  const buckets: QueueBucket[] = [];

  for (let bucketStart = startMs; bucketStart < endMs; bucketStart += bucketMs) {
    const bucketEnd = Math.min(bucketStart + bucketMs, endMs);
    const bucket: QueueBucket = {
      start: new Date(bucketStart).toISOString(),
      end: new Date(bucketEnd).toISOString(),
      createdCount: 0,
      completedCount: 0,
      failedCount: 0,
      canceledCount: 0,
      estimatedOpenCount: 0,
    };

    for (const record of records) {
      if (isInBucket(record.createdMs, bucketStart, bucketEnd, bucketEnd === endMs)) {
        bucket.createdCount += 1;
      }
      if (isInBucket(record.completedMs, bucketStart, bucketEnd, bucketEnd === endMs)) {
        bucket.completedCount += 1;
        if (record.statusKey === "failed") {
          bucket.failedCount += 1;
        }
        if (record.statusKey === "canceled") {
          bucket.canceledCount += 1;
        }
      }
      if (
        record.createdMs !== null &&
        record.createdMs <= bucketEnd &&
        (record.completedMs === null || record.completedMs > bucketEnd)
      ) {
        bucket.estimatedOpenCount += 1;
      }
    }

    buckets.push(bucket);
  }

  return buckets;
}

function getTopSlowestJobs(records: SystemJobSummaryRecord[], limit: number): SlowSystemJob[] {
  return records
    .filter((record): record is SystemJobSummaryRecord & { runtimeMs: number } => {
      return record.runtimeMs !== null;
    })
    .sort(
      (left, right) =>
        right.runtimeMs - left.runtimeMs ||
        right.createdOn.localeCompare(left.createdOn) ||
        left.asyncOperationId.localeCompare(right.asyncOperationId),
    )
    .slice(0, limit)
    .map((record) => ({
      asyncOperationId: record.asyncOperationId,
      name: record.name,
      category: record.category,
      operationLabel: record.operationLabel,
      statusLabel: record.statusLabel,
      createdOn: record.createdOn,
      startedOn: record.startedOn,
      completedOn: record.completedOn,
      runtimeMs: record.runtimeMs,
      runtimeSeconds: roundNumber(record.runtimeMs / 1000),
    }));
}

function countStatuses(records: SystemJobSummaryRecord[]): StatusCounts {
  const counts = createStatusCounts();
  for (const record of records) {
    counts[record.statusKey] += 1;
  }
  return counts;
}

function createStatusCounts(): StatusCounts {
  return {
    waiting: 0,
    inProgress: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
    suspended: 0,
  };
}

function getStatusKey(state: number | null, status: number | null): StatusKey {
  if (state === 1) {
    return "suspended";
  }

  switch (status) {
    case 0:
    case 10:
      return "waiting";
    case 20:
    case 21:
    case 22:
      return "inProgress";
    case 30:
      return "succeeded";
    case 31:
      return "failed";
    case 32:
      return "canceled";
    default:
      return "waiting";
  }
}

function getGroup(
  record: SystemJobSummaryRecord,
  groupBy: GroupBy,
): { key: string; label: string } {
  if (groupBy === "operation") {
    return { key: record.operationLabel, label: record.operationLabel };
  }

  if (groupBy === "name") {
    const label = record.name || "(no name)";
    return { key: label, label };
  }

  return { key: record.category, label: record.category };
}

function buildDurationStats(values: Array<number | null>): DurationStats {
  const sortedValues = values
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const sum = sortedValues.reduce((total, value) => total + value, 0);

  return {
    sampleCount: sortedValues.length,
    averageMs: sortedValues.length > 0 ? roundNumber(sum / sortedValues.length) : null,
    p50Ms: percentile(sortedValues, 50),
    p95Ms: percentile(sortedValues, 95),
    maxMs: sortedValues.length > 0 ? sortedValues[sortedValues.length - 1] : null,
  };
}

function getTopMessages(
  values: Array<string | null> | Array<[string, number]>,
  limit: number,
): MessageSummary[] {
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

function isInBucket(
  value: number | null,
  bucketStart: number,
  bucketEnd: number,
  isLastBucket: boolean,
): boolean {
  if (value === null || value < bucketStart) {
    return false;
  }

  return isLastBucket ? value <= bucketEnd : value < bucketEnd;
}

function isProblemStatus(status: StatusKey): boolean {
  return status === "failed" || status === "canceled";
}

function parseDateMs(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getRuntimeMs(
  executionTimeSpanSeconds: number | null,
  startedMs: number | null,
  completedMs: number | null,
): number | null {
  if (executionTimeSpanSeconds !== null) {
    return roundNumber(executionTimeSpanSeconds * 1000);
  }

  return startedMs !== null && completedMs !== null && completedMs >= startedMs
    ? completedMs - startedMs
    : null;
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

function normalizeMessage(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const line =
    value
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part.length > 0 && !part.startsWith("at ")) || value;
  const normalized = line.replace(/\s+/g, " ");

  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "-";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  return `${roundNumber(value / 1000)} s`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

function formatGroupBy(groupBy: GroupBy): string {
  switch (groupBy) {
    case "operation":
      return "Operation";
    case "name":
      return "Name";
    default:
      return "Category";
  }
}
