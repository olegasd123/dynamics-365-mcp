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
import {
  fetchColumnsByLogicalName,
  listTables,
  resolveTable,
  type TableColumnRecord,
  type TableRecord,
} from "../tables/table-metadata.js";
import { formatTable } from "../../utils/formatters.js";
import { odataStringLiteral, query, rawFilter } from "../../utils/odata-builder.js";

const FORMATTED_VALUE_SUFFIX = "@OData.Community.Display.V1.FormattedValue";

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
const STAGE_CATEGORY_LABELS: Record<number, string> = {
  0: "Qualify",
  1: "Develop",
  2: "Propose",
  3: "Close",
  4: "Identify",
  5: "Research",
  6: "Resolve",
};

const FIELD_HINT_RE = /(attribute|field|column|step(field)?|datafield|sourcefield|targetfield)/i;
const ENTITY_HINT_RE =
  /(entity(name|logicalname|typecode)?|objecttypecode|primaryentity(typecode)?)/i;

const getBpfDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  workflowName: z.string().optional().describe("BPF display name"),
  uniqueName: z.string().optional().describe("BPF unique name or workflow id"),
};

type GetBpfDetailsParams = ToolParams<typeof getBpfDetailsSchema>;

interface BpfStage {
  processStageId: string;
  stageName: string;
  stageCategory: number | null;
  stageCategoryLabel: string;
  primaryEntity: string;
  parentProcessStageId: string;
}

interface BpfFieldReference {
  entity: string | null;
  logicalName: string;
  displayName: string;
  sourcePath: string;
  confidence: "high" | "medium";
}

interface BpfTransition {
  fromStageId: string;
  fromStageName: string;
  toStageId: string;
  toStageName: string;
  source: "runtime" | "hierarchy";
  count: number;
}

interface BpfRuntimeInstance {
  recordId: string;
  label: string;
  stateLabel: string;
  statusLabel: string;
  activeStageId: string;
  activeStageName: string;
  traversedPathIds: string[];
  traversedPathLabel: string;
  modifiedOn: string;
}

interface BpfRuntimeSummary {
  table: TableRecord;
  columns: string[];
  totalCount: number | null;
  sampleInstances: BpfRuntimeInstance[];
  observedPaths: Array<{
    stageIds: string[];
    stageNames: string[];
    count: number;
  }>;
  transitions: BpfTransition[];
}

