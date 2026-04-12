import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { analyzeImpact, type ImpactAnalysisResult } from "./impact-analysis.js";

const analyzeImpactSchema = {
  environment: z.string().optional().describe("Environment name"),
  componentType: z
    .enum(["table", "column", "plugin", "workflow", "flow", "web_resource", "solution"])
    .describe("Component type to analyze. Use 'plugin' for plugin assembly impact."),
  name: z.string().describe("Component name, unique name, or other main identifier"),
  table: z
    .string()
    .optional()
    .describe("Optional table for column impact. You can also use table.column in 'name'."),
  solution: z.string().optional().describe("Optional solution filter for cloud flow impact"),
  maxDependencies: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max dependency rows to include. Default: 100"),
};

type AnalyzeImpactParams = ToolParams<typeof analyzeImpactSchema>;

export async function handleAnalyzeImpact(
  { environment, componentType, name, table, solution, maxDependencies }: AnalyzeImpactParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const result = await analyzeImpact(env, client, {
      componentType,
      name,
      table,
      solution,
      maxDependencies,
    });
    const text = renderImpactText(env.name, result);

    return createToolSuccessResponse(
      "analyze_impact",
      text,
      `Analyzed ${componentType} impact for '${result.target.displayName}' in '${env.name}'.`,
      {
        environment: env.name,
        analysis: result,
      },
    );
  } catch (error) {
    return createToolErrorResponse("analyze_impact", error);
  }
}

export const analyzeImpactTool = defineTool({
  name: "analyze_impact",
  description:
    "Analyze likely impact for a table, column, plugin assembly, workflow, cloud flow, web resource, or solution.",
  schema: analyzeImpactSchema,
  handler: handleAnalyzeImpact,
});

export function registerAnalyzeImpact(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, analyzeImpactTool, { config, client });
}

