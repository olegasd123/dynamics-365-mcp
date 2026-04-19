import { Buffer } from "node:buffer";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import {
  listSystemJobsQuery,
  type SystemJobStatus,
  type SystemJobType,
} from "../../queries/system-job-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  DEFAULT_LIST_LIMIT,
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import {
  normalizeDateTimeInput,
  normalizeSystemJob,
  type SystemJobCategory,
} from "./system-job-metadata.js";

interface SystemJobCursorPayload {
  nextLink: string;
  totalCount: number;
  environment: string;
  limit: number;
  filters: {
    status: string | null;
    jobType: string | null;
    nameFilter: string | null;
    correlationId: string | null;
    createdAfter: string | null;
    createdBefore: string | null;
    completedAfter: string | null;
    completedBefore: string | null;
    failedOnly: boolean;
  };
}

const listSystemJobsSchema = {
  environment: z.string().optional().describe("Environment name"),
  status: z
    .enum(["waiting", "inprogress", "succeeded", "failed", "canceled", "suspended"])
    .optional()
    .describe("Optional status filter"),
  jobType: z
    .enum(["workflow", "plugin", "bulkdelete", "import"])
    .optional()
    .describe("Optional job type filter"),
  nameFilter: z.string().optional().describe("Optional text match on the system job name"),
  correlationId: z.string().optional().describe("Optional correlation id GUID"),
  createdAfter: z
    .string()
    .optional()
    .describe("Optional created start time in ISO format like 2026-04-20T08:00:00Z"),
  createdBefore: z
    .string()
    .optional()
    .describe("Optional created end time in ISO format like 2026-04-20T09:00:00Z"),
  completedAfter: z
    .string()
    .optional()
    .describe("Optional completed start time in ISO format like 2026-04-20T08:00:00Z"),
  completedBefore: z
    .string()
    .optional()
    .describe("Optional completed end time in ISO format like 2026-04-20T09:00:00Z"),
  failedOnly: z.boolean().optional().describe("Optional filter. Use true to show only failed jobs"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListSystemJobsParams = ToolParams<typeof listSystemJobsSchema>;

export async function handleListSystemJobs(
  {
    environment,
    status,
    jobType,
    nameFilter,
    correlationId,
    createdAfter,
    createdBefore,
    completedAfter,
    completedBefore,
    failedOnly,
    limit,
    cursor,
  }: ListSystemJobsParams,
  { config, client }: ToolContext,
) {
  try {
    if (failedOnly && status && status !== "failed") {
      throw new Error("failedOnly can only be combined with status='failed' or no status.");
    }

    const env = getEnvironment(config, environment);
    const normalizedCreatedAfter = normalizeDateTimeInput(createdAfter, "createdAfter");
    const normalizedCreatedBefore = normalizeDateTimeInput(createdBefore, "createdBefore");
    const normalizedCompletedAfter = normalizeDateTimeInput(completedAfter, "completedAfter");
    const normalizedCompletedBefore = normalizeDateTimeInput(completedBefore, "completedBefore");

    validateRange(normalizedCreatedAfter, normalizedCreatedBefore, "createdAfter", "createdBefore");
    validateRange(
      normalizedCompletedAfter,
      normalizedCompletedBefore,
      "completedAfter",
      "completedBefore",
    );

    const cursorPayload = decodeCursor(cursor);
    const resolvedLimit = resolveCursorLimit(limit, cursorPayload);
    const cursorContext = {
      environment: env.name,
      limit: resolvedLimit,
      filters: {
        status: status || null,
        jobType: jobType || null,
        nameFilter: nameFilter || null,
        correlationId: correlationId || null,
        createdAfter: normalizedCreatedAfter || null,
        createdBefore: normalizedCreatedBefore || null,
        completedAfter: normalizedCompletedAfter || null,
        completedBefore: normalizedCompletedBefore || null,
        failedOnly: failedOnly === true,
      },
    };

    validateCursorContext(cursorPayload, cursorContext);

    const page = await client.queryPage<Record<string, unknown>>(
      env,
      "asyncoperations",
      listSystemJobsQuery({
        status: status as SystemJobStatus | undefined,
        jobType: jobType as SystemJobType | undefined,
        nameFilter,
        correlationId,
        createdAfter: normalizedCreatedAfter || undefined,
        createdBefore: normalizedCreatedBefore || undefined,
        completedAfter: normalizedCompletedAfter || undefined,
        completedBefore: normalizedCompletedBefore || undefined,
        failedOnly: failedOnly === true,
        top: resolvedLimit,
      }),
      {
        pageLink: cursorPayload?.nextLink,
        cacheTier: CACHE_TIERS.VOLATILE,
      },
    );

    const totalCount = page.totalCount ?? cursorPayload?.totalCount ?? page.items.length;
    const nextCursor =
      page.nextLink && totalCount >= 0
        ? encodeCursor({
            ...cursorContext,
            nextLink: page.nextLink,
            totalCount,
          })
        : null;

    const items = page.items.map(normalizeSystemJob);
    const responseData = {
      environment: env.name,
      filters: {
        status: status || null,
        jobType: jobType || null,
        nameFilter: nameFilter || null,
        correlationId: correlationId || null,
        createdAfter: normalizedCreatedAfter || null,
        createdBefore: normalizedCreatedBefore || null,
        completedAfter: normalizedCompletedAfter || null,
        completedBefore: normalizedCompletedBefore || null,
        failedOnly: failedOnly === true,
      },
      limit: resolvedLimit,
      cursor: cursor || null,
      returnedCount: items.length,
      totalCount,
      hasMore: nextCursor !== null,
      nextCursor,
      items,
    };

    if (items.length === 0) {
      const text = `No system jobs found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_system_jobs", text, text, responseData);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: cursor || null,
      returnedCount: items.length,
      totalCount,
      hasMore: nextCursor !== null,
      nextCursor,
      itemLabelSingular: "system job",
      itemLabelPlural: "system jobs",
      narrowHint:
        nextCursor !== null
          ? "Use status, jobType, correlationId, or a tighter date range to narrow the result."
          : undefined,
    });

    const rows = items.map((item) => [
      item.createdOn.slice(0, 19).replace("T", " "),
      item.name || "(no name)",
      item.category,
      item.operationLabel,
      item.statusLabel,
      item.primaryEntityType || "-",
      item.messagePreview || "-",
    ]);

    const filterLines = [
      `- Status: ${status || "Any"}`,
      `- Job Type: ${formatJobTypeFilter(jobType)}`,
      `- Name Filter: ${nameFilter || "Any"}`,
      `- Correlation Id: ${correlationId || "Any"}`,
      `- Failed Only: ${failedOnly === true ? "Yes" : "No"}`,
      `- Created After: ${normalizedCreatedAfter || "Any"}`,
      `- Created Before: ${normalizedCreatedBefore || "Any"}`,
      `- Completed After: ${normalizedCompletedAfter || "Any"}`,
      `- Completed Before: ${normalizedCompletedBefore || "Any"}`,
    ].join("\n");

    const text = `## System Jobs in '${env.name}'\n\n${pageSummary}\n\n${filterLines}\n\n${formatTable(
      ["Created", "Name", "Category", "Operation", "Status", "Entity", "Message"],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_system_jobs",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      responseData,
    );
  } catch (error) {
    return createToolErrorResponse("list_system_jobs", error);
  }
}

function formatJobTypeFilter(jobType: string | undefined): SystemJobCategory | "Any" {
  if (!jobType) {
    return "Any";
  }

  if (jobType === "plugin") {
    return "Plug-in";
  }

  if (jobType === "bulkdelete") {
    return "Bulk Delete";
  }

  return (jobType.charAt(0).toUpperCase() + jobType.slice(1)) as SystemJobCategory;
}

function validateRange(
  start: string | null,
  end: string | null,
  startFieldName: string,
  endFieldName: string,
): void {
  if (start && end && start > end) {
    throw new Error(`${startFieldName} must be earlier than or equal to ${endFieldName}.`);
  }
}

function encodeCursor(payload: SystemJobCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): SystemJobCursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as SystemJobCursorPayload | null;

    if (
      !parsed ||
      typeof parsed.nextLink !== "string" ||
      typeof parsed.totalCount !== "number" ||
      typeof parsed.environment !== "string" ||
      typeof parsed.limit !== "number" ||
      !parsed.filters ||
      typeof parsed.filters !== "object"
    ) {
      throw new Error("Invalid cursor shape");
    }

    return parsed;
  } catch {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }
}

function resolveCursorLimit(
  limit: number | undefined,
  cursorPayload: SystemJobCursorPayload | null,
): number {
  if (!cursorPayload) {
    return limit ?? DEFAULT_LIST_LIMIT;
  }

  if (limit !== undefined && limit !== cursorPayload.limit) {
    throw new Error("This cursor belongs to a different paging limit.");
  }

  return cursorPayload.limit;
}

function validateCursorContext(
  cursorPayload: SystemJobCursorPayload | null,
  context: Omit<SystemJobCursorPayload, "nextLink" | "totalCount">,
): void {
  if (!cursorPayload) {
    return;
  }

  if (cursorPayload.environment !== context.environment) {
    throw new Error("This cursor belongs to a different environment.");
  }

  if (JSON.stringify(cursorPayload.filters) !== JSON.stringify(context.filters)) {
    throw new Error("This cursor belongs to a different set of system job filters.");
  }
}

export const listSystemJobsTool = defineTool({
  name: "list_system_jobs",
  description:
    "List Dataverse system jobs with filters for runtime status, job type, time range, and failures.",
  schema: listSystemJobsSchema,
  handler: handleListSystemJobs,
});

export function registerListSystemJobs(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listSystemJobsTool, { config, client });
}
