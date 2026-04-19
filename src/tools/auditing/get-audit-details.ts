import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { getAuditByIdQuery } from "../../queries/audit-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { fetchAuditDetailResult } from "./audit-history.js";

const getAuditDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  auditId: z.string().describe("Audit record id"),
};

type GetAuditDetailsParams = ToolParams<typeof getAuditDetailsSchema>;

export async function handleGetAuditDetails(
  { environment, auditId }: GetAuditDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const auditRecord = await client.getPath<Record<string, unknown>>(
      env,
      `audits(${auditId})`,
      getAuditByIdQuery(),
      {
        cacheTier: CACHE_TIERS.VOLATILE,
      },
    );

    if (!auditRecord) {
      throw new Error(`Audit record '${auditId}' not found.`);
    }

    const detail = await fetchAuditDetailResult(env, client, auditId);
    const summary = normalizeAuditRecord(auditRecord);
    const lines: string[] = [];

    lines.push(`## Audit Record: ${summary.auditId}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Changed On: ${summary.changedOn || "-"}`);
    lines.push(`- Table: ${summary.tableLogicalName || "-"}`);
    lines.push(`- Record ID: ${summary.recordId || "-"}`);
    lines.push(`- Record: ${summary.recordLabel || "-"}`);
    lines.push(`- Operation: ${summary.operationLabel || "-"}`);
    lines.push(`- Action: ${summary.actionLabel || "-"}`);
    lines.push(`- User: ${summary.userName || "-"}`);
    lines.push(`- Calling User: ${summary.callingUserName || "-"}`);
    lines.push(`- Transaction ID: ${summary.transactionId || "-"}`);
    lines.push(`- Detail Type: ${detail?.detailType || "-"}`);
    lines.push(`- Summary: ${detail?.summary || summary.summary || "-"}`);

    lines.push("");
    lines.push("### Audit Summary");
    lines.push(`- Change Data: ${summary.changeData || "-"}`);
    lines.push(`- Additional Info: ${summary.additionalInfo || "-"}`);
    lines.push(`- User Additional Info: ${summary.userAdditionalInfo || "-"}`);

    if (detail?.changedFields.length) {
      lines.push("");
      lines.push("### Changed Fields");
      lines.push(
        formatTable(
          ["Field", "Old Value", "New Value"],
          detail.changedFields.map((field) => [field.logicalName, field.oldValue, field.newValue]),
        ),
      );
    }

    for (const section of detail?.sections || []) {
      lines.push("");
      lines.push(`### ${section.title}`);
      lines.push(...section.lines);
    }

    lines.push("");
    lines.push("### Raw Detail JSON");
    lines.push(
      detail?.rawDetail ? formatJson(detail.rawDetail) : "No audit detail payload returned.",
    );

    return createToolSuccessResponse(
      "get_audit_details",
      lines.join("\n"),
      `Loaded audit record '${summary.auditId}' in '${env.name}'.`,
      {
        environment: env.name,
        audit: summary,
        detail: detail
          ? {
              detailType: detail.detailType,
              summary: detail.summary,
              changedFields: detail.changedFields,
              sections: detail.sections,
              rawDetail: detail.rawDetail,
            }
          : null,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_audit_details", error);
  }
}

interface AuditRecordSummary {
  auditId: string;
  changedOn: string;
  actionLabel: string;
  operationLabel: string;
  userName: string;
  callingUserName: string | null;
  tableLogicalName: string;
  recordId: string | null;
  recordLabel: string | null;
  transactionId: string | null;
  changeData: string | null;
  additionalInfo: string | null;
  userAdditionalInfo: string | null;
  summary: string;
}

function normalizeAuditRecord(record: Record<string, unknown>): AuditRecordSummary {
  const actionLabel =
    readFormattedValue(record, "action") || normalizeText(record.action) || "(unknown)";
  const operationLabel =
    readFormattedValue(record, "operation") || normalizeText(record.operation) || "(unknown)";
  const changeData = normalizeText(record.changedata);
  const additionalInfo = normalizeText(record.additionalinfo);
  const userAdditionalInfo = normalizeText(record.useradditionalinfo);

  return {
    auditId: normalizeText(record.auditid) || "",
    changedOn: normalizeText(record.createdon) || "",
    actionLabel,
    operationLabel,
    userName:
      readFormattedValue(record, "_userid_value") ||
      readFormattedValue(record, "_callinguserid_value") ||
      "-",
    callingUserName: readFormattedValue(record, "_callinguserid_value"),
    tableLogicalName: normalizeText(record.objecttypecode) || "",
    recordId: normalizeText(record._objectid_value),
    recordLabel: readFormattedValue(record, "_objectid_value"),
    transactionId: normalizeText(record.transactionid),
    changeData,
    additionalInfo,
    userAdditionalInfo,
    summary:
      changeData || additionalInfo || userAdditionalInfo || `${operationLabel}: ${actionLabel}`,
  };
}

function readFormattedValue(record: Record<string, unknown>, fieldName: string): string | null {
  return normalizeText(record[`${fieldName}@OData.Community.Display.V1.FormattedValue`]);
}

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function formatJson(value: Record<string, unknown>): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

export const getAuditDetailsTool = defineTool({
  name: "get_audit_details",
  description:
    "Show one Dataverse audit record with full detail payload and formatted change sections.",
  schema: getAuditDetailsSchema,
  handler: handleGetAuditDetails,
});

export function registerGetAuditDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getAuditDetailsTool, { config, client });
}
