import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { and, eq, inList, or, query } from "../../utils/odata-builder.js";
import { formatTable } from "../../utils/formatters.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { resolveTable, type TableRecord } from "./table-metadata.js";

const DUPLICATE_RULE_SELECT = [
  "duplicateruleid",
  "name",
  "uniquename",
  "baseentityname",
  "matchingentityname",
  "statuscode",
  "statecode",
  "iscasesensitive",
  "excludeinactiverecords",
  "ismanaged",
  "createdon",
  "modifiedon",
];

const DUPLICATE_RULE_CONDITION_SELECT = [
  "duplicateruleconditionid",
  "baseattributename",
  "matchingattributename",
  "operatorcode",
  "operatorparam",
  "ignoreblankvalues",
  "uniquerulename",
  "_regardingobjectid_value",
];

const DUPLICATE_RULE_STATUS = {
  unpublished: 0,
  publishing: 1,
  published: 2,
} as const;

const CONDITION_OPERATOR_LABELS: Record<number, string> = {
  0: "Exact Match",
  1: "Same First Characters",
  2: "Same Last Characters",
  3: "Same Date",
  4: "Same Date And Time",
  5: "Exact Match (Pick List Label)",
  6: "Exact Match (Pick List Value)",
};

const listDuplicateDetectionRulesSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z
    .string()
    .optional()
    .describe("Optional table logical name, schema name, or display name"),
  status: z
    .enum(["all", "published", "unpublished", "publishing"])
    .optional()
    .describe("Optional rule status filter. Defaults to all."),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListDuplicateDetectionRulesParams = ToolParams<typeof listDuplicateDetectionRulesSchema>;
type DuplicateRuleStatusFilter = NonNullable<ListDuplicateDetectionRulesParams["status"]>;

interface DuplicateRuleRecord {
  duplicateRuleId: string;
  name: string;
  uniqueName: string;
  baseTable: string;
  matchingTable: string;
  statusCode: number | null;
  statusLabel: string;
  stateCode: number | null;
  stateLabel: string;
  isPublished: boolean;
  isCaseSensitive: boolean;
  ignoreCase: boolean;
  excludeInactiveRecords: boolean;
  isManaged: boolean;
  createdOn: string;
  modifiedOn: string;
  conditions: DuplicateRuleConditionRecord[];
}

interface DuplicateRuleConditionRecord {
  duplicateRuleConditionId: string;
  baseAttributeName: string;
  matchingAttributeName: string;
  operatorCode: number | null;
  operatorLabel: string;
  operatorParam: number | null;
  ignoreBlankValues: boolean;
  effectiveIgnoreBlankValues: boolean;
  ignoreCase: boolean;
  uniqueRuleName: string;
}

interface RawDuplicateRule {
  duplicateruleid?: unknown;
  name?: unknown;
  uniquename?: unknown;
  baseentityname?: unknown;
  matchingentityname?: unknown;
  statuscode?: unknown;
  statecode?: unknown;
  iscasesensitive?: unknown;
  excludeinactiverecords?: unknown;
  ismanaged?: unknown;
  createdon?: unknown;
  modifiedon?: unknown;
}

interface RawDuplicateRuleCondition {
  duplicateruleconditionid?: unknown;
  baseattributename?: unknown;
  matchingattributename?: unknown;
  operatorcode?: unknown;
  operatorparam?: unknown;
  ignoreblankvalues?: unknown;
  uniquerulename?: unknown;
  _regardingobjectid_value?: unknown;
}

export async function handleListDuplicateDetectionRules(
  { environment, table, status, limit, cursor }: ListDuplicateDetectionRulesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const statusFilter = status || "all";
    const resolvedTable = table ? await resolveTable(env, client, table) : null;
    const ruleRecords = await client.query<RawDuplicateRule>(
      env,
      "duplicaterules",
      buildDuplicateRulesQuery(resolvedTable, statusFilter),
    );
    const allRules = ruleRecords.map(normalizeDuplicateRule).sort(compareDuplicateRules);
    const page = buildPaginatedListData(
      allRules,
      {
        environment: env.name,
        table: resolvedTable,
        status: statusFilter,
      },
      { limit, cursor },
    );
    const conditionsByRuleId = await fetchConditionsByRuleId(
      env,
      client,
      page.items.map((rule) => rule.duplicateRuleId),
    );
    const items = page.items.map((rule) => addConditions(rule, conditionsByRuleId));
    const publishedCount = items.filter((rule) => rule.isPublished).length;
    const summary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "duplicate detection rule",
      itemLabelPlural: "duplicate detection rules",
    });
    const text = buildResponseText({
      environment: env.name,
      table: resolvedTable,
      status: statusFilter,
      items,
      totalCount: page.totalCount,
      publishedCount,
      nextCursor: page.nextCursor,
    });

    return createToolSuccessResponse(
      "list_duplicate_detection_rules",
      text,
      `${summary} Published on this page: ${publishedCount}.`,
      {
        ...page,
        items,
        returnedCount: items.length,
        publishedCount,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_duplicate_detection_rules", error);
  }
}

