import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { getWorkflowDetailsByIdentityQuery } from "../../queries/workflow-queries.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

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

const getWorkflowDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  workflowName: z.string().optional().describe("Workflow name (display name)"),
  uniqueName: z.string().optional().describe("Workflow unique name or workflow id"),
};

type GetWorkflowDetailsParams = ToolParams<typeof getWorkflowDetailsSchema>;

export async function handleGetWorkflowDetails(
  { environment, workflowName, uniqueName }: GetWorkflowDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    if (!workflowName && !uniqueName) {
      return createToolErrorResponse(
        "get_workflow_details",
        "Please provide either workflowName or uniqueName.",
      );
    }

    const env = getEnvironment(config, environment);

    const workflows = await client.query<Record<string, unknown>>(
      env,
      "workflows",
      getWorkflowDetailsByIdentityQuery({ workflowName, uniqueName }),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );
    const matchingWorkflows = workflows.filter((workflow) =>
      uniqueName
        ? String(workflow.uniquename || "") === uniqueName ||
          String(workflow.workflowid || "") === uniqueName
        : String(workflow.name || "") === workflowName,
    );

    if (matchingWorkflows.length === 0) {
      const text = `Workflow '${workflowName || uniqueName}' not found in '${env.name}'.`;
      return createToolSuccessResponse("get_workflow_details", text, text, {
        environment: env.name,
        found: false,
        workflowName: workflowName || null,
        uniqueName: uniqueName || null,
      });
    }

    if (matchingWorkflows.length > 1) {
      throw createAmbiguousWorkflowError(
        env.name,
        workflowName || uniqueName || "",
        matchingWorkflows,
      );
    }

    const w = matchingWorkflows[0];
    const lines: string[] = [];
    const triggers: string[] = [];
    if (w.triggeroncreate) triggers.push("Create");
    if (w.triggerondelete) triggers.push("Delete");
    if (w.triggeronupdateattributelist) triggers.push(`Update (${w.triggeronupdateattributelist})`);
    const parsedInputParameters = parseJsonValue(w.inputparameters);
    const parsedClientData = parseJsonValue(w.clientdata);

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

    return createToolSuccessResponse(
      "get_workflow_details",
      lines.join("\n"),
      `Loaded workflow '${String(w.name || workflowName || uniqueName)}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        workflow: {
          workflowid: String(w.workflowid || ""),
          name: String(w.name || ""),
          uniqueName: String(w.uniquename || ""),
          category: Number(w.category || 0),
          categoryLabel: CATEGORY_LABELS[w.category as number] || String(w.category),
          state: Number(w.statecode || 0),
          stateLabel: STATE_LABELS[w.statecode as number] || String(w.statecode),
          mode: Number(w.mode || 0),
          modeLabel: MODE_LABELS[w.mode as number] || String(w.mode),
          scope: Number(w.scope || 0),
          scopeLabel: SCOPE_LABELS[w.scope as number] || String(w.scope),
          primaryEntity: String(w.primaryentity || "none"),
          isManaged: Boolean(w.ismanaged),
          description: String(w.description || ""),
          createdOn: String(w.createdon || "").slice(0, 10),
          modifiedOn: String(w.modifiedon || "").slice(0, 10),
          triggers,
          triggerOnUpdateAttributes: String(w.triggeronupdateattributelist || ""),
          inputParameters: parsedInputParameters,
          inputParametersRaw: String(w.inputparameters || ""),
          clientData: parsedClientData,
          clientDataRaw: String(w.clientdata || ""),
        },
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_workflow_details", error);
  }
}

export const getWorkflowDetailsTool = defineTool({
  name: "get_workflow_details",
  description:
    "Get detailed information about a specific workflow including triggers, scope, and definition.",
  schema: getWorkflowDetailsSchema,
  handler: handleGetWorkflowDetails,
});

export function registerGetWorkflowDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getWorkflowDetailsTool, { config, client });
}

function createAmbiguousWorkflowError(
  environmentName: string,
  workflowRef: string,
  matches: Record<string, unknown>[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Workflow '${workflowRef}' is ambiguous in '${environmentName}'. Choose a workflow and try again. Matches: ${matches.map(formatWorkflowMatch).join(", ")}.`,
    {
      parameter: "uniqueName",
      options: matches.map((workflow) => createWorkflowOption(workflow)),
    },
  );
}

function createWorkflowOption(workflow: Record<string, unknown>): AmbiguousMatchOption {
  const identity = String(workflow.uniquename || workflow.workflowid || "");

  return {
    value: identity,
    label: formatWorkflowMatch(workflow),
  };
}

function formatWorkflowMatch(workflow: Record<string, unknown>): string {
  const name = String(workflow.name || "");
  const identity = String(workflow.uniquename || workflow.workflowid || "");
  return `${name} (${identity})`;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
