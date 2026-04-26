import { Buffer } from "node:buffer";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT } from "../response.js";
import { normalizeDateTimeInput } from "../system-jobs/system-job-metadata.js";
import { listAuditHistoryQuery } from "../../queries/audit-queries.js";

export interface AuditHistoryItem {
  auditId: string;
  changedOn: string;
  actionLabel: string;
  operationLabel: string;
  userName: string;
  callingUserName: string | null;
  tableLogicalName: string;
  recordId: string | null;
  recordLabel: string | null;
  summary: string;
  detailType: string | null;
  changedFields: AuditChangedField[];
  transactionId: string | null;
}

export interface AuditChangedField {
  logicalName: string;
  oldValue: string;
  newValue: string;
}

export interface AuditDetailSection {
  title: string;
  lines: string[];
}

export interface AuditDetailResult {
  detailType: string;
  summary: string;
  changedFields: AuditChangedField[];
  sections: AuditDetailSection[];
  rawDetail: Record<string, unknown>;
}

interface BaseAuditCursorPayload {
  environment: string;
  tableLogicalName: string;
  recordId: string | null;
  createdAfter: string | null;
  createdBefore: string | null;
  limit: number;
}

interface AuditTableCursorPayload extends BaseAuditCursorPayload {
  nextLink: string;
  totalCount: number;
}

export interface AuditHistoryPage {
  limit: number;
  cursor: string | null;
  returnedCount: number;
  totalCount: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  items: AuditHistoryItem[];
}

export function normalizeAuditDateTimeInput(
  value: string | undefined,
  fieldName: "createdAfter" | "createdBefore",
): string | null {
  return normalizeDateTimeInput(value, fieldName);
}

export function validateAuditDateRange(
  createdAfter: string | null,
  createdBefore: string | null,
): void {
  if (createdAfter && createdBefore && createdAfter > createdBefore) {
    throw new Error("createdAfter must be earlier than or equal to createdBefore.");
  }
}

export function resolveAuditHistoryLimit(
  limit: number | undefined,
  cursorPayload: AuditTableCursorPayload | null,
): number {
  if (!cursorPayload) {
    return limit ?? DEFAULT_LIST_LIMIT;
  }

  if (limit !== undefined && limit !== cursorPayload.limit) {
    throw new Error("Use the same limit value when continuing paged audit history.");
  }

  return cursorPayload.limit;
}

export function validateAuditHistoryCursor(
  cursorPayload: AuditTableCursorPayload | null,
  context: BaseAuditCursorPayload,
): void {
  if (!cursorPayload) {
    return;
  }

  if (
    cursorPayload.environment !== context.environment ||
    cursorPayload.tableLogicalName !== context.tableLogicalName ||
    cursorPayload.recordId !== context.recordId ||
    cursorPayload.createdAfter !== context.createdAfter ||
    cursorPayload.createdBefore !== context.createdBefore
  ) {
    throw new Error("Use the same filters when continuing paged audit history.");
  }
}

export function decodeAuditHistoryCursor(
  cursor: string | undefined,
): AuditTableCursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64").toString("utf-8"),
    ) as Partial<AuditTableCursorPayload>;

    if (
      typeof parsed.nextLink !== "string" ||
      typeof parsed.totalCount !== "number" ||
      typeof parsed.environment !== "string" ||
      typeof parsed.tableLogicalName !== "string" ||
      typeof parsed.limit !== "number"
    ) {
      throw new Error("Invalid cursor shape");
    }

    return {
      nextLink: parsed.nextLink,
      totalCount: parsed.totalCount,
      environment: parsed.environment,
      tableLogicalName: parsed.tableLogicalName,
      recordId: parsed.recordId ?? null,
      createdAfter: parsed.createdAfter ?? null,
      createdBefore: parsed.createdBefore ?? null,
      limit: parsed.limit,
    };
  } catch {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }
}