export const listDuplicateDetectionRulesTool = defineTool({
  name: "list_duplicate_detection_rules",
  description: "List Dataverse duplicate detection rules, their tables, status, and conditions.",
  schema: listDuplicateDetectionRulesSchema,
  handler: handleListDuplicateDetectionRules,
});

export function registerListDuplicateDetectionRules(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listDuplicateDetectionRulesTool, { config, client });
}

function buildDuplicateRulesQuery(
  table: TableRecord | null,
  status: DuplicateRuleStatusFilter,
): string {
  const tableFilter = table
    ? or(eq("baseentityname", table.logicalName), eq("matchingentityname", table.logicalName))
    : undefined;
  const statusFilter =
    status === "all" ? undefined : eq("statuscode", DUPLICATE_RULE_STATUS[status]);

  return query()
    .select(DUPLICATE_RULE_SELECT)
    .filter(and(tableFilter, statusFilter))
    .orderby("name asc")
    .toString();
}

async function fetchConditionsByRuleId(
  env: EnvironmentConfig,
  client: DynamicsClient,
  ruleIds: string[],
): Promise<Map<string, DuplicateRuleConditionRecord[]>> {
  const ids = [...new Set(ruleIds.filter(Boolean))];
  const conditionsByRuleId = new Map<string, DuplicateRuleConditionRecord[]>();
  if (ids.length === 0) {
    return conditionsByRuleId;
  }

  const conditions = await client.query<RawDuplicateRuleCondition>(
    env,
    "duplicateruleconditions",
    query()
      .select(DUPLICATE_RULE_CONDITION_SELECT)
      .filter(inList("_regardingobjectid_value", ids))
      .orderby("baseattributename asc")
      .toString(),
  );

  for (const condition of conditions) {
    const ruleId = normalizeGuid(condition._regardingobjectid_value);
    const items = conditionsByRuleId.get(ruleId) || [];
    items.push(normalizeDuplicateRuleCondition(condition));
    conditionsByRuleId.set(ruleId, items);
  }

  return conditionsByRuleId;
}

function addConditions(
  rule: DuplicateRuleRecord,
  conditionsByRuleId: Map<string, DuplicateRuleConditionRecord[]>,
): DuplicateRuleRecord {
  const rawConditions = conditionsByRuleId.get(rule.duplicateRuleId) || [];
  const conditions = rawConditions
    .map((condition) => ({
      ...condition,
      ignoreCase: rule.ignoreCase,
      effectiveIgnoreBlankValues: rawConditions.length === 1 ? true : condition.ignoreBlankValues,
    }))
    .sort((left, right) => left.baseAttributeName.localeCompare(right.baseAttributeName));

  return {
    ...rule,
    conditions,
  };
}

function normalizeDuplicateRule(rule: RawDuplicateRule): DuplicateRuleRecord {
  const statusCode = toNumberOrNull(rule.statuscode);
  const stateCode = toNumberOrNull(rule.statecode);
  const isCaseSensitive = Boolean(rule.iscasesensitive);

  return {
    duplicateRuleId: normalizeGuid(rule.duplicateruleid),
    name: String(rule.name || ""),
    uniqueName: String(rule.uniquename || ""),
    baseTable: String(rule.baseentityname || ""),
    matchingTable: String(rule.matchingentityname || ""),
    statusCode,
    statusLabel: formatRuleStatus(statusCode),
    stateCode,
    stateLabel: formatRuleState(stateCode),
    isPublished: statusCode === DUPLICATE_RULE_STATUS.published,
    isCaseSensitive,
    ignoreCase: !isCaseSensitive,
    excludeInactiveRecords: Boolean(rule.excludeinactiverecords),
    isManaged: Boolean(rule.ismanaged),
    createdOn: String(rule.createdon || ""),
    modifiedOn: String(rule.modifiedon || ""),
    conditions: [],
  };
}

function normalizeDuplicateRuleCondition(
  condition: RawDuplicateRuleCondition,
): DuplicateRuleConditionRecord {
  const operatorCode = toNumberOrNull(condition.operatorcode);

  return {
    duplicateRuleConditionId: normalizeGuid(condition.duplicateruleconditionid),
    baseAttributeName: String(condition.baseattributename || ""),
    matchingAttributeName: String(condition.matchingattributename || ""),
    operatorCode,
    operatorLabel: formatConditionOperator(operatorCode),
    operatorParam: toNumberOrNull(condition.operatorparam),
    ignoreBlankValues: Boolean(condition.ignoreblankvalues),
    effectiveIgnoreBlankValues: Boolean(condition.ignoreblankvalues),
    ignoreCase: true,
    uniqueRuleName: String(condition.uniquerulename || ""),
  };
}

