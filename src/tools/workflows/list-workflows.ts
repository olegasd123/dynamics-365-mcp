import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import type { WorkflowCategory, WorkflowState } from "../../queries/workflow-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";

const CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};

const STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

export function registerListWorkflows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_workflows",
    "List workflows and processes in Dynamics 365 with their status.",
    {
      environment: z.string().optional().describe("Environment name"),
      category: z
        .enum(["workflow", "dialog", "businessrule", "action", "bpf", "modernflow"])
        .optional()
        .describe("Filter by category"),
      status: z.enum(["draft", "activated", "suspended"]).optional().describe("Filter by status"),
      solution: z
        .string()
        .optional()
        .describe("Optional solution display name or unique name"),
    },
    async ({ environment, category, status, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        let workflows = await client.query<Record<string, unknown>>(
          env,
          "workflows",
          listWorkflowsQuery({
            category: category as WorkflowCategory | undefined,
            status: status as WorkflowState | undefined,
          }),
        );

        if (solution) {
          const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
          workflows = workflows.filter((workflow) =>
            solutionComponents.workflowIds.has(String(workflow.workflowid || "")),
          );
        }

        const items = workflows.map((workflow) => ({
          workflowid: String(workflow.workflowid || ""),
          name: String(workflow.name || ""),
          uniqueName: String(workflow.uniquename || ""),
          category: Number(workflow.category || 0),
          categoryLabel: CATEGORY_LABELS[workflow.category as number] || String(workflow.category),
          status: Number(workflow.statecode || 0),
          statusLabel: STATE_LABELS[workflow.statecode as number] || String(workflow.statecode),
          primaryEntity: String(workflow.primaryentity || "none"),
          isManaged: Boolean(workflow.ismanaged),
          modifiedOn: String(workflow.modifiedon || "").slice(0, 10),
        }));

        if (workflows.length === 0) {
          const text = `No workflows found in '${env.name}' with the specified filters.`;
          return createToolSuccessResponse("list_workflows", text, text, {
            environment: env.name,
            filters: {
              category: category || null,
              status: status || null,
              solution: solution || null,
            },
            count: 0,
            items: [],
          });
        }

        const headers = ["Name", "Category", "Status", "Entity", "Managed", "Modified"];
        const rows = workflows.map((w) => [
          String(w.name || ""),
          CATEGORY_LABELS[w.category as number] || String(w.category),
          STATE_LABELS[w.statecode as number] || String(w.statecode),
          String(w.primaryentity || "none"),
          w.ismanaged ? "Yes" : "No",
          String(w.modifiedon || "").slice(0, 10),
        ]);

        const filterDesc = [
          category ? `category=${category}` : "",
          status ? `status=${status}` : "",
          solution ? `solution='${solution}'` : "",
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Workflows in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${workflows.length} workflow(s).\n\n${formatTable(headers, rows)}`;
        return createToolSuccessResponse(
          "list_workflows",
          text,
          `Found ${workflows.length} workflow(s) in '${env.name}'.`,
          {
            environment: env.name,
            filters: {
              category: category || null,
              status: status || null,
              solution: solution || null,
            },
            count: workflows.length,
            items,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_workflows", error);
      }
    },
  );
}