export function encodeAuditHistoryCursor(payload: AuditTableCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

export async function listAuditHistoryPage(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options: {
    tableLogicalName: string;
    recordId?: string;
    createdAfter?: string | null;
    createdBefore?: string | null;
    limit: number;
    cursor?: AuditTableCursorPayload | null;
    includeDetails: boolean;
  },
): Promise<AuditHistoryPage> {
  const page = await client.queryPage<Record<string, unknown>>(
    env,
    "audits",
    listAuditHistoryQuery({
      tableLogicalName: options.tableLogicalName,
      recordId: options.recordId,
      createdAfter: options.createdAfter || undefined,
      createdBefore: options.createdBefore || undefined,
      top: options.limit,
    }),
    {
      pageLink: options.cursor?.nextLink,
      cacheTier: CACHE_TIERS.VOLATILE,
    },
  );

  const totalCount = page.totalCount ?? options.cursor?.totalCount ?? page.items.length;
  const nextCursor =
    page.nextLink && totalCount >= 0
      ? encodeAuditHistoryCursor({
          nextLink: page.nextLink,
          totalCount,
          environment: env.name,
          tableLogicalName: options.tableLogicalName,
          recordId: options.recordId ?? null,
          createdAfter: options.createdAfter ?? null,
          createdBefore: options.createdBefore ?? null,
          limit: options.limit,
        })
      : null;

  const normalizedItems = page.items.map(normalizeAuditHistoryRow);
  const items = options.includeDetails
    ? await Promise.all(normalizedItems.map((item) => enrichAuditHistoryItem(env, client, item)))
    : normalizedItems;

  return {
    limit: options.limit,
    cursor: options.cursor ? encodeAuditHistoryCursor(options.cursor) : null,
    returnedCount: items.length,
    totalCount,
    hasMore: nextCursor !== null,
    nextCursor,
    items,
  };
}

function normalizeAuditHistoryRow(record: Record<string, unknown>): AuditHistoryItem {
  const auditId = normalizeText(record.auditid) || "";
  const changedOn = normalizeText(record.createdon) || "";
  const actionLabel = readFormattedValue(record, "action") || normalizeText(record.action) || "-";
  const operationLabel =
    readFormattedValue(record, "operation") || normalizeText(record.operation) || "-";
  const userName =
    readFormattedValue(record, "_userid_value") ||
    readFormattedValue(record, "_callinguserid_value") ||
    "-";
  const callingUserName = readFormattedValue(record, "_callinguserid_value");
  const recordId = normalizeText(record._objectid_value);
  const recordLabel = readFormattedValue(record, "_objectid_value");

  return {
    auditId,
    changedOn,
    actionLabel,
    operationLabel,
    userName,
    callingUserName,
    tableLogicalName: normalizeText(record.objecttypecode) || "",
    recordId,
    recordLabel,
    summary: buildAuditSummary(record),
    detailType: null,
    changedFields: [],
    transactionId: normalizeText(record.transactionid),
  };
}

async function enrichAuditHistoryItem(
  env: EnvironmentConfig,
  client: DynamicsClient,
  item: AuditHistoryItem,
): Promise<AuditHistoryItem> {
  if (!item.auditId) {
    return item;
  }

  try {
    const detail = await fetchAuditDetailResult(env, client, item.auditId);
    if (!detail) {
      return item;
    }

    return {
      ...item,
      detailType: detail.detailType,
      changedFields: detail.changedFields,
      summary: detail.summary || item.summary,
    };
  } catch {
    return item;
  }
}

export async function fetchAuditDetailResult(
  env: EnvironmentConfig,
  client: DynamicsClient,
  auditId: string,
): Promise<AuditDetailResult | null> {
  const response = await client.getPath<{ AuditDetail?: Record<string, unknown> }>(
    env,
    `audits(${auditId})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`,
    undefined,
    {
      cacheTier: CACHE_TIERS.VOLATILE,
    },
  );
  const detail = response?.AuditDetail;

  if (!detail || typeof detail !== "object") {
    return null;
  }

  const rawDetail = detail as Record<string, unknown>;
  const detailType = getDetailType(rawDetail);

  switch (detailType) {
    case "AttributeAuditDetail":
      return buildAttributeAuditDetail(rawDetail);
    case "RelationshipAuditDetail":
      return buildRelationshipAuditDetail(rawDetail);
    case "ShareAuditDetail":
      return buildShareAuditDetail(rawDetail);
    case "UserAccessAuditDetail":
      return buildUserAccessAuditDetail(rawDetail);
    case "RolePrivilegeAuditDetail":
      return buildRolePrivilegeAuditDetail(rawDetail);
    case "ApplicationBasedAccessControlAuditDetail":
      return buildApplicationAccessAuditDetail(rawDetail);
    case "IPFirewallAccessAuditDetail":
      return buildIpFirewallAuditDetail(rawDetail);
    default:
      return buildFallbackAuditDetail(rawDetail, detailType);
  }
}

export function extractChangedFields(detail: Record<string, unknown>): AuditChangedField[] {
  const oldFields = extractEntityFieldValueMap(detail.OldValue);
  const newFields = extractEntityFieldValueMap(detail.NewValue);
  const fieldNames = [...new Set([...oldFields.keys(), ...newFields.keys()])].sort((left, right) =>
    left.localeCompare(right),
  );

  return fieldNames
    .map((logicalName) => ({
      logicalName,
      oldValue: oldFields.get(logicalName) || "-",
      newValue: newFields.get(logicalName) || "-",
    }))
    .filter((item) => item.oldValue !== item.newValue);
}

function extractEntityFieldValueMap(value: unknown): Map<string, string> {
  const result = new Map<string, string>();

  if (!value || typeof value !== "object") {
    return result;
  }

  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (rawKey === "@odata.type" || rawKey.includes("@")) {
      continue;
    }

    const associatedField = normalizeText(
      (value as Record<string, unknown>)[
        `${rawKey}@Microsoft.Dynamics.CRM.associatednavigationproperty`
      ],
    );
    const logicalName = associatedField || rawKey;
    const formattedValue = normalizeText(
      (value as Record<string, unknown>)[`${rawKey}@OData.Community.Display.V1.FormattedValue`],
    );

    result.set(logicalName, formattedValue || formatUnknownValue(rawValue));
  }

  return result;
}