function buildResponseText(options: {
  environment: string;
  table: TableRecord | null;
  status: DuplicateRuleStatusFilter;
  items: DuplicateRuleRecord[];
  totalCount: number;
  publishedCount: number;
  nextCursor: string | null;
}): string {
  const lines: string[] = [];
  lines.push("## Duplicate Detection Rules");
  lines.push(`- Environment: ${options.environment}`);
  lines.push(`- Table Filter: ${options.table?.logicalName || "-"}`);
  lines.push(`- Status Filter: ${formatStatusFilter(options.status)}`);
  lines.push(`- Total Matching Rules: ${options.totalCount}`);
  lines.push(`- Published On This Page: ${options.publishedCount}`);
  if (options.nextCursor) {
    lines.push(`- Next Cursor: ${options.nextCursor}`);
  }
  lines.push(`- Note: Only published rules can run.`);

  if (options.items.length === 0) {
    lines.push("");
    lines.push("No duplicate detection rules found.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("### Rules");
  lines.push(
    formatTable(
      [
        "Name",
        "Base Table",
        "Matching Table",
        "Status",
        "Conditions",
        "Ignore Case",
        "Exclude Inactive",
        "Modified",
      ],
      options.items.map((rule) => [
        rule.name || rule.uniqueName || rule.duplicateRuleId,
        rule.baseTable || "-",
        rule.matchingTable || "-",
        rule.statusLabel,
        String(rule.conditions.length),
        formatYesNo(rule.ignoreCase),
        formatYesNo(rule.excludeInactiveRecords),
        formatDate(rule.modifiedOn),
      ]),
    ),
  );

  for (const rule of options.items) {
    lines.push("");
    lines.push(`### ${rule.name || rule.uniqueName || rule.duplicateRuleId}`);
    lines.push(`- Unique Name: ${rule.uniqueName || "-"}`);
    lines.push(`- Tables: ${rule.baseTable || "-"} -> ${rule.matchingTable || "-"}`);
    lines.push(`- Status: ${rule.statusLabel}`);
    lines.push(`- Case Sensitive: ${formatYesNo(rule.isCaseSensitive)}`);
    lines.push(`- Exclude Inactive Records: ${formatYesNo(rule.excludeInactiveRecords)}`);
    lines.push(`- Managed: ${formatYesNo(rule.isManaged)}`);
    lines.push(`- Created: ${formatDate(rule.createdOn)}`);
    lines.push(`- Modified: ${formatDate(rule.modifiedOn)}`);

    if (rule.conditions.length === 0) {
      lines.push("- Conditions: -");
      continue;
    }

    lines.push("");
    lines.push(
      formatTable(
        ["Base Field", "Matching Field", "Operator", "Param", "Ignore Case", "Ignore Blanks"],
        rule.conditions.map((condition) => [
          condition.baseAttributeName || "-",
          condition.matchingAttributeName || "-",
          condition.operatorLabel,
          condition.operatorParam === null ? "-" : String(condition.operatorParam),
          formatYesNo(condition.ignoreCase),
          formatYesNo(condition.effectiveIgnoreBlankValues),
        ]),
      ),
    );
  }

  return lines.join("\n");
}

function compareDuplicateRules(left: DuplicateRuleRecord, right: DuplicateRuleRecord): number {
  return (
    left.baseTable.localeCompare(right.baseTable) ||
    left.matchingTable.localeCompare(right.matchingTable) ||
    left.name.localeCompare(right.name)
  );
}

function formatRuleStatus(statusCode: number | null): string {
  switch (statusCode) {
    case DUPLICATE_RULE_STATUS.unpublished:
      return "Unpublished";
    case DUPLICATE_RULE_STATUS.publishing:
      return "Publishing";
    case DUPLICATE_RULE_STATUS.published:
      return "Published";
    default:
      return statusCode === null ? "-" : `Unknown (${statusCode})`;
  }
}

function formatRuleState(stateCode: number | null): string {
  switch (stateCode) {
    case 0:
      return "Inactive";
    case 1:
      return "Active";
    default:
      return stateCode === null ? "-" : `Unknown (${stateCode})`;
  }
}

function formatConditionOperator(operatorCode: number | null): string {
  if (operatorCode === null) {
    return "-";
  }

  return CONDITION_OPERATOR_LABELS[operatorCode] || `Unknown (${operatorCode})`;
}

function formatStatusFilter(status: DuplicateRuleStatusFilter): string {
  return status === "all" ? "All" : formatRuleStatus(DUPLICATE_RULE_STATUS[status]);
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "-";
}

function formatYesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function normalizeGuid(value: unknown): string {
  return String(value || "")
    .replace(/[{}]/g, "")
    .toLowerCase();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
