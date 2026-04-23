import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { diffCollections, type DiffResult } from "../../utils/diff.js";
import { buildMatrixReport, formatMatrixStatus, type MatrixReport } from "./matrix-helpers.js";
import { listEnvironmentVariables, type EnvironmentVariableRecord } from "../alm/alm-metadata.js";

const MODE_LABELS = {
  definitions: "Definitions",
  values: "Current Values",
  effective: "Effective Values",
} as const;

type CompareMode = keyof typeof MODE_LABELS;

interface VariableDifferenceField {
  field: string;
  baselineValue: string;
  targetValue: string;
}

interface VariableDifferenceDetail {
  key: string;
  fieldsByEnvironment: Record<string, VariableDifferenceField[]>;
}

interface VariableMatrixSection {
  mode: CompareMode;
  title: string;
  text: string;
  report: MatrixReport;
  differences: VariableDifferenceDetail[];
}

interface VariableSnapshot {
  environment: string;
  sourceItems: EnvironmentVariableRecord[];
  targetItems: EnvironmentVariableRecord[];
  result: DiffResult<EnvironmentVariableRecord>;
}

const compareEnvironmentVariableMatrixSchema = {
  baselineEnvironment: z
    .string()
    .optional()
    .describe("Baseline environment name. Default: configured default environment"),
  targetEnvironments: z
    .array(z.string())
    .optional()
    .describe("Target environment names. Default: all configured environments except baseline"),
  nameFilter: z.string().optional().describe("Optional filter for schema name or display name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  compareMode: z
    .enum(["definitions", "values", "effective", "all"])
    .optional()
    .describe(
      "Compare definition metadata, current values, effective values, or all sections. Default: all",
    ),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max drift rows per section. Default: 30"),
};

type CompareEnvironmentVariableMatrixParams = ToolParams<
  typeof compareEnvironmentVariableMatrixSchema
>;

export async function handleCompareEnvironmentVariableMatrix(
  {
    baselineEnvironment,
    targetEnvironments,
    nameFilter,
    solution,
    compareMode,
    maxRows,
  }: CompareEnvironmentVariableMatrixParams,
  { config, client }: ToolContext,
) {
  try {
    const baselineName = baselineEnvironment || config.defaultEnvironment;
    getEnvironment(config, baselineName);

    const resolvedTargetNames = resolveTargetEnvironments(config, baselineName, targetEnvironments);
    if (resolvedTargetNames.length === 0) {
      return createToolErrorResponse(
        "compare_environment_variable_matrix",
        `No target environments found for baseline '${baselineName}'.`,
      );
    }

    const selectedModes = resolveCompareModes(compareMode);
    const rowLimit = maxRows ?? 30;
    const recordsByEnvironment = await loadEnvironmentVariables(
      config,
      client,
      baselineName,
      resolvedTargetNames,
      {
        nameFilter,
        solution,
      },
    );

    const baselineItems = recordsByEnvironment.get(baselineName) || [];
    const sections = selectedModes.map((mode) =>
      buildVariableSection(
        mode,
        baselineName,
        baselineItems,
        resolvedTargetNames,
        recordsByEnvironment,
        rowLimit,
      ),
    );

    const lines: string[] = [];
    lines.push("## Environment Variable Matrix");
    lines.push(`- **Baseline**: ${baselineName}`);
    lines.push(`- **Targets**: ${resolvedTargetNames.join(", ")}`);
    lines.push(`- **Sections**: ${selectedModes.map((mode) => MODE_LABELS[mode]).join(", ")}`);
    if (nameFilter || solution) {
      const filterParts = [
        nameFilter ? `name contains=${nameFilter}` : "",
        solution ? `solution=${solution}` : "",
      ].filter(Boolean);
      lines.push(`- **Filters**: ${filterParts.join("; ")}`);
    }

    for (const section of sections) {
      lines.push("");
      lines.push(section.text);
    }

    return createToolSuccessResponse(
      "compare_environment_variable_matrix",
      lines.join("\n"),
      `Compared environment variables in '${baselineName}' against ${resolvedTargetNames.length} environment(s).`,
      {
        baselineEnvironment: baselineName,
        targetEnvironments: resolvedTargetNames,
        compareModes: selectedModes,
        filters: {
          nameFilter: nameFilter || null,
          solution: solution || null,
        },
        maxRows: rowLimit,
        sections: sections.map((section) => ({
          mode: section.mode,
          title: section.title,
          report: section.report,
          differences: section.differences,
        })),
      },
    );
  } catch (error) {
    return createToolErrorResponse("compare_environment_variable_matrix", error);
  }
}

export const compareEnvironmentVariableMatrixTool = defineTool({
  name: "compare_environment_variable_matrix",
  description:
    "Compare environment variable definitions, current values, or effective values across one baseline environment and many target environments.",
  schema: compareEnvironmentVariableMatrixSchema,
  handler: handleCompareEnvironmentVariableMatrix,
});

export function registerCompareEnvironmentVariableMatrix(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareEnvironmentVariableMatrixTool, { config, client });
}

