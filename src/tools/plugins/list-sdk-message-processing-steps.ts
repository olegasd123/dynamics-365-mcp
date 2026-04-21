import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  listPluginImagesForStepsQuery,
  listSdkMessageProcessingStepsQuery,
} from "../../queries/plugin-queries.js";
import { resolveTable } from "../tables/table-metadata.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
  50: "Post-Commit",
};

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "PreImage",
  1: "PostImage",
  2: "Both",
};

const STATUS_LABELS: Record<number, string> = {
  0: "Enabled",
  1: "Disabled",
};

const listSdkMessageProcessingStepsSchema = {
  environment: z.string().optional().describe("Environment name"),
  message: z.string().describe("SDK message name or sdkmessageid"),
  primaryEntity: z
    .string()
    .optional()
    .describe("Table logical name, schema name, or display name. Leave empty for all tables."),
  stage: z.number().optional().describe("Optional stage value: 10, 20, 40, or 50"),
  mode: z.enum(["sync", "async"]).optional().describe("Optional execution mode"),
  statecode: z
    .enum(["enabled", "disabled", "all"])
    .optional()
    .describe("Step state filter. Defaults to enabled."),
  includeImages: z
    .boolean()
    .optional()
    .describe("Include registered pre/post images. Default true."),
};

type ListSdkMessageProcessingStepsParams = ToolParams<typeof listSdkMessageProcessingStepsSchema>;

interface StepImageRecord extends Record<string, unknown> {
  sdkmessageprocessingstepimageid: string;
  sdkmessageprocessingstepid: string;
  name: string;
  entityalias: string;
  imagetype: number;
  imageTypeLabel: string;
  attributes: string;
  messagepropertyname: string;
}

interface SdkMessageProcessingStepRecord extends Record<string, unknown> {
  sdkmessageprocessingstepid: string;
  name: string;
  assemblyName: string;
  pluginTypeName: string;
  pluginTypeFullName: string;
  handlerType: string;
  messageName: string;
  primaryEntity: string;
  stageLabel: string;
  modeLabel: string;
  statusLabel: string;
  filteringattributes: string;
  userContext: string;
  images: StepImageRecord[];
  imageCount: number;
}

