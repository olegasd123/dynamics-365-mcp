import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import type { FormType } from "../../queries/form-queries.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareFormsData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const compareFormsSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  type: z.enum(["main", "quickCreate", "card"]).optional().describe("Optional form type"),
  formName: z.string().optional().describe("Optional form name filter"),
  solution: z.string().optional().describe("Optional source solution"),
  targetSolution: z.string().optional().describe("Optional target solution"),
};

export const compareFormsTool = createComparisonTool({
  name: "compare_forms",
  description: "Compare system forms between two environments using normalized XML summaries.",
  schema: compareFormsSchema,
  comparisonLabel: "forms",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareFormsData(config, client, params.sourceEnvironment, params.targetEnvironment, {
      table: params.table,
      type: params.type as FormType | undefined,
      formName: params.formName,
      solution: params.solution,
      targetSolution: params.targetSolution,
    }),
  formatText: ({ comparison, sourceEnvironment, targetEnvironment }) => {
    const lines: string[] = [];
    const warnings = comparison.warnings || [];
    if (warnings.length > 0) {
      lines.push(...warnings.map((warning) => `Warning: ${warning}`), "");
    }
    lines.push(formatDiffResult(comparison.result, sourceEnvironment, targetEnvironment, "name"));
    return lines.join("\n");
  },
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    filters: {
      table: params.table || null,
      type: params.type || null,
      formName: params.formName || null,
      solution: params.solution || null,
      targetSolution: params.targetSolution || null,
    },
    warnings: comparison.warnings || [],
    sourceCandidateCount:
      comparison.sourceCandidateCount ??
      comparison.result.onlyInSource.length + comparison.result.differences.length,
    targetCandidateCount:
      comparison.targetCandidateCount ??
      comparison.result.onlyInTarget.length + comparison.result.differences.length,
    truncated: comparison.truncated || false,
    comparison: comparison.result,
  }),
});

export const handleCompareForms = compareFormsTool.handler;

export function registerCompareForms(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, compareFormsTool, { config, client });
}
