import { createHash } from "node:crypto";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getCloudFlowDetailsByIdentityQuery,
  listCloudFlowsQuery,
} from "../../queries/flow-queries.js";
import { listWorkflowsByIdsQuery, type WorkflowState } from "../../queries/workflow-queries.js";
import { fetchSolutionComponentSets } from "../solutions/solution-inventory.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";

const STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

const TYPE_LABELS: Record<number, string> = {
  1: "Definition",
  2: "Activation",
  3: "Template",
};

export interface FlowSummary {
  hash: string;
  schemaVersion: string;
  triggerNames: string[];
  actionNames: string[];
  connectionReferenceNames: string[];
}

export interface CloudFlowRecord extends Record<string, unknown> {
  workflowid: string;
  workflowidunique: string;
  name: string;
  uniquename: string;
  category: number;
  statecode: number;
  stateLabel: string;
  statuscode: number;
  type: number;
  typeLabel: string;
  primaryentity: string;
  description: string;
  ismanaged: boolean;
  clientdata: string;
  connectionreferences: string;
  createdon: string;
  modifiedon: string;
  createdByName: string;
  modifiedByName: string;
  ownerName: string;
}

export interface CloudFlowDetails extends CloudFlowRecord {
  summary: FlowSummary;
}

export async function listCloudFlows(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    status?: WorkflowState;
    nameFilter?: string;
    solution?: string;
  },
): Promise<CloudFlowRecord[]> {
  if (options?.solution) {
    const solutionComponents = await fetchSolutionComponentSets(env, client, options.solution);
    const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
      env,
      client,
      "workflows",
      [...solutionComponents.workflowIds],
      "workflowid",
      listWorkflowsByIdsQuery,
    );

    return records
      .map(normalizeFlow)
      .filter((flow) => flow.category === 5)
      .filter((flow) => matchesFlowFilter(flow, options));
  }

  return (
    await client.query<Record<string, unknown>>(
      env,
      "workflows",
      listCloudFlowsQuery({
        status: options?.status,
        nameFilter: options?.nameFilter,
      }),
    )
  )
    .map(normalizeFlow)
    .filter((flow) => flow.category === 5);
}

export async function resolveCloudFlow(
  env: EnvironmentConfig,
  client: DynamicsClient,
  flowRef: string,
  solution?: string,
): Promise<CloudFlowRecord> {
  const flows = await listCloudFlows(env, client, { solution });
  const exactUnique = flows.filter((flow) => flow.uniquename === flowRef);
  if (exactUnique.length === 1) {
    return exactUnique[0];
  }

  const exactName = flows.filter((flow) => flow.name === flowRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const needle = flowRef.trim().toLowerCase();
  const partialMatches = uniqueFlows(
    flows.filter(
      (flow) =>
        flow.uniquename.toLowerCase().includes(needle) || flow.name.toLowerCase().includes(needle),
    ),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Cloud flow '${flowRef}' is ambiguous in '${env.name}'. Matches: ${partialMatches
        .map((flow) => `${flow.name} (${flow.uniquename})`)
        .join(", ")}.`,
    );
  }

  throw new Error(`Cloud flow '${flowRef}' not found in '${env.name}'.`);
}

export async function fetchFlowDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  flowRef: string,
  solution?: string,
): Promise<CloudFlowDetails> {
  const flow = await resolveCloudFlow(env, client, flowRef, solution);
  const records = await client.query<Record<string, unknown>>(
    env,
    "workflows",
    getCloudFlowDetailsByIdentityQuery({
      uniqueName: flow.uniquename || undefined,
      flowName: flow.uniquename ? undefined : flow.name,
    }),
  );
  const record = records.find((item) => String(item.workflowid || "") === flow.workflowid);

  if (!record) {
    throw new Error(`Cloud flow '${flow.name}' not found in '${env.name}'.`);
  }

  const normalized = normalizeFlow(record);
  return {
    ...normalized,
    summary: summarizeFlowJson(normalized.clientdata, normalized.connectionreferences),
  };
}

function normalizeFlow(record: Record<string, unknown>): CloudFlowRecord {
  const statecode = Number(record.statecode || 0);
  const type = Number(record.type || 0);

  return {
    ...record,
    workflowid: String(record.workflowid || ""),
    workflowidunique: String(record.workflowidunique || ""),
    name: String(record.name || ""),
    uniquename: String(record.uniquename || ""),
    category: Number(record.category || 0),
    statecode,
    stateLabel: STATE_LABELS[statecode] || String(statecode),
    statuscode: Number(record.statuscode || 0),
    type,
    typeLabel: TYPE_LABELS[type] || String(type),
    primaryentity: String(record.primaryentity || ""),
    description: String(record.description || ""),
    ismanaged: Boolean(record.ismanaged),
    clientdata: String(record.clientdata || ""),
    connectionreferences: String(record.connectionreferences || ""),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
    createdByName: String(
      record["_createdby_value@OData.Community.Display.V1.FormattedValue"] || "",
    ),
    modifiedByName: String(
      record["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] || "",
    ),
    ownerName: String(record["_ownerid_value@OData.Community.Display.V1.FormattedValue"] || ""),
  };
}

function summarizeFlowJson(clientdata: string, connectionreferences: string): FlowSummary {
  const parsedClientData = parseJsonObject(clientdata);
  const properties = getObject(parsedClientData?.properties);
  const definition = getObject(properties?.definition);
  const triggers = getObject(definition?.triggers);
  const actions = getObject(definition?.actions);
  const clientConnections = getObject(properties?.connectionReferences);
  const externalConnections = parseJsonObject(connectionreferences);
  const mergedConnectionNames = uniqueStrings([
    ...Object.keys(clientConnections || {}),
    ...Object.keys(externalConnections || {}),
  ]);

  const normalized = JSON.stringify(
    parsedClientData || parseJsonObject(connectionreferences) || {},
  );

  return {
    hash: createHash("sha256").update(normalized).digest("hex").slice(0, 12),
    schemaVersion: String(parsedClientData?.schemaVersion || definition?.$schema || ""),
    triggerNames: Object.keys(triggers || {}).sort(),
    actionNames: Object.keys(actions || {}).sort(),
    connectionReferenceNames: mergedConnectionNames.sort(),
  };
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return getObject(parsed);
  } catch {
    return undefined;
  }
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueFlows(flows: CloudFlowRecord[]): CloudFlowRecord[] {
  const seen = new Set<string>();

  return flows.filter((flow) => {
    if (seen.has(flow.workflowid)) {
      return false;
    }
    seen.add(flow.workflowid);
    return true;
  });
}

function matchesFlowFilter(
  flow: CloudFlowRecord,
  options?: {
    status?: WorkflowState;
    nameFilter?: string;
    solution?: string;
  },
): boolean {
  if (options?.status) {
    const stateByStatus: Record<WorkflowState, number> = {
      draft: 0,
      activated: 1,
      suspended: 2,
    };
    if (flow.statecode !== stateByStatus[options.status]) {
      return false;
    }
  }

  if (options?.nameFilter) {
    const needle = options.nameFilter.toLowerCase();
    return (
      flow.name.toLowerCase().includes(needle) || flow.uniquename.toLowerCase().includes(needle)
    );
  }

  return true;
}
