import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listWorkflowDefinitionSearchQuery } from "../../queries/workflow-queries.js";
import type { WorkflowState } from "../../queries/workflow-queries.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";

const STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

const MODE_LABELS: Record<number, string> = {
  0: "Background",
  1: "Real-time",
};

const MATCH_TYPE_LABELS = {
  xaml_full_type_name: "XAML full type name",
  xaml_activity_tag: "XAML activity tag",
  xaml_namespace_and_activity: "XAML namespace + activity",
  clientdata_full_type_name: "Client data full type name",
} as const;

type WorkflowActivityMatchType = keyof typeof MATCH_TYPE_LABELS;

interface WorkflowActivityEvidence {
  location: "xaml" | "clientdata";
  matchType: WorkflowActivityMatchType;
  excerpt: string;
}

interface WorkflowActivityUsageRow {
  workflowid: string;
  name: string;
  uniqueName: string;
  primaryEntity: string;
  stateLabel: string;
  modeLabel: string;
  evidence: WorkflowActivityEvidence[];
}

const findWorkflowActivityUsageSchema = {
  environment: z.string().optional().describe("Environment name"),
  className: z
    .string()
    .min(1)
    .describe(
      "Full workflow activity class name like Masao.Workflows.CommonSteps.SetIntegrationKey",
    ),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  status: z
    .enum(["draft", "activated", "suspended"])
    .optional()
    .describe("Optional workflow status filter"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max matching workflows to show. Default: 50"),
};

type FindWorkflowActivityUsageParams = ToolParams<typeof findWorkflowActivityUsageSchema>;

export async function handleFindWorkflowActivityUsage(
  { environment, className, solution, status, limit }: FindWorkflowActivityUsageParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const rowLimit = limit ?? 50;
    let workflows = await client.query<Record<string, unknown>>(
      env,
      "workflows",
      listWorkflowDefinitionSearchQuery({
        category: "workflow",
        status: status as WorkflowState | undefined,
      }),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );
    workflows = workflows.filter(
      (workflow) =>
        Number(workflow.category ?? 0) === 0 &&
        (status === undefined || Number(workflow.statecode ?? -1) === workflowStateToCode(status)),
    );

    if (solution) {
      const solutionComponents = await fetchSolutionComponentSets(env, client, solution);
      workflows = workflows.filter((workflow) =>
        solutionComponents.workflowIds.has(String(workflow.workflowid || "")),
      );
    }

    const matches = workflows
      .map((workflow) => buildWorkflowActivityUsageRow(workflow, className))
      .filter((workflow): workflow is WorkflowActivityUsageRow => workflow !== null);
    const shownMatches = matches.slice(0, rowLimit);
    const lines: string[] = [];

    lines.push(`## Workflow Activity Usage: ${className}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push("- Category: Workflow");
    lines.push(`- Status Filter: ${status || "all"}`);
    lines.push(`- Workflows Scanned: ${workflows.length}`);
    lines.push(`- Matches: ${matches.length}`);
    if (solution) {
      lines.push(`- Solution Filter: ${solution}`);
    }

    if (matches.length === 0) {
      lines.push("");
      lines.push(
        "No workflow definitions matched this class reference. This search inspects workflow XAML and clientdata directly rather than plugin step registrations.",
      );
      return createToolSuccessResponse(
        "find_workflow_activity_usage",
        lines.join("\n"),
        `No workflow definitions in '${env.name}' reference '${className}'.`,
        {
          environment: env.name,
          className,
          category: "workflow",
          status: status || null,
          solution: solution || null,
          scannedCount: workflows.length,
          totalMatches: 0,
          items: [],
        },
      );
    }

    lines.push("");
    lines.push("### Matching Workflows");
    lines.push(
      formatTable(
        ["Name", "Status", "Mode", "Entity", "Evidence"],
        shownMatches.map((workflow) => [
          workflow.name,
          workflow.stateLabel,
          workflow.modeLabel,
          workflow.primaryEntity,
          summarizeEvidence(workflow.evidence),
        ]),
      ),
    );

    lines.push("");
    lines.push("### Evidence");
    for (const workflow of shownMatches) {
      lines.push(`#### ${workflow.name}`);
      lines.push(`- Unique Name: ${workflow.uniqueName || "(none)"}`);
      for (const evidence of workflow.evidence) {
        lines.push(
          `- ${MATCH_TYPE_LABELS[evidence.matchType]}: \`${evidence.excerpt.replaceAll("`", "'")}\``,
        );
      }
      lines.push("");
    }

    if (matches.length > shownMatches.length) {
      lines.push(`Showing ${shownMatches.length} of ${matches.length} matching workflows.`);
    }

    return createToolSuccessResponse(
      "find_workflow_activity_usage",
      lines.join("\n"),
      `Found ${matches.length} workflow definition matches for '${className}' in '${env.name}'.`,
      {
        environment: env.name,
        className,
        category: "workflow",
        status: status || null,
        solution: solution || null,
        scannedCount: workflows.length,
        shownCount: shownMatches.length,
        totalMatches: matches.length,
        items: matches,
      },
    );
  } catch (error) {
    return createToolErrorResponse("find_workflow_activity_usage", error);
  }
}