async function loadEnvironmentVariables(
  config: AppConfig,
  client: DynamicsClient,
  baselineName: string,
  targetNames: string[],
  options: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<Map<string, EnvironmentVariableRecord[]>> {
  const environmentNames = [baselineName, ...targetNames];
  const entries = await Promise.all(
    environmentNames.map(async (environmentName) => {
      const environment = getEnvironment(config, environmentName);
      const items = await listEnvironmentVariables(environment, client, options);
      return [environmentName, items] as const;
    }),
  );

  return new Map(entries);
}

function buildVariableSection(
  mode: CompareMode,
  baselineName: string,
  baselineItems: EnvironmentVariableRecord[],
  targetNames: string[],
  recordsByEnvironment: Map<string, EnvironmentVariableRecord[]>,
  maxRows: number,
): VariableMatrixSection {
  const compareFields = getCompareFields(mode);
  const snapshots: VariableSnapshot[] = targetNames.map((targetName) => {
    const targetItems = recordsByEnvironment.get(targetName) || [];
    return {
      environment: targetName,
      sourceItems: baselineItems,
      targetItems,
      result: diffCollections(
        baselineItems,
        targetItems,
        (item) => String(item.schemaname),
        compareFields,
      ),
    };
  });

  const report = buildMatrixReport(snapshots, (item) => String(item.schemaname), maxRows);
  const differences = buildDifferenceDetails(snapshots, report);
  const title = MODE_LABELS[mode];

  return {
    mode,
    title,
    text: renderVariableSection(title, baselineName, targetNames, report, differences),
    report,
    differences,
  };
}

function renderVariableSection(
  title: string,
  baselineName: string,
  targetNames: string[],
  report: MatrixReport,
  differences: VariableDifferenceDetail[],
): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push("");
  lines.push(
    formatTable(
      ["Environment", "Matching", "Diff", `Missing vs ${baselineName}`, "Extra", "Status"],
      report.summaries.map((summary) => [
        summary.environment,
        String(summary.matching),
        String(summary.differences),
        String(summary.onlyInBaseline),
        String(summary.onlyInTarget),
        summary.differences === 0 && summary.onlyInBaseline === 0 && summary.onlyInTarget === 0
          ? "Aligned"
          : "Drift",
      ]),
    ),
  );

  if (report.totalDriftRows === 0) {
    lines.push("");
    lines.push("No drift found.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push(`Drift rows: ${report.totalDriftRows}`);
  lines.push("");
  lines.push(
    formatTable(
      ["Schema Name", ...targetNames],
      report.rows.map((row) => [
        row.key,
        ...targetNames.map((targetName) =>
          formatMatrixStatus(row.statuses[targetName] || "absent"),
        ),
      ]),
    ),
  );

  if (report.omittedRowCount > 0) {
    lines.push("");
    lines.push(
      `Showing first ${report.rows.length} drift row(s). Omitted: ${report.omittedRowCount}.`,
    );
  }

  if (differences.length > 0) {
    lines.push("");
    lines.push("Field differences:");
    for (const detail of differences) {
      const parts = Object.entries(detail.fieldsByEnvironment)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([environment, fields]) =>
            `${environment}: ${fields
              .map((field) => `${field.field} (${field.baselineValue} -> ${field.targetValue})`)
              .join("; ")}`,
        );
      lines.push(`- ${detail.key}: ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function buildDifferenceDetails(
  snapshots: VariableSnapshot[],
  report: MatrixReport,
): VariableDifferenceDetail[] {
  const includedKeys = new Set(report.rows.map((row) => row.key));
  const detailsByKey = new Map<string, Record<string, VariableDifferenceField[]>>();

  for (const snapshot of snapshots) {
    for (const diff of snapshot.result.differences) {
      if (!includedKeys.has(diff.key)) {
        continue;
      }

      detailsByKey.set(diff.key, {
        ...(detailsByKey.get(diff.key) || {}),
        [snapshot.environment]: diff.changedFields.map((field) => ({
          field: field.field,
          baselineValue: formatDiffValue(field.sourceValue),
          targetValue: formatDiffValue(field.targetValue),
        })),
      });
    }
  }

  return [...detailsByKey.entries()]
    .map(([key, fieldsByEnvironment]) => ({
      key,
      fieldsByEnvironment,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function resolveTargetEnvironments(
  config: AppConfig,
  baselineName: string,
  targetNames?: string[],
): string[] {
  const names =
    targetNames && targetNames.length > 0
      ? targetNames
      : config.environments
          .map((environment) => environment.name)
          .filter((environmentName) => environmentName !== baselineName);

  const uniqueNames = [...new Set(names)];
  for (const name of uniqueNames) {
    if (name === baselineName) {
      continue;
    }
    getEnvironment(config, name);
  }

  return uniqueNames.filter((name) => name !== baselineName);
}

function resolveCompareModes(
  compareMode?: "definitions" | "values" | "effective" | "all",
): CompareMode[] {
  if (!compareMode || compareMode === "all") {
    return ["definitions", "values", "effective"];
  }
  return [compareMode];
}

function getCompareFields(mode: CompareMode): string[] {
  switch (mode) {
    case "definitions":
      return ["displayname", "typeLabel", "defaultvalue", "valueschema", "ismanaged"];
    case "values":
      return ["hasCurrentValue", "currentValue"];
    case "effective":
      return ["effectiveValue"];
  }
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value || "(empty)";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}
