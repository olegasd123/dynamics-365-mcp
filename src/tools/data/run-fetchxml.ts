import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_LIMIT_SCHEMA,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { resolveTable } from "../tables/table-metadata.js";
import { normalizeXml } from "../../utils/xml-metadata.js";

const DEFAULT_FETCHXML_LIMIT = 50;
const MAX_FETCHXML_LIMIT = 200;
const PREVIEW_ROW_COUNT = 10;

const runFetchXmlSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
  fetchXml: z
    .string()
    .min(1)
    .describe("FetchXML query. Read-only queries only. The root entity must match the table."),
  limit: LIST_LIMIT_SCHEMA.describe(
    `Optional row cap for this query. Defaults to ${DEFAULT_FETCHXML_LIMIT} unless the FetchXML already has a smaller top/count.`,
  ),
};

type RunFetchXmlParams = ToolParams<typeof runFetchXmlSchema>;

interface RunFetchXmlSettings {
  allowedEnvironments: string[] | null;
  defaultLimit: number;
  maxLimit: number;
}

export async function handleRunFetchXml(
  { environment, table, fetchXml, limit }: RunFetchXmlParams,
  { config, client }: ToolContext,
) {
  try {
    assertRunFetchXmlEnabled(config);
    const env = getEnvironment(config, environment);
    const settings = getRunFetchXmlSettings(config);
    assertEnvironmentAllowed(settings, env.name);

    const resolvedTable = await resolveTable(env, client, table);
    const normalizedFetchXml = normalizeXml(fetchXml);
    const fetchEntityName = readFetchXmlEntityName(normalizedFetchXml);
    if (!fetchEntityName) {
      throw new Error("FetchXML must contain an <entity name='...'> node.");
    }
    if (fetchEntityName.toLowerCase() !== resolvedTable.logicalName.toLowerCase()) {
      throw new Error(
        `FetchXML entity '${fetchEntityName}' does not match table '${resolvedTable.logicalName}'.`,
      );
    }

    const existingLimit = readExistingFetchLimit(normalizedFetchXml);
    if (existingLimit !== null && existingLimit > settings.maxLimit) {
      throw new Error(
        `FetchXML requests ${existingLimit} rows, which exceeds the configured maxLimit ${settings.maxLimit}.`,
      );
    }

    const limitSource =
      limit !== undefined ? "input" : existingLimit !== null ? "fetchXml" : "default";
    const appliedLimit = limit ?? existingLimit ?? settings.defaultLimit;
    if (appliedLimit > settings.maxLimit) {
      throw new Error(
        `Requested limit ${appliedLimit} exceeds the configured maxLimit ${settings.maxLimit}.`,
      );
    }

    const cappedFetchXml =
      limit !== undefined || existingLimit === null
        ? applyFetchXmlLimit(normalizedFetchXml, appliedLimit)
        : normalizedFetchXml;
    const items = await client.queryPath<Record<string, unknown>>(
      env,
      resolvedTable.entitySetName,
      `fetchXml=${encodeURIComponent(cappedFetchXml)}`,
      {
        maxPages: 1,
      },
    );
    const previewItems = items.slice(0, PREVIEW_ROW_COUNT);
    const previewLabel =
      items.length > previewItems.length
        ? `Preview Rows (${previewItems.length} of ${items.length})`
        : `Rows (${items.length})`;
    const text = [
      `## FetchXML results for '${resolvedTable.logicalName}' in '${env.name}'`,
      "",
      `- Returned Rows: ${items.length}`,
      `- Applied Limit: ${appliedLimit} (${limitSource})`,
      `- Entity Set: ${resolvedTable.entitySetName}`,
      "",
      "### FetchXML",
      "",
      "```xml",
      cappedFetchXml,
      "```",
      "",
      `### ${previewLabel}`,
      "",
      "```json",
      JSON.stringify(previewItems, null, 2),
      "```",
    ].join("\n");

    return createToolSuccessResponse(
      "run_fetchxml",
      text,
      `FetchXML returned ${items.length} row${items.length === 1 ? "" : "s"} from '${resolvedTable.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: resolvedTable,
        entityName: fetchEntityName,
        entitySetName: resolvedTable.entitySetName,
        appliedLimit,
        limitSource,
        maxLimit: settings.maxLimit,
        fetchXml: cappedFetchXml,
        returnedCount: items.length,
        previewCount: previewItems.length,
        items,
      },
    );
  } catch (error) {
    return createToolErrorResponse("run_fetchxml", error);
  }
}

export const runFetchXmlTool = defineTool({
  name: "run_fetchxml",
  description:
    "Run a read-only FetchXML query against one Dataverse table as an advanced escape hatch. Disabled unless advancedQueries.fetchXml.enabled is true.",
  schema: runFetchXmlSchema,
  handler: handleRunFetchXml,
});

export function registerRunFetchXml(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, runFetchXmlTool, { config, client });
}

export function isRunFetchXmlEnabled(config: AppConfig): boolean {
  return config.advancedQueries?.fetchXml?.enabled === true;
}

export function getRunFetchXmlSettings(config: AppConfig): RunFetchXmlSettings {
  return {
    allowedEnvironments: config.advancedQueries?.fetchXml?.allowedEnvironments ?? null,
    defaultLimit: config.advancedQueries?.fetchXml?.defaultLimit ?? DEFAULT_FETCHXML_LIMIT,
    maxLimit: config.advancedQueries?.fetchXml?.maxLimit ?? MAX_FETCHXML_LIMIT,
  };
}

function assertRunFetchXmlEnabled(config: AppConfig): void {
  if (isRunFetchXmlEnabled(config)) {
    return;
  }

  throw new Error(
    "Tool 'run_fetchxml' is disabled. Set advancedQueries.fetchXml.enabled=true in the config file to register it.",
  );
}

function assertEnvironmentAllowed(settings: RunFetchXmlSettings, environmentName: string): void {
  if (!settings.allowedEnvironments || settings.allowedEnvironments.includes(environmentName)) {
    return;
  }

  throw new Error(
    `Environment '${environmentName}' is not allowed for run_fetchxml. Allowed environments: ${settings.allowedEnvironments.join(", ")}.`,
  );
}

function readFetchXmlEntityName(fetchXml: string): string | null {
  const match = fetchXml.match(/<entity\b[^>]*\bname=(["'])(.*?)\1/i);
  return match?.[2] || null;
}

function readExistingFetchLimit(fetchXml: string): number | null {
  const count = readFetchAttributeNumber(fetchXml, "count");
  const top = readFetchAttributeNumber(fetchXml, "top");
  if (count === null && top === null) {
    return null;
  }

  return count === null ? top : top === null ? count : Math.min(count, top);
}

function readFetchAttributeNumber(fetchXml: string, attributeName: string): number | null {
  const match = fetchXml.match(
    new RegExp(`<fetch\\b[^>]*\\b${escapeRegExp(attributeName)}=(["'])(\\d+)\\1`, "i"),
  );
  if (!match?.[2]) {
    return null;
  }

  const value = Number.parseInt(match[2], 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function applyFetchXmlLimit(fetchXml: string, limit: number): string {
  let updated = setFetchAttribute(fetchXml, "count", String(limit));
  if (readFetchAttributeNumber(updated, "top") !== null) {
    updated = setFetchAttribute(updated, "top", String(limit));
  }

  return updated;
}

function setFetchAttribute(
  fetchXml: string,
  attributeName: string,
  attributeValue: string,
): string {
  return fetchXml.replace(/<fetch\b([^>]*)>/i, (_match, rawAttributes: string) => {
    const attrRegex = new RegExp(`\\b${escapeRegExp(attributeName)}=(["']).*?\\1`, "i");
    const nextAttributes = attrRegex.test(rawAttributes)
      ? rawAttributes.replace(attrRegex, `${attributeName}='${attributeValue}'`)
      : `${rawAttributes} ${attributeName}='${attributeValue}'`;

    return `<fetch${normalizeFetchAttributes(nextAttributes)}>`;
  });
}

function normalizeFetchAttributes(attributes: string): string {
  const trimmed = attributes.trim();
  return trimmed ? ` ${trimmed}` : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
