import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareWorkflowsData } from "./comparison-data.js";

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

type CompareWorkflowsParams = ToolParams<typeof compareWorkflowsSchema>;

export async function handleCompareWorkflows(
  { sourceEnvironment, targetEnvironment, category, workflowName }: CompareWorkflowsParams,
  { config, client }: ToolContext,
) {
  try {
    const { result } = await compareWorkflowsData(
      config,
      client,
      sourceEnvironment,
      targetEnvironment,
      {
        category: category as WorkflowCategory | undefined,
        workflowName,
      },
    );

    // Enhance diff output with human-readable labels
    for (const diff of result.differences) {
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

    const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
    return createToolSuccessResponse(
      "compare_workflows",
      text,
      `Compared workflows between '${sourceEnvironment}' and '${targetEnvironment}'.`,
      {
        sourceEnvironment,
        targetEnvironment,
        category: category || null,
        workflowName: workflowName || null,
        comparison: result,
      },
    );
  } catch (error) {
    return createToolErrorResponse("compare_workflows", error);
  }
}

export const compareWorkflowsTool = defineTool({
  name: "compare_workflows",
  description:
    "Compare workflows between two Dynamics 365 environments. Useful for checking if a workflow is enabled/disabled across environments.",
  schema: compareWorkflowsSchema,
  handler: handleCompareWorkflows,
});

export function registerCompareWorkflows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareWorkflowsTool, { config, client });
}
