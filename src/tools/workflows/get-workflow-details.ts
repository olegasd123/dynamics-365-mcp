import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { getWorkflowDetailsByIdentityQuery } from "../../queries/workflow-queries.js";

const CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};
const STATE_LABELS: Record<number, string> = { 0: "Draft", 1: "Activated", 2: "Suspended" };
const MODE_LABELS: Record<number, string> = { 0: "Background", 1: "Real-time" };
const SCOPE_LABELS: Record<number, string> = {
  1: "User",
  2: "Business Unit",
  3: "Parent-Child BU",
  4: "Organization",
};

export function registerGetWorkflowDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_workflow_details",
    "Get detailed information about a specific workflow including triggers, scope, and definition.",
    {
      environment: z.string().optional().describe("Environment name"),
      workflowName: z.string().optional().describe("Workflow name (display name)"),
      uniqueName: z.string().optional().describe("Workflow unique name"),
    },
    async ({ environment, workflowName, uniqueName }) => {
      try {
        if (!workflowName && !uniqueName) {
          return {
            content: [
              { type: "text" as const, text: "Please provide either workflowName or uniqueName." },
            ],
            isError: true,
          };
        }

        const env = getEnvironment(config, environment);

        const workflows = await client.query<Record<string, unknown>>(
          env,
          "workflows",
          getWorkflowDetailsByIdentityQuery({ workflowName, uniqueName }),
        );

        if (workflows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Workflow '${workflowName || uniqueName}' not found in '${env.name}'.`,
              },
            ],
          };
        }

        const w = workflows[0];
        const lines: string[] = [];

        lines.push(`## Workflow: ${w.name}`);
        lines.push(`- **Unique Name**: ${w.uniquename || "(none)"}`);
        lines.push(`- **Category**: ${CATEGORY_LABELS[w.category as number] || w.category}`);
        lines.push(`- **Status**: ${STATE_LABELS[w.statecode as number] || w.statecode}`);
        lines.push(`- **Mode**: ${MODE_LABELS[w.mode as number] || w.mode}`);
        lines.push(`- **Scope**: ${SCOPE_LABELS[w.scope as number] || w.scope}`);
        lines.push(`- **Primary Entity**: ${w.primaryentity || "none"}`);
        lines.push(`- **Managed**: ${w.ismanaged ? "Yes" : "No"}`);
        lines.push(`- **Created**: ${String(w.createdon || "").slice(0, 10)}`);
        lines.push(`- **Modified**: ${String(w.modifiedon || "").slice(0, 10)}`);

        if (w.description) {
          lines.push(`- **Description**: ${w.description}`);
        }

        lines.push("");
        lines.push("### Triggers");
        const triggers: string[] = [];
        if (w.triggeroncreate) triggers.push("Create");
        if (w.triggerondelete) triggers.push("Delete");
        if (w.triggeronupdateattributelist)
          triggers.push(`Update (${w.triggeronupdateattributelist})`);
        lines.push(triggers.length > 0 ? triggers.join(", ") : "None / Manual");

        if (w.inputparameters) {
          lines.push("");
          lines.push("### Input Parameters");
          lines.push(`\`\`\`\n${w.inputparameters}\n\`\`\``);
        }

        if (w.clientdata) {
          lines.push("");
          lines.push("### Definition (clientdata)");
          try {
            const parsed = JSON.parse(w.clientdata as string);
            lines.push(`\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``);
          } catch {
            lines.push(`\`\`\`\n${String(w.clientdata).slice(0, 3000)}\n\`\`\``);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