function renderImpactText(environment: string, result: ImpactAnalysisResult): string {
  const lines: string[] = [];

  lines.push(
    `## Impact Analysis: ${result.target.componentTypeLabel} ${result.target.displayName}`,
  );
  lines.push(`- Environment: ${environment}`);
  lines.push(`- Risk Level: ${result.summary.riskLevel}`);
  lines.push(`- Total References: ${result.summary.totalReferences}`);
  lines.push(`- Dependency Rows: ${result.dependencyCountTotal}`);
  lines.push(`- External Dependencies: ${result.summary.externalDependencyCount}`);
  lines.push(`- Likely Affected Areas: ${result.summary.likelyAffectedAreas.join(", ") || "none"}`);

  if (result.target.parentName) {
    lines.push(`- Parent: ${result.target.parentName}`);
  }
  if (result.target.solution) {
    lines.push(`- Solution Filter: ${result.target.solution}`);
  }
  if (result.warnings.length > 0) {
    lines.push(`- Warnings: ${result.warnings.join(" | ")}`);
  }

  appendMetadata(lines, result.metadata);
  appendSection(
    lines,
    "Plugin Steps",
    ["Assembly", "Step", "Message", "Entity"],
    result.sections.pluginSteps,
    (item) => [
      String((item as Record<string, unknown>).assemblyName || "-"),
      String((item as Record<string, unknown>).name || "-"),
      String((item as Record<string, unknown>).messageName || "-"),
      String((item as Record<string, unknown>).primaryEntity || "-"),
    ],
  );
  appendSection(
    lines,
    "Plugin Images",
    ["Assembly", "Step", "Image"],
    result.sections.pluginImages,
    (item) => [
      String((item as Record<string, unknown>).assemblyName || "-"),
      String((item as Record<string, unknown>).stepName || "-"),
      String((item as Record<string, unknown>).name || "-"),
    ],
  );
  appendSection(
    lines,
    "Workflows",
    ["Name", "Unique Name", "Category"],
    result.sections.workflows,
    (item) => [
      String((item as Record<string, unknown>).name || "-"),
      String((item as Record<string, unknown>).uniqueName || "-"),
      String((item as Record<string, unknown>).category || "-"),
    ],
  );
  appendSection(lines, "Forms", ["Table", "Name", "Type"], result.sections.forms, (item) => [
    String(
      (item as Record<string, unknown>).table ||
        (item as Record<string, unknown>).objecttypecode ||
        "-",
    ),
    String((item as Record<string, unknown>).name || "-"),
    String((item as Record<string, unknown>).typeLabel || "-"),
  ]);
  appendSection(lines, "Views", ["Table", "Name", "Scope"], result.sections.views, (item) => [
    String(
      (item as Record<string, unknown>).table ||
        (item as Record<string, unknown>).returnedtypecode ||
        "-",
    ),
    String((item as Record<string, unknown>).name || "-"),
    String(
      (item as Record<string, unknown>).scope ||
        (item as Record<string, unknown>).queryTypeLabel ||
        "-",
    ),
  ]);
  appendSection(
    lines,
    "Custom APIs",
    ["Name", "Unique Name", "Usage"],
    result.sections.customApis,
    (item) => [
      String((item as Record<string, unknown>).name || "-"),
      String((item as Record<string, unknown>).uniqueName || "-"),
      String((item as Record<string, unknown>).usage || "-"),
    ],
  );
  appendSection(
    lines,
    "Cloud Flows",
    ["Name", "Unique Name"],
    result.sections.cloudFlows,
    (item) => [
      String((item as Record<string, unknown>).name || "-"),
      String((item as Record<string, unknown>).uniqueName || "-"),
    ],
  );
  appendSection(
    lines,
    "Relationships",
    ["Schema Name", "Kind", "Related", "Details"],
    result.sections.relationships,
    (item) => [
      String((item as Record<string, unknown>).schemaName || "-"),
      String((item as Record<string, unknown>).kind || "-"),
      String(
        (item as Record<string, unknown>).relatedTable ||
          (item as Record<string, unknown>).referencedEntity ||
          "-",
      ),
      String((item as Record<string, unknown>).details || "-"),
    ],
  );
  appendSection(lines, "Web Resources", ["Name", "Type"], result.sections.webResources, (item) => [
    String((item as Record<string, unknown>).name || "-"),
    String((item as Record<string, unknown>).type || "-"),
  ]);
  appendSection(lines, "Connections", ["Name"], result.sections.connections, (item) => [
    String((item as Record<string, unknown>).name || "-"),
  ]);
  appendSection(lines, "Triggers", ["Name"], result.sections.triggers, (item) => [
    String((item as Record<string, unknown>).name || "-"),
  ]);
  appendSection(lines, "Actions", ["Name"], result.sections.actions, (item) => [
    String((item as Record<string, unknown>).name || "-"),
  ]);
  appendSection(
    lines,
    "Solution Components",
    ["Type", "Count"],
    result.sections.componentSummary,
    (item) => [
      String((item as Record<string, unknown>).type || "-"),
      String((item as Record<string, unknown>).count || "0"),
    ],
  );
  appendSection(
    lines,
    "Dependencies",
    ["Relation", "Component", "Other Component", "In Scope", "Type"],
    result.sections.dependencies,
    (item) => [
      String((item as Record<string, unknown>).relation || "-"),
      `${String((item as Record<string, unknown>).sourceName || "-")} (${String((item as Record<string, unknown>).sourceType || "-")})`,
      `${String((item as Record<string, unknown>).otherName || "-")} (${String((item as Record<string, unknown>).otherType || "-")})`,
      formatInScope((item as Record<string, unknown>).inScope as boolean | null | undefined),
      String((item as Record<string, unknown>).dependencyTypeLabel || "-"),
    ],
  );

  return lines.join("\n");
}

function appendMetadata(lines: string[], metadata?: Record<string, unknown>): void {
  if (!metadata) {
    return;
  }

  const rows = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => [humanizeKey(key), formatMetadataValue(value)]);

  if (rows.length === 0) {
    return;
  }

  lines.push("");
  lines.push("### Target Details");
  lines.push(formatTable(["Field", "Value"], rows));
}

function appendSection(
  lines: string[],
  title: string,
  headers: string[],
  items: unknown[] | undefined,
  mapRow: (item: unknown) => string[],
): void {
  if (!items || items.length === 0) {
    return;
  }

  lines.push("");
  lines.push(`### ${title}`);
  lines.push(formatTable(headers, items.map(mapRow)));
}

function formatInScope(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return value ? "Yes" : "No";
}

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ") || "-";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}
