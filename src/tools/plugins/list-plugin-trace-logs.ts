import { Buffer } from "node:buffer";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { listPluginTraceLogsQuery } from "../../queries/plugin-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { fetchPluginMetadata, resolvePluginClass } from "./plugin-class-metadata.js";

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

interface PluginTraceLogCursorPayload {
  nextLink: string;
  totalCount: number;
  environment: string;
  limit: number;
  filters: {
    pluginTypeName: string | null;
    correlationId: string | null;
    createdAfter: string | null;
    createdBefore: string | null;
    hasException: boolean;
  };
}

const listPluginTraceLogsSchema = {
  environment: z.string().optional().describe("Environment name"),
  pluginName: z
    .string()
    .optional()
    .describe("Optional plugin class name, full type name, or plugin type id"),
  assemblyName: z
    .string()
    .optional()
    .describe("Optional plugin assembly name or id to narrow pluginName matches"),
  correlationId: z.string().optional().describe("Optional correlation id GUID"),
  createdAfter: z
    .string()
    .optional()
    .describe("Optional start time in ISO format like 2026-04-20T08:00:00Z"),
  createdBefore: z
    .string()
    .optional()
    .describe("Optional end time in ISO format like 2026-04-20T09:00:00Z"),
  hasException: z
    .boolean()
    .optional()
    .describe("Optional filter. Use true to show only logs with exception details"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListPluginTraceLogsParams = ToolParams<typeof listPluginTraceLogsSchema>;

export async function handleListPluginTraceLogs(
  {
    environment,
    pluginName,
    assemblyName,
    correlationId,
    createdAfter,
    createdBefore,
    hasException,
    limit,
    cursor,
  }: ListPluginTraceLogsParams,
  { config, client }: ToolContext,
) {
  try {
    if (assemblyName && !pluginName) {
      throw new Error("assemblyName can only be used together with pluginName.");
    }

    const env = getEnvironment(config, environment);
    const normalizedAfter = normalizeDateTimeInput(createdAfter, "createdAfter");
    const normalizedBefore = normalizeDateTimeInput(createdBefore, "createdBefore");

    if (normalizedAfter && normalizedBefore && normalizedAfter > normalizedBefore) {
      throw new Error("createdAfter must be earlier than or equal to createdBefore.");
    }

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

    const cursorPayload = decodeCursor(cursor);
    const resolvedLimit = resolveCursorLimit(limit, cursorPayload);
    const cursorContext = {
      environment: env.name,
      limit: resolvedLimit,
      filters: {
        pluginTypeName: resolvedPlugin?.fullName || null,
        correlationId: correlationId || null,
        createdAfter: normalizedAfter || null,
        createdBefore: normalizedBefore || null,
        hasException: hasException === true,
      },
    };
    validateCursorContext(cursorPayload, cursorContext);

    const page = await client.queryPage<Record<string, unknown>>(
      env,
      "plugintracelogs",
      listPluginTraceLogsQuery({
        pluginTypeName: resolvedPlugin?.fullName,
        correlationId,
        createdAfter: normalizedAfter || undefined,
        createdBefore: normalizedBefore || undefined,
        hasException: hasException === true,
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

    const items = page.items.map(normalizeTraceLog);
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
        correlationId: correlationId || null,
        createdAfter: normalizedAfter || null,
        createdBefore: normalizedBefore || null,
        hasException: hasException === true,
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
      const text = `No plugin trace logs found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_plugin_trace_logs", text, text, responseData);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: cursor || null,
      returnedCount: items.length,
      totalCount,
      hasMore: nextCursor !== null,
      nextCursor,
      itemLabelSingular: "plugin trace log",
      itemLabelPlural: "plugin trace logs",
      narrowHint:
        nextCursor !== null
          ? "Use pluginName, correlationId, or a tighter time range to narrow the result."
          : undefined,
    });

    const rows = items.map((item) => [
      item.createdOn.slice(0, 19).replace("T", " "),
      item.pluginName,
      item.messageName || "-",
      item.primaryEntity || "-",
      item.modeLabel,
      item.depth === null ? "-" : String(item.depth),
      item.executionDurationMs === null ? "-" : String(item.executionDurationMs),
      shorten(item.correlationId, 8),
      item.exceptionPreview || "-",
    ]);

    const filterLines = [
      `- Plugin: ${resolvedPlugin?.fullName || "Any"}`,
      `- Correlation Id: ${correlationId || "Any"}`,
      `- Created After: ${normalizedAfter || "Any"}`,
      `- Created Before: ${normalizedBefore || "Any"}`,
      `- Exceptions Only: ${hasException === true ? "Yes" : "No"}`,
    ].join("\n");

    const text = `## Plugin Trace Logs in '${env.name}'\n\n${pageSummary}\n\n${filterLines}\n\n${formatTable(
      [
        "Created",
        "Plugin",
        "Message",
        "Entity",
        "Mode",
        "Depth",
        "Duration ms",
        "Correlation",
        "Exception",
      ],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_plugin_trace_logs",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      responseData,
    );
  } catch (error) {
    return createToolErrorResponse("list_plugin_trace_logs", error);
  }
}

function normalizeTraceLog(record: Record<string, unknown>) {
  const typeName = String(record.typename || "");
  const pluginName = typeName.split(".").pop() || typeName || "(unknown)";
  const mode = getNumber(record.mode);
  const exceptionDetails = normalizeMultilineText(record.exceptiondetails);
  const messageBlock = normalizeMultilineText(record.messageblock);

  return {
    pluginTraceLogId: String(record.plugintracelogid || ""),
    typeName,
    pluginName,
    correlationId: String(record.correlationid || ""),
    createdOn: String(record.createdon || ""),
    messageName: String(record.messagename || ""),
    primaryEntity: String(record.primaryentity || ""),
    mode,
    modeLabel: mode === null ? "-" : (MODE_LABELS[mode] ?? String(mode)),
    depth: getNumber(record.depth),
    executionDurationMs: getNumber(record.performanceexecutionduration),
    hasException: Boolean(exceptionDetails),
    exceptionPreview: buildPreview(exceptionDetails),
    messageBlockPreview: buildPreview(messageBlock),
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

function normalizeMultilineText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text.replace(/\s+/g, " ") : null;
}

function buildPreview(value: string | null, maxLength = 80): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function getNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function encodeCursor(payload: PluginTraceLogCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): PluginTraceLogCursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as PluginTraceLogCursorPayload | null;

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
  cursorPayload: PluginTraceLogCursorPayload | null,
): number {
  if (!cursorPayload) {
    return limit ?? 50;
  }

  if (limit !== undefined && limit !== cursorPayload.limit) {
    throw new Error("This cursor belongs to a different paging limit.");
  }

  return cursorPayload.limit;
}

function validateCursorContext(
  cursorPayload: PluginTraceLogCursorPayload | null,
  context: Omit<PluginTraceLogCursorPayload, "nextLink" | "totalCount">,
): void {
  if (!cursorPayload) {
    return;
  }

  if (cursorPayload.environment !== context.environment) {
    throw new Error("This cursor belongs to a different environment.");
  }

  if (JSON.stringify(cursorPayload.filters) !== JSON.stringify(context.filters)) {
    throw new Error("This cursor belongs to a different set of trace log filters.");
  }
}

export const listPluginTraceLogsTool = defineTool({
  name: "list_plugin_trace_logs",
  description:
    "List Dataverse plug-in trace logs with filters for plugin class, correlation id, time range, and exception presence.",
  schema: listPluginTraceLogsSchema,
  handler: handleListPluginTraceLogs,
});

export function registerListPluginTraceLogs(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listPluginTraceLogsTool, { config, client });
}
