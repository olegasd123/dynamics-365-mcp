import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
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
};

type GetTableRecordDetailsParams = ToolParams<typeof getTableRecordDetailsSchema>;

export async function handleGetTableRecordDetails(
  { environment, table, recordId, name, firstName, lastName, state }: GetTableRecordDetailsParams,
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
    });
    const requestedState = describeRequestedState(state, profile.supportsStateFilter);

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
    lines.push(
      formatTable(
        ["Field", "Value"],
        details.fields.map((field) => [field.displayName, field.value || "-"]),
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
          appliedState: requestedState,
        },
        record: details,
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

export const getTableRecordDetailsTool = defineTool({
  name: "get_table_record_details",
  description:
    "Show one Dataverse table record by id or common name fields. Defaults to active rows and returns structured choices for ambiguous matches.",
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
