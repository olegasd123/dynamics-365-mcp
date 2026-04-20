import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listSdkMessageFiltersForTableQuery } from "../../queries/sdk-message-queries.js";
import { listActionsQuery } from "../../queries/workflow-queries.js";
import { listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { resolveTable, type TableRecord } from "./table-metadata.js";

const ACTION_STATE_LABELS: Record<number, string> = {
  0: "Draft",
  1: "Activated",
  2: "Suspended",
};

export interface TableSdkMessageRecord extends Record<string, unknown> {
  sdkmessageid: string;
  name: string;
  primaryobjecttypecode: string;
  filterIds: string[];
  customProcessingStepAllowed: boolean;
}

export interface TableBoundActionRecord extends Record<string, unknown> {
  workflowid: string;
  name: string;
  uniquename: string;
  primaryentity: string;
  statecode: number;
  stateLabel: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface TableBoundCustomApiRecord extends Record<string, unknown> {
  customapiid: string;
  name: string;
  uniquename: string;
  bindingtype: number;
  bindingTypeLabel: string;
  isfunction: boolean;
  allowedcustomprocessingsteptype: number;
  allowedProcessingStepLabel: string;
  workflowsdkstepenabled: boolean;
  statecode: number;
  stateLabel: string;
  modifiedon: string;
}

export interface TableMessageInventory {
  table: TableRecord;
  sdkMessages: TableSdkMessageRecord[];
  customActions: TableBoundActionRecord[];
  customApis: TableBoundCustomApiRecord[];
}

export async function fetchTableMessages(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
): Promise<TableMessageInventory> {
  const table = await resolveTable(env, client, tableRef);
  const [sdkMessageFilters, workflows, customApis] = await Promise.all([
    client.query<Record<string, unknown>>(
      env,
      "sdkmessagefilters",
      listSdkMessageFiltersForTableQuery(table.logicalName),
    ),
    client.query<Record<string, unknown>>(env, "workflows", listActionsQuery()),
    listCustomApis(env, client),
  ]);

  return {
    table,
    sdkMessages: aggregateSdkMessages(sdkMessageFilters, table.logicalName),
    customActions: workflows
      .filter((workflow) => String(workflow.primaryentity || "") === table.logicalName)
      .map(normalizeBoundAction)
      .sort((left, right) => left.name.localeCompare(right.name)),
    customApis: customApis
      .filter(
        (api) =>
          api.boundentitylogicalname === table.logicalName && [1, 2].includes(api.bindingtype),
      )
      .map((api) => ({
        customapiid: api.customapiid,
        name: api.name,
        uniquename: api.uniquename,
        bindingtype: api.bindingtype,
        bindingTypeLabel: api.bindingTypeLabel,
        isfunction: api.isfunction,
        allowedcustomprocessingsteptype: api.allowedcustomprocessingsteptype,
        allowedProcessingStepLabel: api.allowedProcessingStepLabel,
        workflowsdkstepenabled: api.workflowsdkstepenabled,
        statecode: api.statecode,
        stateLabel: api.stateLabel,
        modifiedon: api.modifiedon,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function aggregateSdkMessages(
  filters: Record<string, unknown>[],
  tableLogicalName: string,
): TableSdkMessageRecord[] {
  const byMessage = new Map<string, TableSdkMessageRecord>();

  for (const filter of filters.filter(
    (item) => String(item.primaryobjecttypecode || "") === tableLogicalName,
  )) {
    const sdkMessage = getRecord(filter.sdkmessageid);
    const sdkMessageId = String(sdkMessage?.sdkmessageid || "");
    const messageName = String(sdkMessage?.name || "");
    const key = sdkMessageId || messageName;
    if (!key) {
      continue;
    }

    const current = byMessage.get(key);
    if (!current) {
      byMessage.set(key, {
        sdkmessageid: sdkMessageId,
        name: messageName,
        primaryobjecttypecode: String(filter.primaryobjecttypecode || tableLogicalName),
        filterIds: [String(filter.sdkmessagefilterid || "")].filter(Boolean),
        customProcessingStepAllowed: getBooleanValue(filter.iscustomprocessingstepallowed),
      });
      continue;
    }

    current.customProcessingStepAllowed =
      current.customProcessingStepAllowed || getBooleanValue(filter.iscustomprocessingstepallowed);
    const filterId = String(filter.sdkmessagefilterid || "");
    if (filterId && !current.filterIds.includes(filterId)) {
      current.filterIds.push(filterId);
    }
  }

  return [...byMessage.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeBoundAction(workflow: Record<string, unknown>): TableBoundActionRecord {
  const statecode = Number(workflow.statecode || 0);

  return {
    workflowid: String(workflow.workflowid || ""),
    name: String(workflow.name || ""),
    uniquename: String(workflow.uniquename || ""),
    primaryentity: String(workflow.primaryentity || ""),
    statecode,
    stateLabel: ACTION_STATE_LABELS[statecode] || String(statecode),
    ismanaged: Boolean(workflow.ismanaged),
    modifiedon: String(workflow.modifiedon || ""),
  };
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function getBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const record = getRecord(value);
  if (typeof record?.Value === "boolean") {
    return record.Value;
  }
  if (typeof record?.value === "boolean") {
    return record.value;
  }

  return false;
}