function buildAuditSummary(record: Record<string, unknown>): string {
  const changedata = normalizeText(record.changedata);
  if (changedata) {
    return buildPreview(changedata, 80) || "Change captured";
  }

  const additionalInfo = normalizeText(record.additionalinfo);
  if (additionalInfo) {
    return buildPreview(additionalInfo, 80) || "Additional audit info";
  }

  const userInfo = normalizeText(record.useradditionalinfo);
  if (userInfo) {
    return buildPreview(userInfo, 80) || "User audit info";
  }

  const operationLabel =
    readFormattedValue(record, "operation") || normalizeText(record.operation) || "Audit event";
  const actionLabel =
    readFormattedValue(record, "action") || normalizeText(record.action) || "Audit action";

  return `${operationLabel}: ${actionLabel}`;
}

function buildTypedAuditSummary(detailType: string, fallback: string): string {
  switch (detailType) {
    case "RelationshipAuditDetail":
      return "Relationship change";
    case "ShareAuditDetail":
      return "Sharing permissions changed";
    case "UserAccessAuditDetail":
      return "User access audit event";
    case "RolePrivilegeAuditDetail":
      return "Role privileges changed";
    default:
      return fallback;
  }
}

function buildAttributeAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const changedFields = extractChangedFields(detail);

  return {
    detailType: "AttributeAuditDetail",
    summary:
      changedFields.length > 0
        ? buildChangedFieldSummary(changedFields)
        : "Attribute change with no field diff returned.",
    changedFields,
    sections: [],
    rawDetail: detail,
  };
}

function buildRelationshipAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const relationshipName = normalizeText(detail.RelationshipName) || "-";
  const targetRecords = normalizeEntityCollection(detail.TargetRecords);

  return {
    detailType: "RelationshipAuditDetail",
    summary: relationshipName === "-" ? "Relationship change" : `Relationship: ${relationshipName}`,
    changedFields: [],
    sections: [
      {
        title: "Relationship",
        lines: [`- Name: ${relationshipName}`],
      },
      {
        title: "Target Records",
        lines: targetRecords.length > 0 ? targetRecords.map((item) => `- ${item}`) : ["None"],
      },
    ],
    rawDetail: detail,
  };
}

function buildShareAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const principal = describeEntityRef(detail.Principal);
  const oldPrivileges = formatUnknownValue(detail.OldPrivileges);
  const newPrivileges = formatUnknownValue(detail.NewPrivileges);

  return {
    detailType: "ShareAuditDetail",
    summary: `Privileges: ${oldPrivileges} -> ${newPrivileges}`,
    changedFields: [],
    sections: [
      {
        title: "Share",
        lines: [
          `- Principal: ${principal}`,
          `- Old Privileges: ${oldPrivileges}`,
          `- New Privileges: ${newPrivileges}`,
        ],
      },
    ],
    rawDetail: detail,
  };
}

function buildUserAccessAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const accessTime = normalizeText(detail.AccessTime) || "-";
  const interval = formatUnknownValue(detail.Interval);

  return {
    detailType: "UserAccessAuditDetail",
    summary: `Access at ${accessTime}`,
    changedFields: [],
    sections: [
      {
        title: "User Access",
        lines: [`- Access Time: ${accessTime}`, `- Interval Hours: ${interval}`],
      },
    ],
    rawDetail: detail,
  };
}

function buildRolePrivilegeAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const oldPrivileges = normalizeRolePrivileges(detail.OldRolePrivileges);
  const newPrivileges = normalizeRolePrivileges(detail.NewRolePrivileges);
  const invalidPrivileges = normalizeStringCollection(detail.InvalidNewPrivileges);

  return {
    detailType: "RolePrivilegeAuditDetail",
    summary: `Old privileges: ${oldPrivileges.length}. New privileges: ${newPrivileges.length}.`,
    changedFields: [],
    sections: [
      {
        title: "Old Role Privileges",
        lines: oldPrivileges.length > 0 ? oldPrivileges.map((item) => `- ${item}`) : ["None"],
      },
      {
        title: "New Role Privileges",
        lines: newPrivileges.length > 0 ? newPrivileges.map((item) => `- ${item}`) : ["None"],
      },
      {
        title: "Invalid New Privileges",
        lines:
          invalidPrivileges.length > 0 ? invalidPrivileges.map((item) => `- ${item}`) : ["None"],
      },
    ],
    rawDetail: detail,
  };
}

function buildApplicationAccessAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const applicationId = normalizeText(detail.ApplicationId) || "-";
  const impersonatedUserId = normalizeText(detail.ImpersonatedUserId) || "-";
  const userId = normalizeText(detail.UserID) || "-";

  return {
    detailType: "ApplicationBasedAccessControlAuditDetail",
    summary: `Application access by ${applicationId}`,
    changedFields: [],
    sections: [
      {
        title: "Application Access",
        lines: [
          `- Application Id: ${applicationId}`,
          `- Impersonated User Id: ${impersonatedUserId}`,
          `- User Id: ${userId}`,
        ],
      },
    ],
    rawDetail: detail,
  };
}

function buildIpFirewallAuditDetail(detail: Record<string, unknown>): AuditDetailResult {
  const ipAddress = normalizeText(detail.IPAddress) || "-";
  const userId = normalizeText(detail.UserID) || "-";

  return {
    detailType: "IPFirewallAccessAuditDetail",
    summary: `IP firewall access from ${ipAddress}`,
    changedFields: [],
    sections: [
      {
        title: "IP Firewall Access",
        lines: [`- IP Address: ${ipAddress}`, `- User Id: ${userId}`],
      },
    ],
    rawDetail: detail,
  };
}

function buildFallbackAuditDetail(
  detail: Record<string, unknown>,
  detailType: string,
): AuditDetailResult {
  const detailLines = Object.entries(detail)
    .filter(([key]) => key !== "@odata.type" && key !== "OldValue" && key !== "NewValue")
    .filter(([, value]) => !Array.isArray(value) && (typeof value !== "object" || value === null))
    .map(([key, value]) => `- ${key}: ${formatUnknownValue(value)}`);

  return {
    detailType,
    summary: buildTypedAuditSummary(detailType, detailType),
    changedFields: [],
    sections: [
      {
        title: "Detail Properties",
        lines: detailLines.length > 0 ? detailLines : ["None"],
      },
    ],
    rawDetail: detail,
  };
}

