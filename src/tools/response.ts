import { z } from "zod";
import { requestLogger } from "../logging/request-logger.js";

interface ToolTextContent {
  type: "text";
  text: string;
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;

export const LIST_LIMIT_SCHEMA = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_LIMIT)
  .optional()
  .describe(`Optional page size. Defaults to ${DEFAULT_LIST_LIMIT}.`);

export const LIST_CURSOR_SCHEMA = z
  .string()
  .optional()
  .describe("Optional paging cursor from a previous nextCursor value.");

export interface ToolSuccessPayload<TData extends object> {
  [key: string]: unknown;
  version: "1";
  tool: string;
  ok: true;
  summary: string;
  data: TData;
}

export interface ToolErrorPayload {
  [key: string]: unknown;
  version: "1";
  tool: string;
  ok: false;
  error: {
    name: string;
    message: string;
  };
}

export interface ToolResponse<TData extends object = Record<string, unknown>> {
  [key: string]: unknown;
  content: ToolTextContent[];
  structuredContent: ToolSuccessPayload<TData> | ToolErrorPayload;
  isError?: boolean;
}

export interface PaginatedListData<TItem extends object> {
  limit: number;
  cursor: string | null;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  items: TItem[];
}

export function createToolSuccessResponse<TData extends object>(
  tool: string,
  text: string,
  summary: string,
  data: TData,
): ToolResponse<TData> {
  const response: ToolResponse<TData> = {
    content: [{ type: "text", text }],
    structuredContent: {
      version: "1",
      tool,
      ok: true,
      summary,
      data,
    },
  };

  requestLogger.logToolResponse(tool, response);
  return response;
}

export function buildPaginatedListData<TItem extends object, TExtra extends object>(
  allItems: TItem[],
  extra: TExtra,
  options?: {
    limit?: number;
    cursor?: string;
  },
): TExtra & PaginatedListData<TItem> {
  const limit = resolveListLimit(options?.limit);
  const totalCount = allItems.length;
  const startIndex = resolveListCursor(options?.cursor, totalCount);
  const items = allItems.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + items.length < totalCount ? String(startIndex + items.length) : null;

  return {
    ...extra,
    limit,
    cursor: options?.cursor || null,
    returnedCount: items.length,
    totalCount,
    hasMore: nextCursor !== null,
    nextCursor,
    items,
  };
}

export function buildPaginatedListSummary(options: {
  cursor: string | null;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  itemLabelSingular: string;
  itemLabelPlural: string;
  narrowHint?: string;
}): string {
  const {
    cursor,
    returnedCount,
    totalCount,
    hasMore,
    nextCursor,
    itemLabelSingular,
    itemLabelPlural,
    narrowHint,
  } = options;

  if (totalCount === 0) {
    return `Found 0 ${itemLabelPlural}.`;
  }

  if (!cursor && !hasMore && returnedCount === totalCount) {
    const itemLabel = totalCount === 1 ? itemLabelSingular : itemLabelPlural;
    return `Found ${totalCount} ${itemLabel}.`;
  }

  const parts = [`Showing ${returnedCount} of ${totalCount} ${itemLabelPlural}.`];

  if (nextCursor) {
    parts.push(`Use cursor='${nextCursor}' to continue.`);
  }

  if (narrowHint) {
    parts.push(narrowHint);
  }

  return parts.join(" ");
}

export function createToolErrorResponse(
  tool: string,
  error: unknown,
): ToolResponse<Record<string, unknown>> {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));

  const response: ToolResponse<Record<string, unknown>> = {
    content: [{ type: "text", text: `Error: ${normalizedError.message}` }],
    structuredContent: {
      version: "1",
      tool,
      ok: false,
      error: {
        name: normalizedError.name,
        message: normalizedError.message,
      },
    },
    isError: true,
  };

  requestLogger.logToolResponse(tool, response);
  requestLogger.logError(`tool-response:${tool}`, normalizedError);
  return response;
}

function resolveListLimit(limit: number | undefined): number {
  const resolvedLimit = limit ?? DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(resolvedLimit) || resolvedLimit < 1 || resolvedLimit > MAX_LIST_LIMIT) {
    throw new Error(
      `Invalid limit '${String(limit)}'. Use an integer from 1 to ${MAX_LIST_LIMIT}.`,
    );
  }

  return resolvedLimit;
}

function resolveListCursor(cursor: string | undefined, totalCount: number): number {
  if (!cursor) {
    return 0;
  }

  const startIndex = Number.parseInt(cursor, 10);
  if (!Number.isInteger(startIndex) || startIndex < 0 || String(startIndex) !== cursor.trim()) {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }

  if (totalCount === 0 && startIndex === 0) {
    return 0;
  }

  if (startIndex >= totalCount) {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }

  return startIndex;
}
