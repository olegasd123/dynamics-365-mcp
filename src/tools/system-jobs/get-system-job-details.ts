import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CACHE_TIERS } from "../../client/cache-policy.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import {
  getPluginStepForSystemJobQuery,
  getSystemJobByIdQuery,
  getWorkflowForSystemJobQuery,
  listBulkDeleteOperationsForSystemJobQuery,
} from "../../queries/system-job-queries.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  classifySystemJob,
  getBoolean,
  getNumber,
  normalizeSystemJob,
} from "./system-job-metadata.js";

const STEP_MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const STEP_STAGE_LABELS: Record<number, string> = {
  10: "Pre-validation",
  20: "Pre-operation",
  40: "Post-operation",
};

const getSystemJobDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  systemJobId: z.string().describe("System job id (asyncoperationid)"),
};

type GetSystemJobDetailsParams = ToolParams<typeof getSystemJobDetailsSchema>;

export async function handleGetSystemJobDetails(
  { environment, systemJobId }: GetSystemJobDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const systemJob = await client.getPath<Record<string, unknown>>(
      env,
      `asyncoperations(${systemJobId})`,
      getSystemJobByIdQuery(),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );

    if (!systemJob) {
      const text = `System job '${systemJobId}' not found in '${env.name}'.`;
      return createToolSuccessResponse("get_system_job_details", text, text, {
        environment: env.name,
        found: false,
        systemJobId,
      });
    }

    const job = normalizeSystemJob(systemJob);
    const workflow =
      job.workflowActivationId === null
        ? null
        : await client.getPath<Record<string, unknown>>(
            env,
            `workflows(${job.workflowActivationId})`,
            getWorkflowForSystemJobQuery(),
            { cacheTier: CACHE_TIERS.VOLATILE },
          );
    const pluginStep =
      job.owningExtensionId === null
        ? null
        : await client.getPath<Record<string, unknown>>(
            env,
            `sdkmessageprocessingsteps(${job.owningExtensionId})`,
            getPluginStepForSystemJobQuery(),
            { cacheTier: CACHE_TIERS.VOLATILE },
          );
    const bulkDeleteOperations =
      classifySystemJob(job.operationType, job.owningExtensionId, job.workflowActivationId) ===
      "Bulk Delete"
        ? await client.query<Record<string, unknown>>(
            env,
            "bulkdeleteoperations",
            listBulkDeleteOperationsForSystemJobQuery(job.asyncOperationId),
            { cacheTier: CACHE_TIERS.VOLATILE },
          )
        : [];

    const normalizedWorkflow = workflow ? normalizeWorkflow(workflow) : null;
    const normalizedPluginStep = pluginStep ? normalizePluginStep(pluginStep) : null;
    const normalizedBulkDeleteOperations = bulkDeleteOperations.map(normalizeBulkDeleteOperation);

    const lines: string[] = [];
    lines.push(`## System Job: ${job.name || job.asyncOperationId}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- System Job Id: ${job.asyncOperationId}`);
    lines.push(`- Category: ${job.category}`);
    lines.push(`- Operation: ${job.operationLabel}`);
    lines.push(`- State: ${job.stateLabel}`);
    lines.push(`- Status: ${job.statusLabel}`);
    lines.push(`- Message Name: ${job.messageName || "-"}`);
    lines.push(`- Primary Entity: ${job.primaryEntityType || "-"}`);
    lines.push(`- Correlation Id: ${job.correlationId || "-"}`);
    lines.push(`- Request Id: ${job.requestId || "-"}`);
    lines.push(`- Error Code: ${job.errorCode === null ? "-" : String(job.errorCode)}`);
    lines.push(`- Depth: ${job.depth === null ? "-" : String(job.depth)}`);
    lines.push(`- Retry Count: ${job.retryCount === null ? "-" : String(job.retryCount)}`);
    lines.push(
      `- Execution Time Span: ${job.executionTimeSpan === null ? "-" : String(job.executionTimeSpan)}`,
    );
    lines.push(`- Created On: ${job.createdOn || "-"}`);
    lines.push(`- Started On: ${job.startedOn || "-"}`);
    lines.push(`- Completed On: ${job.completedOn || "-"}`);
    lines.push(`- Modified On: ${job.modifiedOn || "-"}`);
    lines.push(`- Postpone Until: ${job.postponeUntil || "-"}`);
    lines.push(`- Workflow Stage: ${job.workflowStageName || "-"}`);
    lines.push(`- Workload: ${job.workload || "-"}`);
    lines.push(`- Subtype: ${job.subtype === null ? "-" : String(job.subtype)}`);
    lines.push(`- Dependency Token: ${job.dependencyToken || "-"}`);
    lines.push(`- Parent Plug-in Execution Id: ${job.parentPluginExecutionId || "-"}`);
    lines.push(
      `- Retain Job History: ${job.retainJobHistory === null ? "-" : job.retainJobHistory ? "Yes" : "No"}`,
    );

    lines.push("");
    lines.push("### Message");
    lines.push(job.effectiveMessage || "None");

    lines.push("");
    lines.push("### Recurrence");
    lines.push(`- Pattern: ${job.recurrencePattern || "-"}`);
    lines.push(`- Start Time: ${job.recurrenceStartTime || "-"}`);

    if (normalizedWorkflow) {
      lines.push("");
      lines.push("### Related Workflow");
      lines.push(`- Workflow Id: ${normalizedWorkflow.workflowId}`);
      lines.push(`- Name: ${normalizedWorkflow.name}`);
      lines.push(`- Unique Name: ${normalizedWorkflow.uniqueName || "-"}`);
      lines.push(`- Category: ${normalizedWorkflow.categoryLabel}`);
      lines.push(`- State: ${normalizedWorkflow.stateLabel}`);
      lines.push(`- Mode: ${normalizedWorkflow.modeLabel}`);
      lines.push(`- Primary Entity: ${normalizedWorkflow.primaryEntity || "-"}`);
    }

    if (normalizedPluginStep) {
      lines.push("");
      lines.push("### Related Plug-in Step");
      lines.push(`- Step Id: ${normalizedPluginStep.sdkMessageProcessingStepId}`);
      lines.push(`- Name: ${normalizedPluginStep.name}`);
      lines.push(`- Message: ${normalizedPluginStep.messageName || "-"}`);
      lines.push(`- Primary Entity: ${normalizedPluginStep.primaryEntity || "-"}`);
      lines.push(`- Stage: ${normalizedPluginStep.stageLabel}`);
      lines.push(`- Mode: ${normalizedPluginStep.modeLabel}`);
      lines.push(
        `- Async Auto Delete: ${normalizedPluginStep.asyncAutoDelete === null ? "-" : normalizedPluginStep.asyncAutoDelete ? "Yes" : "No"}`,
      );
    }

    if (normalizedBulkDeleteOperations.length > 0) {
      lines.push("");
      lines.push("### Bulk Delete Details");
      for (const bulkDelete of normalizedBulkDeleteOperations) {
        lines.push(`- Job: ${bulkDelete.name || bulkDelete.bulkDeleteOperationId}`);
        lines.push(`  Status: ${bulkDelete.statusLabel}`);
        lines.push(
          `  Deleted: ${bulkDelete.successCount === null ? "-" : String(bulkDelete.successCount)}`,
        );
        lines.push(
          `  Failures: ${bulkDelete.failureCount === null ? "-" : String(bulkDelete.failureCount)}`,
        );
        lines.push(
          `  Recurring: ${bulkDelete.isRecurring === null ? "-" : bulkDelete.isRecurring ? "Yes" : "No"}`,
        );
        lines.push(`  Next Run: ${bulkDelete.nextRun || "-"}`);
      }
    }

    return createToolSuccessResponse(
      "get_system_job_details",
      lines.join("\n"),
      `Loaded system job '${job.name || job.asyncOperationId}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        systemJob: job,
        relatedWorkflow: normalizedWorkflow,
        relatedPluginStep: normalizedPluginStep,
        bulkDeleteOperations: normalizedBulkDeleteOperations,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_system_job_details", error);
  }
}

function normalizeWorkflow(record: Record<string, unknown>) {
  const category = getNumber(record.category);
  const state = getNumber(record.statecode);
  const mode = getNumber(record.mode);

  return {
    workflowId: String(record.workflowid || ""),
    name: String(record.name || ""),
    uniqueName: String(record.uniquename || ""),
    category,
    categoryLabel:
      category === 3
        ? "Action"
        : category === 5
          ? "Modern Flow"
          : category === 0
            ? "Workflow"
            : category === 2
              ? "Business Rule"
              : category === 4
                ? "BPF"
                : category === 1
                  ? "Dialog"
                  : String(category ?? "-"),
    state,
    stateLabel:
      state === 1
        ? "Activated"
        : state === 0
          ? "Draft"
          : state === 2
            ? "Suspended"
            : String(state ?? "-"),
    mode,
    modeLabel: mode === 1 ? "Real-time" : mode === 0 ? "Background" : String(mode ?? "-"),
    primaryEntity: String(record.primaryentity || ""),
  };
}

function normalizePluginStep(record: Record<string, unknown>) {
  const stage = getNumber(record.stage);
  const mode = getNumber(record.mode);

  return {
    sdkMessageProcessingStepId: String(record.sdkmessageprocessingstepid || ""),
    name: String(record.name || ""),
    stage,
    stageLabel: stage === null ? "-" : (STEP_STAGE_LABELS[stage] ?? String(stage)),
    mode,
    modeLabel: mode === null ? "-" : (STEP_MODE_LABELS[mode] ?? String(mode)),
    asyncAutoDelete: getBoolean(record.asyncautodelete),
    messageName: String((record.sdkmessageid as { name?: unknown } | undefined)?.name || ""),
    primaryEntity: String(
      (record.sdkmessagefilterid as { primaryobjecttypecode?: unknown } | undefined)
        ?.primaryobjecttypecode || "",
    ),
  };
}

function normalizeBulkDeleteOperation(record: Record<string, unknown>) {
  const state = getNumber(record.statecode);
  const status = getNumber(record.statuscode);

  return {
    bulkDeleteOperationId: String(record.bulkdeleteoperationid || ""),
    name: String(record.name || ""),
    createdOn: String(record.createdon || ""),
    modifiedOn: String(record.modifiedon || ""),
    state,
    stateLabel:
      state === 3
        ? "Completed"
        : state === 2
          ? "Locked"
          : state === 1
            ? "Suspended"
            : state === 0
              ? "Ready"
              : String(state ?? "-"),
    status,
    statusLabel:
      status === 31
        ? "Failed"
        : status === 30
          ? "Succeeded"
          : status === 32
            ? "Canceled"
            : status === 20
              ? "In Progress"
              : status === 10
                ? "Waiting"
                : status === 0
                  ? "Waiting For Resources"
                  : status === 11
                    ? "Retrying"
                    : status === 12
                      ? "Paused"
                      : status === 21
                        ? "Pausing"
                        : status === 22
                          ? "Canceling"
                          : String(status ?? "-"),
    successCount: getNumber(record.successcount),
    failureCount: getNumber(record.failurecount),
    isRecurring: getBoolean(record.isrecurring),
    nextRun: String(record.nextrun || ""),
    processingQueryIndex: getNumber(record.processingqeindex),
  };
}

export const getSystemJobDetailsTool = defineTool({
  name: "get_system_job_details",
  description:
    "Show one Dataverse system job with runtime status, message details, and related workflow, plug-in, or bulk delete context.",
  schema: getSystemJobDetailsSchema,
  handler: handleGetSystemJobDetails,
});

export function registerGetSystemJobDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getSystemJobDetailsTool, { config, client });
}
