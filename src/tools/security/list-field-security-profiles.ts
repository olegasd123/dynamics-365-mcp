import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  listFieldSecurityProfilesData,
  type FieldSecurityProfileRecord,
} from "./field-security-metadata.js";

const listFieldSecurityProfilesSchema = {
  environment: z.string().optional().describe("Environment name"),
  profileName: z.string().optional().describe("Optional field security profile name filter"),
  table: z
    .string()
    .optional()
    .describe("Optional table logical name, schema name, or display name"),
  column: z.string().optional().describe("Optional secured column logical name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  includeMembers: z
    .boolean()
    .optional()
    .describe("Include user and team member names. Defaults to false."),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListFieldSecurityProfilesParams = ToolParams<typeof listFieldSecurityProfilesSchema>;

export async function handleListFieldSecurityProfiles(
  {
    environment,
    profileName,
    table,
    column,
    solution,
    includeMembers,
    limit,
    cursor,
  }: ListFieldSecurityProfilesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const result = await listFieldSecurityProfilesData(env, client, {
      profileName,
      table,
      column,
      solution,
      includeMembers,
    });
    const page = buildPaginatedListData(
      result.items,
      {
        environment: env.name,
        filters: result.filters,
        includeMembers: Boolean(includeMembers),
      },
      { limit, cursor },
    );

    if (page.totalCount === 0) {
      const text = `No field security profiles found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_field_security_profiles", text, text, page);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "field security profile",
      itemLabelPlural: "field security profiles",
      narrowHint: page.hasMore
        ? "Use profileName, table, column, or solution to narrow the result."
        : undefined,
    });
    const filterSummary = buildFilterSummary(result.filters);
    const lines: string[] = [];

    lines.push(
      `## Field Security Profiles in '${env.name}'${filterSummary ? ` (${filterSummary})` : ""}`,
    );
    lines.push("");
    lines.push(pageSummary);
    lines.push("");
    lines.push(formatProfileTable(page.items));
    lines.push("");
    lines.push("### Column Grants");
    lines.push(formatPermissionsTable(page.items));

    if (includeMembers) {
      lines.push("");
      lines.push("### Members");
      lines.push(formatMembersTable(page.items));
    }

    return createToolSuccessResponse(
      "list_field_security_profiles",
      lines.join("\n"),
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_field_security_profiles", error);
  }
}

export const listFieldSecurityProfilesTool = defineTool({
  name: "list_field_security_profiles",
  description:
    "List field security profiles with secured column grants, solution membership, and user/team counts.",
  schema: listFieldSecurityProfilesSchema,
  handler: handleListFieldSecurityProfiles,
});

export function registerListFieldSecurityProfiles(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listFieldSecurityProfilesTool, { config, client });
}

function formatProfileTable(profiles: FieldSecurityProfileRecord[]): string {
  return formatTable(
    ["Name", "Managed", "Users", "Teams", "Solutions", "Column Grants", "Modified"],
    profiles.map((profile) => [
      profile.name,
      profile.ismanaged ? "Yes" : "No",
      String(profile.memberCounts.users),
      String(profile.memberCounts.teams),
      formatSolutions(profile),
      String(profile.permissions.length),
      String(profile.modifiedon || "").slice(0, 10) || "-",
    ]),
  );
}

function formatPermissionsTable(profiles: FieldSecurityProfileRecord[]): string {
  const rows = profiles.flatMap((profile) =>
    profile.permissions.map((permission) => [
      profile.name,
      permission.tableLogicalName,
      permission.columnLogicalName,
      permission.canRead,
      permission.canCreate,
      permission.canUpdate,
    ]),
  );

  if (rows.length === 0) {
    return "No field permissions found for the returned profiles.";
  }

  return formatTable(["Profile", "Table", "Column", "Read", "Create", "Update"], rows);
}

function formatMembersTable(profiles: FieldSecurityProfileRecord[]): string {
  const rows = profiles.flatMap((profile) => [
    ...profile.users.map((user) => [
      profile.name,
      "User",
      user.name || user.id,
      user.domainName || "-",
    ]),
    ...profile.teams.map((team) => [profile.name, "Team", team.name || team.id, "-"]),
  ]);

  if (rows.length === 0) {
    return "No users or teams found for the returned profiles.";
  }

  return formatTable(["Profile", "Type", "Name", "Domain"], rows);
}

function buildFilterSummary(filters: {
  profileName: string | null;
  table: string | null;
  column: string | null;
  solution: string | null;
}): string {
  return [
    filters.profileName ? `profile='${filters.profileName}'` : "",
    filters.table ? `table='${filters.table}'` : "",
    filters.column ? `column='${filters.column}'` : "",
    filters.solution ? `solution='${filters.solution}'` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function formatSolutions(profile: FieldSecurityProfileRecord): string {
  if (profile.solutionMemberships.length === 0) {
    return "-";
  }

  return profile.solutionMemberships
    .map((solution) => solution.uniquename || solution.friendlyname || solution.solutionid)
    .join(", ");
}