export async function handleGetBpfDetails(
  { environment, workflowName, uniqueName }: GetBpfDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    if (!workflowName && !uniqueName) {
      return createToolErrorResponse(
        "get_bpf_details",
        "Please provide either workflowName or uniqueName.",
      );
    }

    const env = getEnvironment(config, environment);
    const warnings: string[] = [];
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
      const text = `Business process flow '${workflowName || uniqueName}' not found in '${env.name}'.`;
      return createToolSuccessResponse("get_bpf_details", text, text, {
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

    const workflow = matchingWorkflows[0];
    if (Number(workflow.category || 0) !== 4) {
      return createToolErrorResponse(
        "get_bpf_details",
        `Workflow '${String(workflow.name || workflowName || uniqueName)}' is not a business process flow.`,
      );
    }

    const parsedClientData = parseJsonValue(workflow.clientdata);
    const stages = await fetchBpfStages(env, client, String(workflow.workflowid || ""), warnings);
    const backingTable = await resolveBpfBackingTable(env, client, workflow, warnings);
    const backingTableColumns = backingTable
      ? await fetchColumnsByLogicalName(env, client, backingTable.logicalName)
      : [];
    const runtimeSummary = backingTable
      ? await loadRuntimeSummary(env, client, backingTable, backingTableColumns, stages, warnings)
      : null;
    const fieldsUsed = await extractBpfFieldReferences(
      env,
      client,
      parsedClientData,
      workflow,
      stages,
      warnings,
    );
    const stageOrder = buildStageOrder(stages, runtimeSummary?.observedPaths || []);
    const transitions = mergeTransitions(stages, runtimeSummary?.transitions || []);

    const lines: string[] = [];
    lines.push(`## Business Process Flow: ${String(workflow.name || "")}`);
    lines.push(`- **Unique Name**: ${String(workflow.uniquename || "(none)")}`);
    lines.push(`- **Workflow ID**: ${String(workflow.workflowid || "")}`);
    lines.push(
      `- **Status**: ${STATE_LABELS[Number(workflow.statecode || 0)] || String(workflow.statecode || "")}`,
    );
    lines.push(
      `- **Mode**: ${MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || "")}`,
    );
    lines.push(
      `- **Scope**: ${SCOPE_LABELS[Number(workflow.scope || 0)] || String(workflow.scope || "")}`,
    );
    lines.push(`- **Primary Entity**: ${String(workflow.primaryentity || "none")}`);
    lines.push(`- **Managed**: ${workflow.ismanaged ? "Yes" : "No"}`);
    lines.push(`- **Created**: ${String(workflow.createdon || "").slice(0, 10) || "-"}`);
    lines.push(`- **Modified**: ${String(workflow.modifiedon || "").slice(0, 10) || "-"}`);
    if (workflow.description) {
      lines.push(`- **Description**: ${String(workflow.description)}`);
    }
    if (backingTable) {
      lines.push(
        `- **Backing BPF Table**: ${backingTable.logicalName} (entity set \`${backingTable.entitySetName}\`)`,
      );
    } else {
      lines.push("- **Backing BPF Table**: Not resolved");
    }

    lines.push("");
    lines.push("### Fields Used");
    if (fieldsUsed.length > 0) {
      lines.push(
        formatTable(
          ["Entity", "Field", "Display", "Confidence", "Source"],
          fieldsUsed.map((field) => [
            field.entity || String(workflow.primaryentity || "unknown"),
            field.logicalName,
            field.displayName || "-",
            field.confidence,
            field.sourcePath,
          ]),
        ),
      );
    } else {
      lines.push(
        "No business field references were extracted confidently from the BPF definition payload.",
      );
    }

    lines.push("");
    lines.push("### Stages");
    if (stageOrder.length > 0) {
      lines.push(
        formatTable(
          ["Order", "Stage", "Category", "Entity", "Parent"],
          stageOrder.map((stage, index) => [
            String(index + 1),
            stage.stageName,
            stage.stageCategoryLabel,
            stage.primaryEntity || "-",
            stage.parentProcessStageId
              ? stageNameById(stage.parentProcessStageId, stages) || stage.parentProcessStageId
              : "-",
          ]),
        ),
      );
    } else {
      lines.push("No `processstage` rows were found for this BPF definition.");
    }

    lines.push("");
    lines.push("### Branching And Transitions");
    if (transitions.length > 0) {
      lines.push(
        formatTable(
          ["From", "To", "Source", "Count"],
          transitions.map((transition) => [
            transition.fromStageName,
            transition.toStageName,
            transition.source,
            String(transition.count),
          ]),
        ),
      );
    } else {
      lines.push("No stage-to-stage transitions were inferred from hierarchy or runtime paths.");
    }

    lines.push("");
    lines.push("### Runtime Behavior");
    if (runtimeSummary) {
      const runtimeColumnsText =
        runtimeSummary.columns.length > 0 ? runtimeSummary.columns.join(", ") : "(none detected)";
      lines.push(
        `Instances are stored in \`${runtimeSummary.table.logicalName}\` and use runtime columns such as ${runtimeColumnsText}.`,
      );
      if (runtimeSummary.totalCount !== null) {
        lines.push(`Detected ${runtimeSummary.totalCount} instance row(s) in the backing table.`);
      }
      if (runtimeSummary.sampleInstances.length > 0) {
        lines.push("");
        lines.push(
          formatTable(
            ["Instance", "Active Stage", "Traversed Path", "State", "Modified"],
            runtimeSummary.sampleInstances.map((item) => [
              item.label,
              item.activeStageName || item.activeStageId || "-",
              item.traversedPathLabel || "-",
              [item.stateLabel, item.statusLabel].filter(Boolean).join(" / ") || "-",
              item.modifiedOn || "-",
            ]),
          ),
        );
      } else {
        lines.push("No sample runtime rows were returned from the backing table.");
      }
    } else {
      lines.push(
        "Runtime instance behavior could not be inspected because the backing BPF table was not resolved.",
      );
    }

    if (parsedClientData) {
      lines.push("");
      lines.push("### Definition Payload");
      lines.push(`\`\`\`json\n${JSON.stringify(parsedClientData, null, 2).slice(0, 6000)}\n\`\`\``);
    }

    if (warnings.length > 0) {
      lines.push("");
      lines.push("### Warnings");
      for (const warning of warnings) {
        lines.push(`- ${warning}`);
      }
    }

    return createToolSuccessResponse(
      "get_bpf_details",
      lines.join("\n"),
      `Loaded business process flow '${String(workflow.name || workflowName || uniqueName)}' in '${env.name}'.`,
      {
        environment: env.name,
        found: true,
        warnings,
        bpf: {
          workflowid: String(workflow.workflowid || ""),
          name: String(workflow.name || ""),
          uniqueName: String(workflow.uniquename || ""),
          category: Number(workflow.category || 0),
          categoryLabel:
            CATEGORY_LABELS[Number(workflow.category || 0)] || String(workflow.category || ""),
          state: Number(workflow.statecode || 0),
          stateLabel:
            STATE_LABELS[Number(workflow.statecode || 0)] || String(workflow.statecode || ""),
          mode: Number(workflow.mode || 0),
          modeLabel: MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || ""),
          scope: Number(workflow.scope || 0),
          scopeLabel: SCOPE_LABELS[Number(workflow.scope || 0)] || String(workflow.scope || ""),
          primaryEntity: String(workflow.primaryentity || ""),
          description: String(workflow.description || ""),
          isManaged: Boolean(workflow.ismanaged),
          createdOn: String(workflow.createdon || ""),
          modifiedOn: String(workflow.modifiedon || ""),
          backingTable,
          fieldsUsed,
          stages: stageOrder,
          transitions,
          runtimeSummary,
          clientData: parsedClientData,
          clientDataRaw: String(workflow.clientdata || ""),
        },
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_bpf_details", error);
  }
}

export const getBpfDetailsTool = defineTool({
  name: "get_bpf_details",
  description:
    "Show business process flow details including stages, inferred business fields, backing table, and runtime-state behavior.",
  schema: getBpfDetailsSchema,
  handler: handleGetBpfDetails,
});

export function registerGetBpfDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getBpfDetailsTool, { config, client });
}

