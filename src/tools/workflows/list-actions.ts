import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { listActionsQuery } from "../../queries/workflow-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";

const STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

const listActionsSchema = {
  environment: z.string().optional().describe("Environment name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type ListActionsParams = ToolParams<typeof listActionsSchema>;

export async function handleListActions(
  { environment, solution }: ListActionsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    let actions = await client.query<Record<string, unknown>>(
      env,
      "workflows",
      listActionsQuery(),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );

    if (solution) {
      const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
      actions = actions.filter((action) =>
        solutionComponents.workflowIds.has(String(action.workflowid || "")),
      );
    }

    if (actions.length === 0) {
      const text = `No custom actions found in '${env.name}'${solution ? ` for solution '${solution}'.` : "."}`;
      return createToolSuccessResponse("list_actions", text, text, {
        environment: env.name,
        solution: solution || null,
        count: 0,
        items: [],
      });
    }

    const headers = ["Name", "Unique Name", "Status", "Entity", "Managed", "Modified"];
    const rows = actions.map((a) => [
      String(a.name || ""),
      String(a.uniquename || ""),
      STATE_LABELS[a.statecode as number] || String(a.statecode),
      String(a.primaryentity || "none"),
      a.ismanaged ? "Yes" : "No",
      String(a.modifiedon || "").slice(0, 10),
    ]);

    const items = actions.map((action) => ({
      ...action,
      stateLabel: STATE_LABELS[action.statecode as number] || String(action.statecode),
    }));
    const text = `## Custom Actions in '${env.name}'${solution ? ` (solution='${solution}')` : ""}\n\nFound ${actions.length} action(s).\n\n${formatTable(headers, rows)}`;
    return createToolSuccessResponse(
      "list_actions",
      text,
      `Found ${actions.length} custom action(s) in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        count: actions.length,
        items,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_actions", error);
  }
}

export const listActionsTool = defineTool({
  name: "list_actions",
  description: "List custom actions registered in Dynamics 365.",
  schema: listActionsSchema,
  handler: handleListActions,
});

export function registerListActions(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listActionsTool, { config, client });
}