export async function handleListSdkMessageProcessingSteps(
  {
    environment,
    message,
    primaryEntity,
    stage,
    mode,
    statecode,
    includeImages,
  }: ListSdkMessageProcessingStepsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const table = primaryEntity ? await resolveTable(env, client, primaryEntity) : null;
    const modeValue = mode === "sync" ? 0 : mode === "async" ? 1 : undefined;
    const stateValue = statecode === "all" ? undefined : statecode === "disabled" ? 1 : 0;
    const stepRows = await client.query<Record<string, unknown>>(
      env,
      "sdkmessageprocessingsteps",
      listSdkMessageProcessingStepsQuery({
        message,
        primaryEntity: table?.logicalName,
        stage,
        mode: modeValue,
        statecode: stateValue,
      }),
    );
    const stepIds = stepRows
      .map((step) => String(step.sdkmessageprocessingstepid || ""))
      .filter(Boolean);
    const imageRows =
      includeImages === false || stepIds.length === 0
        ? []
        : await client.query<Record<string, unknown>>(
            env,
            "sdkmessageprocessingstepimages",
            listPluginImagesForStepsQuery(stepIds),
          );
    const imagesByStepId = groupImagesByStepId(imageRows, stepRows);
    const items = stepRows.map((step) => normalizeStep(step, imagesByStepId));

    if (items.length === 0) {
      const filterText = formatFilterText(message, table?.logicalName, stage, mode, stateValue);
      const text = `No SDK message processing steps found for ${filterText} in '${env.name}'.`;

      return createToolSuccessResponse("list_sdk_message_processing_steps", text, text, {
        environment: env.name,
        found: true,
        filters: {
          message,
          primaryEntity: table?.logicalName || null,
          stage: stage ?? null,
          mode: mode || null,
          statecode: statecode || "enabled",
          includeImages: includeImages !== false,
        },
        count: 0,
        items: [],
      });
    }

    const headers = [
      "Step",
      "Assembly",
      "Class",
      "Handler",
      "Message",
      "Entity",
      "Stage",
      "Mode",
      "Status",
      "Rank",
      "Filtering",
      "User",
      "Images",
    ];
    const rows = items.map((step) => [
      step.name || "-",
      step.assemblyName || "-",
      step.pluginTypeFullName || step.pluginTypeName || "-",
      step.handlerType,
      step.messageName || "-",
      step.primaryEntity || "none",
      step.stageLabel,
      step.modeLabel,
      step.statusLabel,
      String(step.rank || ""),
      step.filteringattributes || "(all)",
      step.userContext,
      formatImages(step.images),
    ]);
    const filterText = formatFilterText(message, table?.logicalName, stage, mode, stateValue);
    const text = `## SDK Message Processing Steps in '${env.name}'\n\nFound ${items.length} step(s) for ${filterText}.\n\n${formatTable(headers, rows)}`;

    return createToolSuccessResponse(
      "list_sdk_message_processing_steps",
      text,
      `Found ${items.length} SDK message processing step(s) in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        filters: {
          message,
          primaryEntity: table?.logicalName || null,
          stage: stage ?? null,
          mode: mode || null,
          statecode: statecode || "enabled",
          includeImages: includeImages !== false,
        },
        count: items.length,
        items,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_sdk_message_processing_steps", error);
  }
}

export const listSdkMessageProcessingStepsTool = defineTool({
  name: "list_sdk_message_processing_steps",
  description:
    "List SDK message processing steps org-wide for a Dataverse message and optional table.",
  schema: listSdkMessageProcessingStepsSchema,
  handler: handleListSdkMessageProcessingSteps,
});

export function registerListSdkMessageProcessingSteps(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listSdkMessageProcessingStepsTool, { config, client });
}

function normalizeStep(
  step: Record<string, unknown>,
  imagesByStepId: Map<string, StepImageRecord[]>,
): SdkMessageProcessingStepRecord {
  const stepId = String(step.sdkmessageprocessingstepid || "");
  const pluginType = getRecord(step.eventhandler_plugintype);
  const assembly = getRecord(pluginType?.pluginassemblyid);
  const message = getRecord(step.sdkmessageid);
  const filter = getRecord(step.sdkmessagefilterid);
  const user = getRecord(step.impersonatinguserid);
  const stage = Number(step.stage || 0);
  const mode = Number(step.mode || 0);
  const state = Number(step.statecode || 0);
  const workflowActivityGroupName = String(pluginType?.workflowactivitygroupname || "").trim();
  const customWorkflowActivityInfo = String(pluginType?.customworkflowactivityinfo || "").trim();
  const isWorkflowActivity =
    Boolean(pluginType?.isworkflowactivity) ||
    workflowActivityGroupName.length > 0 ||
    customWorkflowActivityInfo.length > 0;

  return {
    ...step,
    sdkmessageprocessingstepid: stepId,
    name: String(step.name || ""),
    assemblyName: String(assembly?.name || "(unknown assembly)"),
    pluginTypeName: String(pluginType?.name || ""),
    pluginTypeFullName: String(pluginType?.typename || ""),
    handlerType: pluginType
      ? isWorkflowActivity
        ? "Workflow Activity"
        : "Plugin Class"
      : "Unknown",
    messageName: String(message?.name || ""),
    primaryEntity: String(filter?.primaryobjecttypecode || "none"),
    stageLabel: STAGE_LABELS[stage] || String(step.stage || ""),
    modeLabel: MODE_LABELS[mode] || String(step.mode || ""),
    statusLabel: STATUS_LABELS[state] || String(step.statecode || ""),
    filteringattributes: String(step.filteringattributes || ""),
    userContext: formatUserContext(user),
    images: imagesByStepId.get(stepId) || [],
    imageCount: imagesByStepId.get(stepId)?.length || 0,
  };
}

function groupImagesByStepId(
  images: Record<string, unknown>[],
  steps: Record<string, unknown>[],
): Map<string, StepImageRecord[]> {
  const stepIds = new Set(steps.map((step) => String(step.sdkmessageprocessingstepid || "")));
  const byStepId = new Map<string, StepImageRecord[]>();

  for (const image of images) {
    const stepId = String(image._sdkmessageprocessingstepid_value || "");
    if (!stepIds.has(stepId)) {
      continue;
    }
    const imagetype = Number(image.imagetype || 0);
    const group = byStepId.get(stepId) || [];
    group.push({
      ...image,
      sdkmessageprocessingstepimageid: String(image.sdkmessageprocessingstepimageid || ""),
      sdkmessageprocessingstepid: stepId,
      name: String(image.name || ""),
      entityalias: String(image.entityalias || ""),
      imagetype,
      imageTypeLabel: IMAGE_TYPE_LABELS[imagetype] || String(image.imagetype || ""),
      attributes: String(image.attributes || ""),
      messagepropertyname: String(image.messagepropertyname || ""),
    });
    byStepId.set(stepId, group);
  }

  return byStepId;
}

function formatFilterText(
  message: string,
  primaryEntity?: string,
  stage?: number,
  mode?: string,
  statecode?: number,
): string {
  const parts = [`message '${message}'`];
  if (primaryEntity) {
    parts.push(`table '${primaryEntity}'`);
  }
  if (stage !== undefined) {
    parts.push(`stage ${stage}`);
  }
  if (mode) {
    parts.push(`${mode} mode`);
  }
  if (statecode !== undefined) {
    parts.push(statecode === 0 ? "enabled steps" : "disabled steps");
  } else {
    parts.push("all states");
  }

  return parts.join(", ");
}

function formatImages(images: StepImageRecord[]): string {
  if (images.length === 0) {
    return "-";
  }

  return images
    .map((image) => {
      const alias = image.entityalias ? ` alias ${image.entityalias}` : "";
      const attributes = image.attributes ? ` attributes ${image.attributes}` : " all attributes";
      return `${image.name || "(unnamed)"} (${image.imageTypeLabel}${alias},${attributes})`;
    })
    .join("; ");
}

function formatUserContext(user: Record<string, unknown> | undefined): string {
  if (!user) {
    return "Calling User";
  }

  return (
    String(user.fullname || "") ||
    String(user.domainname || "") ||
    String(user.systemuserid || "") ||
    "Calling User"
  );
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}
