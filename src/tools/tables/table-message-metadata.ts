import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listSdkMessageFiltersForTableQuery } from "../../queries/sdk-message-queries.js";
import { listActionsQuery } from "../../queries/workflow-queries.js";
import { listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";
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

export interface TableSdkMessageFilterRecord extends Record<string, unknown> {
  sdkmessagefilterid: string;
  primaryobjecttypecode: string;
  sdkmessageid: string;
  messageName: string;
  customProcessingStepAllowed: boolean;
}

export interface TableMessageInventory {
  table: TableRecord;
  sdkMessages: TableSdkMessageRecord[];
  customActions: TableBoundActionRecord[];
  customApis: TableBoundCustomApiRecord[];
}

export interface TableMessageDetails {
  table: TableRecord;
  message: TableSdkMessageRecord;
  filters: TableSdkMessageFilterRecord[];
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

export async function fetchTableMessageDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  messageRef: string,
): Promise<TableMessageDetails> {
  const table = await resolveTable(env, client, tableRef);
  const sdkMessageFilters = await client.query<Record<string, unknown>>(
    env,
    "sdkmessagefilters",
    listSdkMessageFiltersForTableQuery(table.logicalName),
  );
  const normalizedFilters = normalizeSdkMessageFilters(sdkMessageFilters, table.logicalName);
  const sdkMessages = aggregateSdkMessagesFromNormalizedFilters(
    normalizedFilters,
    table.logicalName,
  );
  const message = resolveTableMessage(table.logicalName, messageRef, sdkMessages);

  return {
    table,
    message,
    filters: normalizedFilters.filter((filter) => {
      const matchesId = message.sdkmessageid && filter.sdkmessageid === message.sdkmessageid;
      const matchesName = !message.sdkmessageid && filter.messageName === message.name;
      return matchesId || matchesName;
    }),
  };
}

function aggregateSdkMessages(
  filters: Record<string, unknown>[],
  tableLogicalName: string,
): TableSdkMessageRecord[] {
  return aggregateSdkMessagesFromNormalizedFilters(
    normalizeSdkMessageFilters(filters, tableLogicalName),
    tableLogicalName,
  );
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

function resolveTableMessage(
  tableLogicalName: string,
  messageRef: string,
  messages: TableSdkMessageRecord[],
): TableSdkMessageRecord {
  const exactId = messages.filter((message) => message.sdkmessageid === messageRef);
  if (exactId.length === 1) {
    return exactId[0];
  }

  const exactName = messages.filter((message) => message.name === messageRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const needle = messageRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueMessages(
    messages.filter(
      (message) =>
        message.sdkmessageid.toLowerCase() === needle || message.name.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueMessages(
    messages.filter(
      (message) =>
        message.sdkmessageid.toLowerCase().includes(needle) ||
        message.name.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueMessages([
    ...exactId,
    ...exactName,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);

  if (matches.length > 1) {
    throw createAmbiguousTableMessageError(tableLogicalName, messageRef, matches);
  }

  throw new Error(`SDK message '${messageRef}' not found for table '${tableLogicalName}'.`);
}

function createAmbiguousTableMessageError(
  tableLogicalName: string,
  messageRef: string,
  matches: TableSdkMessageRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `SDK message '${messageRef}' is ambiguous for table '${tableLogicalName}'. Choose a message and try again. Matches: ${matches.map(formatMessageMatch).join(", ")}.`,
    {
      parameter: "messageName",
      options: matches.map((message) => createMessageOption(message)),
    },
  );
}

function createMessageOption(message: TableSdkMessageRecord): AmbiguousMatchOption {
  return {
    value: message.sdkmessageid || message.name,
    label: formatMessageMatch(message),
  };
}

function formatMessageMatch(message: TableSdkMessageRecord): string {
  const idSuffix = message.sdkmessageid ? ` (${message.sdkmessageid})` : "";
  return `${message.name}${idSuffix}`;
}

function aggregateSdkMessagesFromNormalizedFilters(
  filters: TableSdkMessageFilterRecord[],
  tableLogicalName: string,
): TableSdkMessageRecord[] {
  const byMessage = new Map<string, TableSdkMessageRecord>();

  for (const filter of filters) {
    const key = filter.sdkmessageid || filter.messageName;
    if (!key) {
      continue;
    }

    const current = byMessage.get(key);
    if (!current) {
      byMessage.set(key, {
        sdkmessageid: filter.sdkmessageid,
        name: filter.messageName,
        primaryobjecttypecode: filter.primaryobjecttypecode || tableLogicalName,
        filterIds: [filter.sdkmessagefilterid].filter(Boolean),
        customProcessingStepAllowed: filter.customProcessingStepAllowed,
      });
      continue;
    }

    current.customProcessingStepAllowed =
      current.customProcessingStepAllowed || filter.customProcessingStepAllowed;
    if (filter.sdkmessagefilterid && !current.filterIds.includes(filter.sdkmessagefilterid)) {
      current.filterIds.push(filter.sdkmessagefilterid);
    }
  }

  return [...byMessage.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeSdkMessageFilters(
  filters: Record<string, unknown>[],
  tableLogicalName: string,
): TableSdkMessageFilterRecord[] {
  return filters
    .filter((item) => String(item.primaryobjecttypecode || "") === tableLogicalName)
    .map((filter) => {
      const sdkMessage = getRecord(filter.sdkmessageid);
      return {
        ...filter,
        sdkmessagefilterid: String(filter.sdkmessagefilterid || ""),
        primaryobjecttypecode: String(filter.primaryobjecttypecode || tableLogicalName),
        sdkmessageid: String(sdkMessage?.sdkmessageid || ""),
        messageName: String(sdkMessage?.name || ""),
        customProcessingStepAllowed: getBooleanValue(filter.iscustomprocessingstepallowed),
      };
    })
    .filter((filter) => Boolean(filter.sdkmessageid || filter.messageName))
    .sort((left, right) => {
      const nameComparison = left.messageName.localeCompare(right.messageName);
      if (nameComparison !== 0) {
        return nameComparison;
      }
      return left.sdkmessagefilterid.localeCompare(right.sdkmessagefilterid);
    });
}

function uniqueMessages(messages: TableSdkMessageRecord[]): TableSdkMessageRecord[] {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const key = message.sdkmessageid || message.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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
