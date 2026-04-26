import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { getPluginTraceLogByIdQuery } from "../../queries/plugin-queries.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const getPluginTraceLogDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  pluginTraceLogId: z.string().describe("Plugin trace log id"),
};

type GetPluginTraceLogDetailsParams = ToolParams<typeof getPluginTraceLogDetailsSchema>;

export async function handleGetPluginTraceLogDetails(
  { environment, pluginTraceLogId }: GetPluginTraceLogDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const traceLog = await client.getPath<Record<string, unknown>>(
      env,
      `plugintracelogs(${pluginTraceLogId})`,
      getPluginTraceLogByIdQuery(),
      {
        cacheTier: CACHE_TIERS.VOLATILE,
      },
    );

    if (!traceLog) {
      throw new Error(`Plugin trace log '${pluginTraceLogId}' not found.`);
    }

    const details = normalizeTraceLogDetails(traceLog);
    const lines: string[] = [];

    lines.push(`## Plugin Trace Log: ${details.pluginTraceLogId}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Plugin Type: ${details.typeName || "-"}`);
    lines.push(`- Correlation Id: ${details.correlationId || "-"}`);
    lines.push(`- Request Id: ${details.requestId || "-"}`);
    lines.push(`- Created On: ${details.createdOn || "-"}`);
    lines.push(`- Message: ${details.messageName || "-"}`);
    lines.push(`- Primary Entity: ${details.primaryEntity || "-"}`);
    lines.push(`- Mode: ${details.modeLabel}`);
    lines.push(`- Depth: ${details.depth === null ? "-" : String(details.depth)}`);
    lines.push(
      `- Execution Duration ms: ${details.executionDurationMs === null ? "-" : String(details.executionDurationMs)}`,
    );
    lines.push(
      `- Constructor Duration ms: ${details.constructorDurationMs === null ? "-" : String(details.constructorDurationMs)}`,
    );
    lines.push(
      `- Operation Type: ${details.operationType === null ? "-" : String(details.operationType)}`,
    );
    lines.push(`- Plugin Step Id: ${details.pluginStepId || "-"}`);
    lines.push(
      `- System Created: ${details.isSystemCreated === null ? "-" : details.isSystemCreated ? "Yes" : "No"}`,
    );
    lines.push(`- Persistence Key: ${details.persistenceKey || "-"}`);
    lines.push("");
    lines.push("### Exception Details");
    lines.push(details.exceptionDetails || "None");
    lines.push("");
    lines.push("### Message Block");
    lines.push(details.messageBlock || "None");
    lines.push("");
    lines.push("### Configuration");
    lines.push(details.configuration || "None");
    lines.push("");
    lines.push("### Secure Configuration");
    lines.push(details.secureConfiguration || "None");
    lines.push("");
    lines.push("### Profile");
    lines.push(details.profile || "None");

    return createToolSuccessResponse(
      "get_plugin_trace_log_details",
      lines.join("\n"),
      `Loaded plugin trace log '${details.pluginTraceLogId}' in '${env.name}'.`,
      {
        environment: env.name,
        traceLog: details,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_plugin_trace_log_details", error);
  }
}

function normalizeTraceLogDetails(record: Record<string, unknown>) {
  const mode = getNumber(record.mode);

  return {
    pluginTraceLogId: String(record.plugintracelogid || ""),
    typeName: String(record.typename || ""),
    correlationId: String(record.correlationid || ""),
    requestId: String(record.requestid || ""),
    createdOn: String(record.createdon || ""),
    messageName: String(record.messagename || ""),
    primaryEntity: String(record.primaryentity || ""),
    mode,
    modeLabel: mode === null ? "-" : (MODE_LABELS[mode] ?? String(mode)),
    depth: getNumber(record.depth),
    executionDurationMs: getNumber(record.performanceexecutionduration),
    constructorDurationMs: getNumber(record.performanceconstructorduration),
    operationType: getNumber(record.operationtype),
    pluginStepId: String(record.pluginstepid || ""),
    isSystemCreated: getBoolean(record.issystemcreated),
    persistenceKey: String(record.persistencekey || ""),
    exceptionDetails: normalizeText(record.exceptiondetails),
    messageBlock: normalizeText(record.messageblock),
    configuration: normalizeText(record.configuration),
    secureConfiguration: normalizeText(record.secureconfiguration),
    profile: normalizeText(record.profile),
  };
}

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

function getNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === "false" || value === "0" || value === 0) {
    return false;
  }

  return null;
}

export const getPluginTraceLogDetailsTool = defineTool({
  name: "get_plugin_trace_log_details",
  description: "Show one Dataverse plug-in trace log with full runtime details.",
  schema: getPluginTraceLogDetailsSchema,
  handler: handleGetPluginTraceLogDetails,
});

export function registerGetPluginTraceLogDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getPluginTraceLogDetailsTool, { config, client });
}