async function fetchBpfStages(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  workflowId: string,
  warnings: string[],
): Promise<BpfStage[]> {
  const stageQueries = [
    query()
      .select([
        "processstageid",
        "stagename",
        "stagecategory",
        "primaryentitytypecode",
        "_processid_value",
        "_parentprocessstageid_value",
      ])
      .filter(rawFilter(`_processid_value eq ${odataStringLiteral(workflowId)}`))
      .toString(),
    query()
      .select([
        "processstageid",
        "stagename",
        "stagecategory",
        "primaryentitytypecode",
        "_processid_value",
        "_parentprocessstageid_value",
      ])
      .filter(rawFilter(`processid/workflowid eq ${odataStringLiteral(workflowId)}`))
      .toString(),
  ];

  for (const stageQuery of stageQueries) {
    try {
      const rows = await client.query<Record<string, unknown>>(env, "processstages", stageQuery, {
        cacheTier: CACHE_TIERS.VOLATILE,
      });
      if (rows.length > 0) {
        return rows.map(normalizeStage).sort(compareStagesByName);
      }
    } catch {
      // Try the next query form.
    }
  }

  warnings.push(
    "No `processstage` rows were returned. This can happen when the org exposes stage relationships differently or the BPF has no published stage metadata.",
  );
  return [];
}