export function buildChangedFieldSummary(changedFields: AuditChangedField[]): string {
  if (changedFields.length === 0) {
    return "-";
  }

  const visibleFields = changedFields.slice(0, 3).map((field) => field.logicalName);
  const remainingCount = changedFields.length - visibleFields.length;
  return remainingCount > 0
    ? `${visibleFields.join(", ")} (+${remainingCount})`
    : visibleFields.join(", ");
}

export function getDetailType(detail: Record<string, unknown>): string {
  const rawType = String(detail["@odata.type"] || "");
  const typeName = rawType.split(".").pop() || rawType;
  return typeName.startsWith("#") ? typeName.slice(1) : typeName;
}

function readFormattedValue(record: Record<string, unknown>, fieldName: string): string | null {
  return normalizeText(record[`${fieldName}@OData.Community.Display.V1.FormattedValue`]);
}

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function buildPreview(value: string, maxLength: number): string | null {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function normalizeEntityCollection(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => describeEntityRef(item)).filter((item) => item !== "-");
}

function describeEntityRef(value: unknown): string {
  if (!value || typeof value !== "object") {
    return formatUnknownValue(value);
  }

  const record = value as Record<string, unknown>;
  const displayValue =
    Object.entries(record).find(([key]) =>
      key.endsWith("@OData.Community.Display.V1.FormattedValue"),
    )?.[1] ||
    record.name ||
    record.fullname ||
    record.subject ||
    record.systemuserid ||
    record.teamid ||
    record.accountid ||
    record.contactid;
  const logicalName = String(record["@odata.type"] || "")
    .split(".")
    .pop()
    ?.replace(/^#/, "");

  const label = normalizeText(displayValue) || "-";
  return logicalName ? `${label} (${logicalName})` : label;
}

function normalizeRolePrivileges(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return formatUnknownValue(item);
    }

    const record = item as Record<string, unknown>;
    const privilegeName =
      normalizeText(record.PrivilegeName) || normalizeText(record.privilegename);
    const depth = formatUnknownValue(record.Depth ?? record.depth);
    const businessUnitId = normalizeText(record.BusinessUnitId ?? record.businessunitid);

    return [
      privilegeName || "-",
      depth !== "-" ? `depth=${depth}` : "",
      businessUnitId ? `businessUnit=${businessUnitId}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  });
}

function normalizeStringCollection(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => formatUnknownValue(item));
}

export function buildAuditHistorySummary(options: {
  returnedCount: number;
  totalCount: number | null;
  hasMore: boolean;
  nextCursor: string | null;
  cursor: string | null;
  itemLabelPlural?: string;
}): string {
  const label = options.itemLabelPlural || "audit entries";

  if (options.totalCount === 0 && !options.hasMore) {
    return `Found 0 ${label}.`;
  }

  if (options.totalCount !== null) {
    if (!options.cursor && !options.hasMore && options.returnedCount === options.totalCount) {
      return `Found ${options.totalCount} ${label}.`;
    }

    const parts = [`Showing ${options.returnedCount} of ${options.totalCount} ${label}.`];
    if (options.nextCursor) {
      parts.push(
        `Recommended next step: ask for the next page with cursor='${options.nextCursor}' and the same filters.`,
      );
    }
    return parts.join(" ");
  }

  const parts = [`Showing ${options.returnedCount} ${label}.`];
  if (options.nextCursor) {
    parts.push(
      `Recommended next step: ask for the next page with cursor='${options.nextCursor}' and the same filters.`,
    );
  }
  return parts.join(" ");
}

export function buildFieldPreview(changedFields: AuditChangedField[]): string {
  if (changedFields.length === 0) {
    return "-";
  }

  return buildChangedFieldSummary(changedFields);
}

export function resolveAuditApiPageSize(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new Error(
      `Invalid limit '${String(limit)}'. Use an integer from 1 to ${MAX_LIST_LIMIT}.`,
    );
  }

  return limit;
}
