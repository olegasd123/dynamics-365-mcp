import { Buffer } from "node:buffer";
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
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import {
  TABLE_RECORD_STATE_SCHEMA,
  describeRequestedState,
  getTableDataRecordDetails,
  loadTableDataProfile,
} from "./record-data.js";

const getTableRecordDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  recordId: z.string().optional().describe("Optional Dataverse row id"),
  name: z
    .string()
    .optional()
    .describe("Optional primary name, full name, or last name when you do not have the id"),
  firstName: z.string().optional().describe("Optional first name for person tables like contact"),
  lastName: z.string().optional().describe("Optional last name for person tables like contact"),
  state: TABLE_RECORD_STATE_SCHEMA,
  includeAllFields: z
    .boolean()
    .optional()
    .describe("Optional full field mode. Defaults to false and returns a compact field set."),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type GetTableRecordDetailsParams = ToolParams<typeof getTableRecordDetailsSchema>;

interface FieldPageCursorPayload {
  start: string;
  environment: string;
  tableLogicalName: string;
  recordId: string;
  limit: number;
  includeAllFields: boolean;
}

export async function handleGetTableRecordDetails(
  {
    environment,
    table,
    recordId,
    name,
    firstName,
    lastName,
    state,
    includeAllFields,
    limit,
    cursor,
  }: GetTableRecordDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    validateLookupInput({ firstName, lastName, name, recordId });

    const env = getEnvironment(config, environment);
    const profile = await loadTableDataProfile(env, client, table);
    const details = await getTableDataRecordDetails(env, client, profile, {
      firstName,
      lastName,
      name,
      recordId,
      state,
      includeAllFields,
    });
    const fieldCursor = decodeFieldPageCursor(cursor);
    const fieldLimit = resolveFieldPageLimit(limit, fieldCursor);
    const fieldCursorContext = {
      environment: env.name,
      tableLogicalName: profile.table.logicalName,
      recordId: details.recordId,
      limit: fieldLimit,
      includeAllFields: includeAllFields === true,
    };
    validateFieldPageCursor(fieldCursor, fieldCursorContext);
    const fieldPage = buildPaginatedListData(
      details.fields,
      {
        environment: env.name,
        table: profile.table.logicalName,
      },
      {
        limit: fieldLimit,
        cursor: fieldCursor?.start,
      },
    );
    const encodedCursor = fieldCursor ? cursor || null : null;
    const encodedNextCursor = fieldPage.nextCursor
      ? encodeFieldPageCursor({
          ...fieldCursorContext,
          start: fieldPage.nextCursor,
        })
      : null;
    const requestedState = describeRequestedState(state, profile.supportsStateFilter);
    const fieldSummary = buildPaginatedListSummary({
      cursor: encodedCursor,
      returnedCount: fieldPage.returnedCount,
      totalCount: fieldPage.totalCount,
      hasMore: fieldPage.hasMore,
      nextCursor: encodedNextCursor,
      itemLabelSingular: "field",
      itemLabelPlural: "fields",
    });

    const lines: string[] = [];
    lines.push(`## Record: ${details.label}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Table: ${profile.table.logicalName}`);
    lines.push(`- Entity Set: ${profile.table.entitySetName}`);
    lines.push(`- Record ID: ${details.recordId}`);
    lines.push(`- State Filter: ${requestedState}`);
    lines.push(`- State: ${details.stateLabel || (profile.supportsStateFilter ? "-" : "N/A")}`);
    lines.push(`- Status: ${details.statusLabel || "-"}`);
    lines.push(`- Created: ${formatDate(details.createdon)}`);
    lines.push(`- Modified: ${formatDate(details.modifiedon)}`);
    if (details.secondaryText) {
      lines.push(`- Details: ${details.secondaryText}`);
    }
    lines.push("");
    lines.push("### Fields");
    lines.push(fieldSummary);
    lines.push("");
    lines.push(
      formatTable(
        ["Field", "Value"],
        fieldPage.items.map((field) => [field.displayName, field.value || "-"]),
      ),
    );

    return createToolSuccessResponse(
      "get_table_record_details",
      lines.join("\n"),
      `Loaded record '${details.label}' from table '${profile.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: profile.table,
        supportsStateFilter: profile.supportsStateFilter,
        lookup: {
          recordId: recordId || null,
          name: name || null,
          firstName: firstName || null,
          lastName: lastName || null,
          state: state || "active",
          includeAllFields: includeAllFields === true,
          appliedState: requestedState,
          limit: fieldLimit,
          cursor: encodedCursor,
        },
        fieldPage: {
          limit: fieldLimit,
          cursor: encodedCursor,
          returnedCount: fieldPage.returnedCount,
          totalCount: fieldPage.totalCount,
          hasMore: fieldPage.hasMore,
          nextCursor: encodedNextCursor,
          items: fieldPage.items,
        },
        record: {
          ...details,
          fields: fieldPage.items,
          raw: Object.fromEntries(
            fieldPage.items.map((field) => [field.logicalName, details.raw[field.logicalName]]),
          ),
        },
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_table_record_details", error);
  }
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

  if (!options.name?.trim() && !options.firstName?.trim() && !options.lastName?.trim()) {
    throw new Error("Provide recordId, name, or firstName/lastName to load one record.");
  }
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "-";
}

function resolveFieldPageLimit(
  limit: number | undefined,
  cursorPayload: FieldPageCursorPayload | null,
): number {
  if (!cursorPayload) {
    return limit ?? 50;
  }

  if (limit !== undefined && limit !== cursorPayload.limit) {
    throw new Error("Use the same limit value when continuing paged record fields.");
  }

  return cursorPayload.limit;
}

function validateFieldPageCursor(
  cursorPayload: FieldPageCursorPayload | null,
  context: Omit<FieldPageCursorPayload, "start">,
): void {
  if (!cursorPayload) {
    return;
  }

  if (
    cursorPayload.environment !== context.environment ||
    cursorPayload.tableLogicalName !== context.tableLogicalName ||
    cursorPayload.recordId !== context.recordId
  ) {
    throw new Error("This cursor belongs to a different record details result.");
  }

  if (cursorPayload.includeAllFields !== context.includeAllFields) {
    throw new Error("This cursor belongs to a different field selection mode.");
  }
}

function encodeFieldPageCursor(payload: FieldPageCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeFieldPageCursor(cursor?: string): FieldPageCursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as FieldPageCursorPayload;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.start !== "string" ||
      typeof parsed.environment !== "string" ||
      typeof parsed.tableLogicalName !== "string" ||
      typeof parsed.recordId !== "string" ||
      typeof parsed.limit !== "number" ||
      typeof parsed.includeAllFields !== "boolean"
    ) {
      throw new Error("Invalid field cursor shape");
    }

    return parsed;
  } catch {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }
}

export const getTableRecordDetailsTool = defineTool({
  name: "get_table_record_details",
  description:
    "Show one Dataverse table record by id or common name fields. Defaults to active rows, returns a compact field set by default, and returns structured choices for ambiguous matches.",
  schema: getTableRecordDetailsSchema,
  handler: handleGetTableRecordDetails,
});

export function registerGetTableRecordDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getTableRecordDetailsTool, { config, client });
}
