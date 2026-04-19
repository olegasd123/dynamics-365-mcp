import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
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

const listWorkflowsSchema = {
  environment: z.string().optional().describe("Environment name"),
  category: z
    .enum(["workflow", "dialog", "businessrule", "action", "bpf", "modernflow"])
    .optional()
    .describe("Filter by category"),
  status: z.enum(["draft", "activated", "suspended"]).optional().describe("Filter by status"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListWorkflowsParams = ToolParams<typeof listWorkflowsSchema>;

export async function handleListWorkflows(
  { environment, category, status, solution, limit, cursor }: ListWorkflowsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    let workflows = await client.query<Record<string, unknown>>(
      env,
      "workflows",
      listWorkflowsQuery({
        category: category as WorkflowCategory | undefined,
        status: status as WorkflowState | undefined,
      }),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );

    if (solution) {
      const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
      workflows = workflows.filter((workflow) =>
        solutionComponents.workflowIds.has(String(workflow.workflowid || "")),
      );
    }

    const items = workflows
      .map((workflow) => ({
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
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) || left.uniqueName.localeCompare(right.uniqueName),
      );
    const page = buildPaginatedListData(
      items,
      {
        environment: env.name,
        filters: {
          category: category || null,
          status: status || null,
          solution: solution || null,
        },
      },
      { limit, cursor },
    );

    if (page.totalCount === 0) {
      const text = `No workflows found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_workflows", text, text, page);
    }

    const headers = ["Name", "Category", "Status", "Entity", "Managed", "Modified"];
    const rows = page.items.map((workflow) => [
      workflow.name,
      workflow.categoryLabel,
      workflow.statusLabel,
      workflow.primaryEntity,
      workflow.isManaged ? "Yes" : "No",
      workflow.modifiedOn,
    ]);

    const filterDesc = [
      category ? `category=${category}` : "",
      status ? `status=${status}` : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");
    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "workflow",
      itemLabelPlural: "workflows",
      narrowHint: page.hasMore
        ? "Use category, status, or solution to narrow the result."
        : undefined,
    });

    const text = `## Workflows in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(headers, rows)}`;
    return createToolSuccessResponse(
      "list_workflows",
      text,
      `${pageSummary} Environment: '${env.name}'.`,
      page,
    );
  } catch (error) {
    return createToolErrorResponse("list_workflows", error);
  }
}

export const listWorkflowsTool = defineTool({
  name: "list_workflows",
  description: "List workflows and processes in Dynamics 365 with their status.",
  schema: listWorkflowsSchema,
  handler: handleListWorkflows,
});

export function registerListWorkflows(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listWorkflowsTool, { config, client });
}
