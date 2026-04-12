import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { compareWorkflowsData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};
const STATE_LABELS: Record<number, string> = { 0: "Draft", 1: "Activated", 2: "Suspended" };

const compareWorkflowsSchema = {
  sourceEnvironment: z.string().describe("Source environment name (e.g. 'dev')"),
  targetEnvironment: z.string().describe("Target environment name (e.g. 'test')"),
  category: z
    .enum(["workflow", "dialog", "businessrule", "action", "bpf", "modernflow"])
    .optional()
    .describe("Filter by category"),
  workflowName: z.string().optional().describe("Compare a specific workflow by name"),
};

export const compareWorkflowsTool = createComparisonTool({
  name: "compare_workflows",
  description:
    "Compare workflows between two Dynamics 365 environments. Useful for checking if a workflow is enabled/disabled across environments.",
  schema: compareWorkflowsSchema,
  comparisonLabel: "workflows",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareWorkflowsData(config, client, params.sourceEnvironment, params.targetEnvironment, {
      category: params.category as WorkflowCategory | undefined,
      workflowName: params.workflowName,
    }),
  prepareComparison: ({ comparison }) => {
    for (const diff of comparison.result.differences) {
      for (const change of diff.changedFields) {
        if (change.field === "statecode") {
          change.sourceValue = STATE_LABELS[change.sourceValue as number] || change.sourceValue;
          change.targetValue = STATE_LABELS[change.targetValue as number] || change.targetValue;
        }
        if (change.field === "category") {
          change.sourceValue = CATEGORY_LABELS[change.sourceValue as number] || change.sourceValue;
          change.targetValue = CATEGORY_LABELS[change.targetValue as number] || change.targetValue;
        }
      }
    }
  },
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    category: params.category || null,
    workflowName: params.workflowName || null,
    comparison: comparison.result,
  }),
});

export const handleCompareWorkflows = compareWorkflowsTool.handler;

export function registerCompareWorkflows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareWorkflowsTool, { config, client });
}
