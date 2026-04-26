import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import {
  TABLE_RECORD_STATE_SCHEMA,
  getTableDataRecordDetails,
  loadTableDataProfile,
} from "../data/record-data.js";
import {
  buildAuditHistorySummary,
  buildFieldPreview,
  decodeAuditHistoryCursor,
  listAuditHistoryPage,
  normalizeAuditDateTimeInput,
  resolveAuditApiPageSize,
  resolveAuditHistoryLimit,
  validateAuditDateRange,
  validateAuditHistoryCursor,
} from "./audit-history.js";

const listAuditHistorySchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  recordId: z.string().optional().describe("Optional Dataverse row id for one record"),
  name: z
    .string()
    .optional()
    .describe("Optional primary name, full name, or last name when you do not have the id"),
  firstName: z.string().optional().describe("Optional first name for person tables like contact"),
  lastName: z.string().optional().describe("Optional last name for person tables like contact"),
  state: TABLE_RECORD_STATE_SCHEMA.describe(
    "Optional state filter used only when resolving one record by name. Defaults to all.",
  ),
  createdAfter: z
    .string()
    .optional()
    .describe("Optional audit window start in ISO format like 2026-04-20T08:00:00Z"),
  createdBefore: z
    .string()
    .optional()
    .describe("Optional audit window end in ISO format like 2026-04-20T09:00:00Z"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListAuditHistoryParams = ToolParams<typeof listAuditHistorySchema>;

export async function handleListAuditHistory(
  {
    environment,
    table,
    recordId,
    name,
    firstName,
    lastName,
    state,
    createdAfter,
    createdBefore,
    limit,
    cursor,
  }: ListAuditHistoryParams,
  { config, client }: ToolContext,
) {
  try {
    validateLookupInput({ firstName, lastName, name, recordId });

    const env = getEnvironment(config, environment);
    const normalizedCreatedAfter = normalizeAuditDateTimeInput(createdAfter, "createdAfter");
    const normalizedCreatedBefore = normalizeAuditDateTimeInput(createdBefore, "createdBefore");
    validateAuditDateRange(normalizedCreatedAfter, normalizedCreatedBefore);

    const profile = await loadTableDataProfile(env, client, table);
    const cursorPayload = decodeAuditHistoryCursor(cursor);
    const resolvedLimit = resolveAuditApiPageSize(resolveAuditHistoryLimit(limit, cursorPayload));
    const lookupRequested = hasLookupInput({ firstName, lastName, name, recordId });
    const resolvedRecord = lookupRequested
      ? await resolveRequestedRecord(env, client, profile, {
          firstName,
          lastName,
          name,
          recordId,
          state,
        })
      : null;

    if (!lookupRequested && !normalizedCreatedAfter && !normalizedCreatedBefore) {
      throw new Error("Provide createdAfter or createdBefore when listing table audit history.");
    }

    const cursorContext = {
      environment: env.name,
      tableLogicalName: profile.table.logicalName,
      recordId: resolvedRecord?.recordId || null,
      createdAfter: normalizedCreatedAfter,
      createdBefore: normalizedCreatedBefore,
      limit: resolvedLimit,
    };
    validateAuditHistoryCursor(cursorPayload, cursorContext);

    const page = await listAuditHistoryPage(env, client, {
      tableLogicalName: profile.table.logicalName,
      recordId: resolvedRecord?.recordId || undefined,
      createdAfter: normalizedCreatedAfter,
      createdBefore: normalizedCreatedBefore,
      limit: resolvedLimit,
      cursor: cursorPayload,
      includeDetails: resolvedRecord !== null,
    });

    const responseData = {
      environment: env.name,
      table: profile.table,
      record:
        resolvedRecord === null
          ? null
          : {
              recordId: resolvedRecord.recordId,
              label: resolvedRecord.label,
              stateFilter: (state || "all") as "active" | "inactive" | "all",
            },
      filters: {
        createdAfter: normalizedCreatedAfter,
        createdBefore: normalizedCreatedBefore,
      },
      ...page,
    };

    if (page.items.length === 0) {
      const text =
        resolvedRecord === null
          ? `No audit history found for table '${profile.table.logicalName}' in '${env.name}'.`
          : `No audit history found for record '${resolvedRecord.label || resolvedRecord.recordId}' in table '${profile.table.logicalName}' in '${env.name}'.`;
      return createToolSuccessResponse("list_audit_history", text, text, responseData);
    }

    const pageSummary = buildAuditHistorySummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });

    const rows = page.items.map((item) => [
      formatDateTime(item.changedOn),
      item.operationLabel,
      item.userName,
      item.recordLabel || item.recordId || "-",
      buildFieldPreview(item.changedFields),
      item.summary,
    ]);

    const header = resolvedRecord
      ? `## Audit History for Record '${resolvedRecord.label || resolvedRecord.recordId}'`
      : `## Audit History for Table '${profile.table.logicalName}'`;
    const filterLines = [
      `- Environment: ${env.name}`,
      `- Table: ${profile.table.logicalName}`,
      resolvedRecord ? `- Record ID: ${resolvedRecord.recordId}` : "",
      `- Created After: ${normalizedCreatedAfter || "Any"}`,
      `- Created Before: ${normalizedCreatedBefore || "Any"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const text = `${header}\n\n${pageSummary}\n\n${filterLines}\n\n${formatTable(
      ["Changed", "Operation", "User", "Record", "Fields", "Summary"],
      rows,
    )}`;

    return createToolSuccessResponse(
      "list_audit_history",
      text,
      `${pageSummary} Table: '${profile.table.logicalName}'.`,
      responseData,
    );
  } catch (error) {
    return createToolErrorResponse("list_audit_history", error);
  }
}

export const listAuditHistoryTool = defineTool({
  name: "list_audit_history",
  description:
    "List Dataverse audit history for one table over a time window, or for one record when you provide a row lookup.",
  schema: listAuditHistorySchema,
  handler: handleListAuditHistory,
});

export function registerListAuditHistory(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listAuditHistoryTool, { config, client });
}

function validateLookupInput(options: {
  firstName?: string;
  lastName?: string;
  name?: string;
  recordId?: string;
}) {
  if (options.recordId?.trim()) {
    if (options.name?.trim() || options.firstName?.trim() || options.lastName?.trim()) {
      throw new Error("Use recordId or name fields, not both, when loading one record.");
    }

    return;
  }

  if (options.name?.trim() && (options.firstName?.trim() || options.lastName?.trim())) {
    throw new Error("Use name or firstName/lastName fields, not both, when loading one record.");
  }
}

function hasLookupInput(options: {
  firstName?: string;
  lastName?: string;
  name?: string;
  recordId?: string;
}) {
  return Boolean(
    options.recordId?.trim() ||
    options.name?.trim() ||
    options.firstName?.trim() ||
    options.lastName?.trim(),
  );
}

async function resolveRequestedRecord(
  env: Parameters<typeof getTableDataRecordDetails>[0],
  client: DynamicsClient,
  profile: Awaited<ReturnType<typeof loadTableDataProfile>>,
  options: {
    firstName?: string;
    lastName?: string;
    name?: string;
    recordId?: string;
    state?: "active" | "inactive" | "all";
  },
): Promise<{ recordId: string; label: string }> {
  if (options.recordId?.trim()) {
    try {
      const details = await getTableDataRecordDetails(env, client, profile, {
        recordId: options.recordId,
        includeAllFields: false,
        state: "all",
      });

      return {
        recordId: details.recordId,
        label: details.label,
      };
    } catch {
      return {
        recordId: options.recordId,
        label: options.recordId,
      };
    }
  }

  const details = await getTableDataRecordDetails(env, client, profile, {
    firstName: options.firstName,
    lastName: options.lastName,
    name: options.name,
    includeAllFields: false,
    state: options.state || "all",
  });

  return {
    recordId: details.recordId,
    label: details.label,
  };
}

function formatDateTime(value: string): string {
  return value ? value.slice(0, 19).replace("T", " ") : "-";
}
