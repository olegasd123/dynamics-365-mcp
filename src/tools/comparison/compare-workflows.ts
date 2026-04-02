import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { diffCollections } from "../../utils/diff.js";
import { formatDiffResult } from "../../utils/formatters.js";

const CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};
const STATE_LABELS: Record<number, string> = { 0: "Draft", 1: "Activated", 2: "Suspended" };

export function registerCompareWorkflows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_workflows",
    "Compare workflows between two Dynamics 365 environments. Useful for checking if a workflow is enabled/disabled across environments.",
    {
      sourceEnvironment: z.string().describe("Source environment name (e.g. 'dev')"),
      targetEnvironment: z.string().describe("Target environment name (e.g. 'test')"),
      category: z
        .enum(["workflow", "dialog", "businessrule", "action", "bpf", "modernflow"])
        .optional()
        .describe("Filter by category"),
      workflowName: z.string().optional().describe("Compare a specific workflow by name"),
    },
    async ({ sourceEnvironment, targetEnvironment, category, workflowName }) => {
      try {
        const sourceEnv = getEnvironment(config, sourceEnvironment);
        const targetEnv = getEnvironment(config, targetEnvironment);

        const queryParams = listWorkflowsQuery({
          category: category as WorkflowCategory | undefined,
        });

        const [sourceWorkflows, targetWorkflows] = await Promise.all([
          client.query<Record<string, unknown>>(sourceEnv, "workflows", queryParams),
          client.query<Record<string, unknown>>(targetEnv, "workflows", queryParams),
        ]);

        let source = sourceWorkflows;
        let target = targetWorkflows;

        if (workflowName) {
          const nameLower = workflowName.toLowerCase();
          source = source.filter((w) => String(w.name).toLowerCase().includes(nameLower));
          target = target.filter((w) => String(w.name).toLowerCase().includes(nameLower));
        }

        const result = diffCollections(source, target, (w) => String(w.uniquename || w.name), [
          "statecode",
          "statuscode",
          "category",
          "mode",
          "ismanaged",
        ]);

        // Enhance diff output with human-readable labels
        for (const diff of result.differences) {
          for (const change of diff.changedFields) {
            if (change.field === "statecode") {
              change.sourceValue = STATE_LABELS[change.sourceValue as number] || change.sourceValue;
              change.targetValue = STATE_LABELS[change.targetValue as number] || change.targetValue;
            }
            if (change.field === "category") {
              change.sourceValue =
                CATEGORY_LABELS[change.sourceValue as number] || change.sourceValue;
              change.targetValue =
                CATEGORY_LABELS[change.targetValue as number] || change.targetValue;
            }
          }
        }

        const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