export const findWorkflowActivityUsageTool = defineTool({
  name: "find_workflow_activity_usage",
  description:
    "Find workflow processes (category Workflow) whose XAML or clientdata references a custom workflow activity (`CodeActivity`) class.",
  schema: findWorkflowActivityUsageSchema,
  handler: handleFindWorkflowActivityUsage,
});

export function registerFindWorkflowActivityUsage(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, findWorkflowActivityUsageTool, { config, client });
}

function buildWorkflowActivityUsageRow(
  workflow: Record<string, unknown>,
  className: string,
): WorkflowActivityUsageRow | null {
  const evidence = findWorkflowActivityEvidence(
    String(workflow.xaml || ""),
    String(workflow.clientdata || ""),
    className,
  );

  if (evidence.length === 0) {
    return null;
  }

  return {
    workflowid: String(workflow.workflowid || ""),
    name: String(workflow.name || ""),
    uniqueName: String(workflow.uniquename || ""),
    primaryEntity: String(workflow.primaryentity || "none"),
    stateLabel: STATE_LABELS[Number(workflow.statecode || 0)] || String(workflow.statecode || ""),
    modeLabel: MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || ""),
    evidence,
  };
}

function findWorkflowActivityEvidence(
  xaml: string,
  clientData: string,
  className: string,
): WorkflowActivityEvidence[] {
  const evidence: WorkflowActivityEvidence[] = [];
  const fullName = className.trim();

  if (fullName.length === 0) {
    return evidence;
  }

  const fullNameLower = fullName.toLowerCase();
  const lastDotIndex = fullName.lastIndexOf(".");
  const namespace = lastDotIndex > 0 ? fullName.slice(0, lastDotIndex) : "";
  const shortName = lastDotIndex > 0 ? fullName.slice(lastDotIndex + 1) : fullName;

  addExactReference(evidence, xaml, fullNameLower, "xaml", "xaml_full_type_name");
  addExactReference(evidence, clientData, fullNameLower, "clientdata", "clientdata_full_type_name");

  if (namespace && shortName) {
    addNamespacedXamlReference(evidence, xaml, namespace, shortName);
  }

  return deduplicateEvidence(evidence);
}

function addExactReference(
  evidence: WorkflowActivityEvidence[],
  text: string,
  fullNameLower: string,
  location: WorkflowActivityEvidence["location"],
  matchType: WorkflowActivityMatchType,
): void {
  if (!text) {
    return;
  }

  const matchIndex = text.toLowerCase().indexOf(fullNameLower);
  if (matchIndex === -1) {
    return;
  }

  evidence.push({
    location,
    matchType,
    excerpt: createExcerpt(text, matchIndex, fullNameLower.length),
  });
}

function addNamespacedXamlReference(
  evidence: WorkflowActivityEvidence[],
  xaml: string,
  namespaceName: string,
  shortName: string,
): void {
  if (!xaml) {
    return;
  }

  const namespacePattern = new RegExp(
    `xmlns:([A-Za-z_][\\w.-]*)=["'][^"']*clr-namespace:${escapeRegExp(namespaceName)}(?:;assembly=[^"']*)?["']`,
    "gi",
  );
  const prefixes = new Set<string>();

  for (const match of xaml.matchAll(namespacePattern)) {
    const prefix = String(match[1] || "");
    if (!prefix) {
      continue;
    }
    prefixes.add(prefix);
    const activityPattern = new RegExp(
      `<\\s*${escapeRegExp(prefix)}:${escapeRegExp(shortName)}\\b`,
      "i",
    );
    const activityMatch = activityPattern.exec(xaml);
    if (activityMatch && activityMatch.index >= 0) {
      evidence.push({
        location: "xaml",
        matchType: "xaml_activity_tag",
        excerpt: createExcerpt(xaml, activityMatch.index, activityMatch[0].length),
      });
    }
  }

  if (prefixes.size > 0) {
    return;
  }

  const namespaceToken = `clr-namespace:${namespaceName}`.toLowerCase();
  const namespaceIndex = xaml.toLowerCase().indexOf(namespaceToken);
  const activityPattern = new RegExp(`:${escapeRegExp(shortName)}\\b`, "i");
  const activityMatch = activityPattern.exec(xaml);

  if (namespaceIndex >= 0 && activityMatch && activityMatch.index >= 0) {
    evidence.push({
      location: "xaml",
      matchType: "xaml_namespace_and_activity",
      excerpt: createExcerpt(xaml, activityMatch.index, activityMatch[0].length),
    });
  }
}

function summarizeEvidence(evidence: WorkflowActivityEvidence[]): string {
  return [...new Set(evidence.map((item) => MATCH_TYPE_LABELS[item.matchType]))].join(", ");
}

function deduplicateEvidence(evidence: WorkflowActivityEvidence[]): WorkflowActivityEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.location}|${item.matchType}|${item.excerpt}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createExcerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + length + 60);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function workflowStateToCode(state: WorkflowState): number {
  if (state === "draft") {
    return 0;
  }
  if (state === "activated") {
    return 1;
  }
  return 2;
}