async function resolveBpfBackingTable(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  workflow: Record<string, unknown>,
  warnings: string[],
): Promise<TableRecord | null> {
  const uniqueName = String(workflow.uniquename || "").trim();
  if (!uniqueName) {
    warnings.push("BPF unique name was empty, so the backing table could not be resolved.");
    return null;
  }

  try {
    return await resolveTable(env, client, uniqueName);
  } catch {
    // Fall through to a broader search.
  }

  const tables = await listTables(env, client);
  const candidates = tables
    .map((table) => ({ table, score: scoreBackingTableCandidate(table, workflow) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    warnings.push(`Could not resolve a backing BPF table from unique name '${uniqueName}'.`);
    return null;
  }

  const topCandidates = candidates.slice(0, 3);
  const enriched = await Promise.all(
    topCandidates.map(async (candidate) => ({
      ...candidate,
      score:
        candidate.score +
        ((await looksLikeRuntimeBpfTable(env, client, candidate.table.logicalName)) ? 50 : 0),
    })),
  );
  enriched.sort((left, right) => right.score - left.score);

  if (enriched.length > 1 && enriched[0].score === enriched[1].score) {
    warnings.push(
      `Backing BPF table was ambiguous for '${uniqueName}'. Best matches: ${enriched
        .slice(0, 2)
        .map((item) => item.table.logicalName)
        .join(", ")}.`,
    );
    return null;
  }

  return enriched[0]?.table || null;
}

async function looksLikeRuntimeBpfTable(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  logicalName: string,
): Promise<boolean> {
  try {
    const columns = await fetchColumnsByLogicalName(env, client, logicalName);
    const columnNames = new Set(columns.map((column) => column.logicalName));
    return columnNames.has("traversedpath") || columnNames.has("activestageid");
  } catch {
    return false;
  }
}

async function loadRuntimeSummary(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  table: TableRecord,
  columns: TableColumnRecord[],
  stages: BpfStage[],
  warnings: string[],
): Promise<BpfRuntimeSummary | null> {
  const columnsByLogicalName = new Map(columns.map((column) => [column.logicalName, column]));
  const stageIds = new Set(stages.map((stage) => stage.processStageId));
  const stageNameMap = new Map(stages.map((stage) => [stage.processStageId, stage.stageName]));
  const runtimeColumnNames = [
    "activestageid",
    "activestagestartedon",
    "traversedpath",
    "statecode",
    "statuscode",
    "createdon",
    "modifiedon",
  ].filter((name) => columnsByLogicalName.has(name));
  const entityLookupColumns = columns
    .filter((column) => column.targets.length > 0)
    .filter(
      (column) =>
        column.logicalName.startsWith("bpf_") ||
        column.targets.some((target) =>
          stages.some((stage) => stage.primaryEntity && stage.primaryEntity === target),
        ),
    )
    .slice(0, 4)
    .map((column) => column.logicalName);

  const selectFields = uniqueStrings([
    table.primaryIdAttribute,
    table.primaryNameAttribute,
    ...runtimeColumnNames,
    ...entityLookupColumns,
  ]).map((logicalName) => getSelectName(columnsByLogicalName.get(logicalName), logicalName));

  try {
    const page = await client.queryPage<Record<string, unknown>>(
      env,
      table.entitySetName,
      query()
        .select(selectFields)
        .orderby(
          columnsByLogicalName.has("modifiedon")
            ? "modifiedon desc"
            : `${table.primaryIdAttribute} asc`,
        )
        .top(5)
        .count(true)
        .toString(),
      { cacheTier: CACHE_TIERS.VOLATILE },
    );

    const sampleInstances = page.items.map((item) =>
      normalizeRuntimeInstance(item, table, columnsByLogicalName, stageNameMap),
    );
    const observedPaths = summarizeObservedPaths(sampleInstances);
    const runtimeTransitions = buildRuntimeTransitions(observedPaths, stageNameMap, stageIds);

    return {
      table,
      columns: [...runtimeColumnNames, ...entityLookupColumns],
      totalCount: page.totalCount,
      sampleInstances,
      observedPaths,
      transitions: runtimeTransitions,
    };
  } catch {
    warnings.push(
      `Backing table '${table.logicalName}' was resolved, but runtime rows could not be queried.`,
    );
    return {
      table,
      columns: [...runtimeColumnNames, ...entityLookupColumns],
      totalCount: null,
      sampleInstances: [],
      observedPaths: [],
      transitions: [],
    };
  }
}

async function extractBpfFieldReferences(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  clientData: unknown,
  workflow: Record<string, unknown>,
  stages: BpfStage[],
  warnings: string[],
): Promise<BpfFieldReference[]> {
  if (!clientData || typeof clientData !== "object") {
    warnings.push("BPF clientdata was empty or not valid JSON, so field extraction was limited.");
    return [];
  }

  const entityNames = uniqueStrings([
    String(workflow.primaryentity || ""),
    ...stages.map((stage) => stage.primaryEntity),
  ]).filter(Boolean);

  if (entityNames.length === 0) {
    return [];
  }

  const columnsByEntity = new Map<
    string,
    {
      names: Set<string>;
      displayNameByLogicalName: Map<string, string>;
    }
  >();

  await Promise.all(
    entityNames.map(async (entityName) => {
      try {
        const columns = await fetchColumnsByLogicalName(env, client, entityName);
        columnsByEntity.set(entityName, {
          names: new Set(columns.map((column) => column.logicalName)),
          displayNameByLogicalName: new Map(
            columns.map((column) => [column.logicalName, column.displayName || column.logicalName]),
          ),
        });
      } catch {
        warnings.push(`Could not load columns for participating entity '${entityName}'.`);
      }
    }),
  );

  const fieldRefs = new Map<string, BpfFieldReference>();
  walkClientData(clientData, [], undefined, (value, path, entityContext) => {
    if (typeof value !== "string" || !value.trim()) {
      return;
    }

    const pathText = path.join(".");
    const pathHasFieldHint = path.some((segment) => FIELD_HINT_RE.test(segment));
    const currentKey = path[path.length - 1] || "";
    const candidates = expandFieldCandidates(value);

    for (const candidate of candidates) {
      const match = resolveFieldCandidate(
        candidate,
        currentKey,
        entityContext,
        pathHasFieldHint,
        columnsByEntity,
      );
      if (!match) {
        continue;
      }

      const key = `${match.entity || "?"}:${match.logicalName}`;
      const previous = fieldRefs.get(key);
      if (!previous || previous.confidence === "medium") {
        fieldRefs.set(key, {
          ...match,
          sourcePath: pathText || "(root)",
        });
      }
    }
  });

  return [...fieldRefs.values()].sort(
    (left, right) =>
      (left.entity || "").localeCompare(right.entity || "") ||
      left.logicalName.localeCompare(right.logicalName),
  );
}

function buildStageOrder(
  stages: BpfStage[],
  observedPaths: Array<{ stageIds: string[]; stageNames: string[]; count: number }>,
): BpfStage[] {
  if (stages.length === 0) {
    return [];
  }

  const stageById = new Map(stages.map((stage) => [stage.processStageId, stage]));
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const preferredPath =
    [...observedPaths].sort(
      (left, right) => right.count - left.count || right.stageIds.length - left.stageIds.length,
    )[0]?.stageIds || [];
  for (const stageId of preferredPath) {
    if (stageById.has(stageId) && !seen.has(stageId)) {
      seen.add(stageId);
      orderedIds.push(stageId);
    }
  }

  const childrenByParent = buildChildrenByParent(stages);
  const roots = stages
    .filter((stage) => !stage.parentProcessStageId || !stageById.has(stage.parentProcessStageId))
    .sort(compareStagesByName);
  for (const root of roots) {
    visitStage(root.processStageId, childrenByParent, stageById, seen, orderedIds);
  }

  for (const stage of [...stages].sort(compareStagesByName)) {
    if (!seen.has(stage.processStageId)) {
      orderedIds.push(stage.processStageId);
      seen.add(stage.processStageId);
    }
  }

  return orderedIds
    .map((stageId) => stageById.get(stageId))
    .filter((stage): stage is BpfStage => Boolean(stage));
}

function mergeTransitions(
  stages: BpfStage[],
  runtimeTransitions: BpfTransition[],
): BpfTransition[] {
  const transitionMap = new Map<string, BpfTransition>();
  for (const transition of runtimeTransitions) {
    transitionMap.set(`${transition.fromStageId}->${transition.toStageId}`, transition);
  }

  const stageById = new Map(stages.map((stage) => [stage.processStageId, stage]));
  for (const stage of stages) {
    if (!stage.parentProcessStageId || !stageById.has(stage.parentProcessStageId)) {
      continue;
    }
    const parent = stageById.get(stage.parentProcessStageId);
    if (!parent) {
      continue;
    }
    const key = `${parent.processStageId}->${stage.processStageId}`;
    if (transitionMap.has(key)) {
      continue;
    }
    transitionMap.set(key, {
      fromStageId: parent.processStageId,
      fromStageName: parent.stageName,
      toStageId: stage.processStageId,
      toStageName: stage.stageName,
      source: "hierarchy",
      count: 1,
    });
  }

  return [...transitionMap.values()].sort(
    (left, right) =>
      left.fromStageName.localeCompare(right.fromStageName) ||
      left.toStageName.localeCompare(right.toStageName),
  );
}

function normalizeStage(row: Record<string, unknown>): BpfStage {
  const stageCategory = getNumberValue(row.stagecategory);
  return {
    processStageId: String(row.processstageid || ""),
    stageName: String(row.stagename || ""),
    stageCategory,
    stageCategoryLabel:
      getFormattedValue(row, "stagecategory") ||
      (stageCategory !== null
        ? STAGE_CATEGORY_LABELS[stageCategory] || String(stageCategory)
        : "-"),
    primaryEntity: String(row.primaryentitytypecode || ""),
    parentProcessStageId: String(row._parentprocessstageid_value || ""),
  };
}

function normalizeRuntimeInstance(
  row: Record<string, unknown>,
  table: TableRecord,
  columnsByLogicalName: Map<string, TableColumnRecord>,
  stageNameMap: Map<string, string>,
): BpfRuntimeInstance {
  const recordId = String(row[table.primaryIdAttribute] || "");
  const label =
    String(row[table.primaryNameAttribute] || "") ||
    getFormattedValue(row, table.primaryNameAttribute) ||
    recordId ||
    "(unnamed instance)";
  const activeStageId = String(row._activestageid_value || row.activestageid || "");
  const traversedPathIds = String(row.traversedpath || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    recordId,
    label,
    stateLabel: getFormattedValue(row, "statecode") || String(row.statecode || ""),
    statusLabel: getFormattedValue(row, "statuscode") || String(row.statuscode || ""),
    activeStageId,
    activeStageName:
      getFormattedValue(row, "_activestageid_value") ||
      stageNameMap.get(activeStageId) ||
      String(readLookupLabel(row, columnsByLogicalName.get("activestageid")) || ""),
    traversedPathIds,
    traversedPathLabel: traversedPathIds
      .map((stageId) => stageNameMap.get(stageId) || stageId)
      .join(" -> "),
    modifiedOn: String(row.modifiedon || "").slice(0, 10),
  };
}

function summarizeObservedPaths(
  instances: BpfRuntimeInstance[],
): Array<{ stageIds: string[]; stageNames: string[]; count: number }> {
  const counts = new Map<string, { stageIds: string[]; stageNames: string[]; count: number }>();
  for (const instance of instances) {
    if (instance.traversedPathIds.length === 0) {
      continue;
    }
    const key = instance.traversedPathIds.join(",");
    const current = counts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    counts.set(key, {
      stageIds: [...instance.traversedPathIds],
      stageNames: instance.traversedPathLabel
        ? instance.traversedPathLabel.split(" -> ").filter(Boolean)
        : [...instance.traversedPathIds],
      count: 1,
    });
  }

  return [...counts.values()].sort((left, right) => right.count - left.count);
}

function buildRuntimeTransitions(
  observedPaths: Array<{ stageIds: string[]; stageNames: string[]; count: number }>,
  stageNameMap: Map<string, string>,
  knownStageIds: Set<string>,
): BpfTransition[] {
  const transitions = new Map<string, BpfTransition>();
  for (const path of observedPaths) {
    for (let index = 0; index < path.stageIds.length - 1; index += 1) {
      const fromStageId = path.stageIds[index];
      const toStageId = path.stageIds[index + 1];
      if (!knownStageIds.has(fromStageId) || !knownStageIds.has(toStageId)) {
        continue;
      }
      const key = `${fromStageId}->${toStageId}`;
      const current = transitions.get(key);
      if (current) {
        current.count += path.count;
        continue;
      }
      transitions.set(key, {
        fromStageId,
        fromStageName: stageNameMap.get(fromStageId) || fromStageId,
        toStageId,
        toStageName: stageNameMap.get(toStageId) || toStageId,
        source: "runtime",
        count: path.count,
      });
    }
  }

  return [...transitions.values()].sort((left, right) => right.count - left.count);
}

function buildChildrenByParent(stages: BpfStage[]): Map<string, BpfStage[]> {
  const childrenByParent = new Map<string, BpfStage[]>();
  for (const stage of stages) {
    const key = stage.parentProcessStageId || "__root__";
    const group = childrenByParent.get(key) || [];
    group.push(stage);
    childrenByParent.set(key, group);
  }
  for (const group of childrenByParent.values()) {
    group.sort(compareStagesByName);
  }
  return childrenByParent;
}

function visitStage(
  stageId: string,
  childrenByParent: Map<string, BpfStage[]>,
  stageById: Map<string, BpfStage>,
  seen: Set<string>,
  orderedIds: string[],
): void {
  if (seen.has(stageId) || !stageById.has(stageId)) {
    return;
  }
  seen.add(stageId);
  orderedIds.push(stageId);
  for (const child of childrenByParent.get(stageId) || []) {
    visitStage(child.processStageId, childrenByParent, stageById, seen, orderedIds);
  }
}

function compareStagesByName(left: BpfStage, right: BpfStage): number {
  return (
    left.stageName.localeCompare(right.stageName) ||
    left.primaryEntity.localeCompare(right.primaryEntity) ||
    left.processStageId.localeCompare(right.processStageId)
  );
}

function scoreBackingTableCandidate(table: TableRecord, workflow: Record<string, unknown>): number {
  const uniqueName = String(workflow.uniquename || "").toLowerCase();
  const workflowName = String(workflow.name || "").toLowerCase();
  const logicalName = table.logicalName.toLowerCase();
  const schemaName = table.schemaName.toLowerCase();
  const displayName = table.displayName.toLowerCase();
  const entitySetName = table.entitySetName.toLowerCase();
  let score = 0;

  if (logicalName === uniqueName) score += 100;
  if (schemaName === uniqueName) score += 95;
  if (entitySetName === uniqueName) score += 80;
  if (displayName === workflowName && workflowName) score += 35;
  if (logicalName.includes(uniqueName) && uniqueName) score += 25;
  if (schemaName.includes(uniqueName) && uniqueName) score += 20;
  if (displayName.includes(workflowName) && workflowName) score += 10;

  return score;
}

function resolveFieldCandidate(
  candidate: string,
  currentKey: string,
  entityContext: string | undefined,
  pathHasFieldHint: boolean,
  columnsByEntity: Map<
    string,
    {
      names: Set<string>;
      displayNameByLogicalName: Map<string, string>;
    }
  >,
): Omit<BpfFieldReference, "sourcePath"> | null {
  const trimmed = candidate.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const entityQualifiedMatch = trimmed.match(/^([a-z][a-z0-9_]+)\.([a-z][a-z0-9_]+)$/);
  if (entityQualifiedMatch) {
    const entity = entityQualifiedMatch[1];
    const logicalName = entityQualifiedMatch[2];
    const metadata = columnsByEntity.get(entity);
    if (metadata?.names.has(logicalName)) {
      return {
        entity,
        logicalName,
        displayName: metadata.displayNameByLogicalName.get(logicalName) || logicalName,
        confidence: "high",
      };
    }
  }

  const keyHasFieldHint = FIELD_HINT_RE.test(currentKey);
  if (!pathHasFieldHint && !keyHasFieldHint) {
    return null;
  }

  if (entityContext) {
    const metadata = columnsByEntity.get(entityContext);
    if (metadata?.names.has(trimmed)) {
      return {
        entity: entityContext,
        logicalName: trimmed,
        displayName: metadata.displayNameByLogicalName.get(trimmed) || trimmed,
        confidence: keyHasFieldHint ? "high" : "medium",
      };
    }
  }

  const matches = [...columnsByEntity.entries()].filter(([, metadata]) =>
    metadata.names.has(trimmed),
  );
  if (matches.length === 1) {
    const [entity, metadata] = matches[0];
    return {
      entity,
      logicalName: trimmed,
      displayName: metadata.displayNameByLogicalName.get(trimmed) || trimmed,
      confidence: keyHasFieldHint ? "high" : "medium",
    };
  }

  return null;
}

function walkClientData(
  value: unknown,
  path: string[],
  entityContext: string | undefined,
  visitString: (value: string, path: string[], entityContext?: string) => void,
): void {
  if (typeof value === "string") {
    visitString(value, path, entityContext);
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkClientData(value[index], [...path, String(index)], entityContext, visitString);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  let nextEntityContext = entityContext;
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string" && ENTITY_HINT_RE.test(key)) {
      nextEntityContext = child.trim().toLowerCase() || nextEntityContext;
    }
  }

  for (const [key, child] of Object.entries(record)) {
    walkClientData(child, [...path, key], nextEntityContext, visitString);
  }
}

function expandFieldCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  return uniqueStrings(
    trimmed
      .split(/[,\n;]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => [part, part.replace(/[{}[\]"']/g, "").trim()])
      .filter(Boolean),
  );
}

function getSelectName(column: TableColumnRecord | undefined, fallbackLogicalName: string): string {
  return column && column.targets.length > 0 ? `_${column.logicalName}_value` : fallbackLogicalName;
}

function getFormattedValue(record: Record<string, unknown>, fieldName: string): string {
  return String(record[`${fieldName}${FORMATTED_VALUE_SUFFIX}`] || "");
}

function readLookupLabel(record: Record<string, unknown>, column?: TableColumnRecord): string {
  if (!column || column.targets.length === 0) {
    return "";
  }
  return getFormattedValue(record, `_${column.logicalName}_value`);
}

function getNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stageNameById(stageId: string, stages: BpfStage[]): string {
  return stages.find((stage) => stage.processStageId === stageId)?.stageName || "";
}

function createAmbiguousWorkflowError(
  environmentName: string,
  workflowRef: string,
  matches: Record<string, unknown>[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Business process flow '${workflowRef}' is ambiguous in '${environmentName}'. Choose a BPF and try again. Matches: ${matches.map(formatWorkflowMatch).join(", ")}.`,
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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
