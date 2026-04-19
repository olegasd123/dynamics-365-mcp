import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listCustomApiRequestParametersForApisQuery,
  listCustomApiRequestParametersQuery,
  listCustomApiResponsePropertiesForApisQuery,
  listCustomApiResponsePropertiesQuery,
  listCustomApisQuery,
} from "../../queries/custom-api-queries.js";
import { queryRecordsByFieldValuesInChunks } from "../../utils/query-batching.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

const BINDING_TYPE_LABELS: Record<number, string> = {
  0: "Global",
  1: "Entity",
  2: "Entity Collection",
};

const PROCESSING_STEP_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Async Only",
  2: "Sync And Async",
};

const PARAMETER_TYPE_LABELS: Record<number, string> = {
  0: "Boolean",
  1: "DateTime",
  2: "Decimal",
  3: "Entity",
  4: "EntityCollection",
  5: "EntityReference",
  6: "Float",
  7: "Integer",
  8: "Money",
  9: "Picklist",
  10: "String",
  11: "StringArray",
  12: "Guid",
};

const STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

export interface CustomApiRecord extends Record<string, unknown> {
  customapiid: string;
  name: string;
  uniquename: string;
  displayname: string;
  description: string;
  bindingtype: number;
  bindingTypeLabel: string;
  boundentitylogicalname: string;
  isfunction: boolean;
  isprivate: boolean;
  allowedcustomprocessingsteptype: number;
  allowedProcessingStepLabel: string;
  executeprivilegename: string;
  workflowsdkstepenabled: boolean;
  ismanaged: boolean;
  statecode: number;
  stateLabel: string;
  statuscode: number;
  createdon: string;
  modifiedon: string;
  plugintypeid: string;
  sdkmessageid: string;
  powerfxruleid: string;
}

export interface CustomApiParameterRecord extends Record<string, unknown> {
  id: string;
  name: string;
  uniquename: string;
  displayname: string;
  description: string;
  type: number;
  typeLabel: string;
  isoptional: boolean;
  logicalentityname: string;
  ismanaged: boolean;
  statecode: number;
  stateLabel: string;
  statuscode: number;
  createdon: string;
  modifiedon: string;
  customapiid: string;
  kind: "request" | "response";
}

export interface CustomApiDetails {
  api: CustomApiRecord;
  requestParameters: CustomApiParameterRecord[];
  responseProperties: CustomApiParameterRecord[];
}

export interface CustomApiInventory {
  apis: CustomApiRecord[];
  requestParameters: CustomApiParameterRecord[];
  responseProperties: CustomApiParameterRecord[];
}

export async function listCustomApis(
  env: EnvironmentConfig,
  client: DynamicsClient,
  nameFilter?: string,
): Promise<CustomApiRecord[]> {
  const records = await client.query<Record<string, unknown>>(
    env,
    "customapis",
    listCustomApisQuery(nameFilter),
  );

  return records.map(normalizeCustomApi);
}

export async function resolveCustomApi(
  env: EnvironmentConfig,
  client: DynamicsClient,
  apiRef: string,
): Promise<CustomApiRecord> {
  const apis = await listCustomApis(env, client);
  const exactId = apis.filter((api) => api.customapiid === apiRef);
  if (exactId.length === 1) {
    return exactId[0];
  }

  const exactUnique = apis.filter((api) => api.uniquename === apiRef);
  if (exactUnique.length === 1) {
    return exactUnique[0];
  }

  const exactName = apis.filter((api) => api.name === apiRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const needle = apiRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueApis(
    apis.filter(
      (api) => api.uniquename.toLowerCase() === needle || api.name.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueApis(
    apis.filter(
      (api) =>
        api.uniquename.toLowerCase().includes(needle) || api.name.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueApis([
    ...exactUnique,
    ...exactName,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);

  if (matches.length > 1) {
    throw createAmbiguousCustomApiError(apiRef, env.name, matches);
  }

  throw new Error(`Custom API '${apiRef}' not found in '${env.name}'.`);
}

export async function fetchCustomApiDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  apiRef: string,
): Promise<CustomApiDetails> {
  const api = await resolveCustomApi(env, client, apiRef);
  const [requestParameters, responseProperties] = await Promise.all([
    client.query<Record<string, unknown>>(
      env,
      "customapirequestparameters",
      listCustomApiRequestParametersQuery(api.customapiid),
    ),
    client.query<Record<string, unknown>>(
      env,
      "customapiresponseproperties",
      listCustomApiResponsePropertiesQuery(api.customapiid),
    ),
  ]);

  return {
    api,
    requestParameters: requestParameters.map((record) => normalizeParameter(record, "request")),
    responseProperties: responseProperties.map((record) => normalizeParameter(record, "response")),
  };
}

export async function fetchCustomApiInventory(
  env: EnvironmentConfig,
  client: DynamicsClient,
  apis: CustomApiRecord[],
): Promise<CustomApiInventory> {
  if (apis.length === 0) {
    return {
      apis,
      requestParameters: [],
      responseProperties: [],
    };
  }

  const apiIds = apis.map((api) => api.customapiid).filter(Boolean);
  const [requestParameters, responseProperties] = await Promise.all([
    queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
      env,
      client,
      "customapirequestparameters",
      apiIds,
      "_customapiid_value",
      listCustomApiRequestParametersForApisQuery,
    ),
    queryRecordsByFieldValuesInChunks<Record<string, unknown>>(
      env,
      client,
      "customapiresponseproperties",
      apiIds,
      "_customapiid_value",
      listCustomApiResponsePropertiesForApisQuery,
    ),
  ]);

  return {
    apis,
    requestParameters: requestParameters.map((record) => normalizeParameter(record, "request")),
    responseProperties: responseProperties.map((record) => normalizeParameter(record, "response")),
  };
}

function normalizeCustomApi(record: Record<string, unknown>): CustomApiRecord {
  const bindingType = Number(record.bindingtype || 0);
  const stepType = Number(record.allowedcustomprocessingsteptype || 0);
  const statecode = Number(record.statecode || 0);

  return {
    ...record,
    customapiid: String(record.customapiid || ""),
    name: String(record.name || ""),
    uniquename: String(record.uniquename || ""),
    displayname: String(record.displayname || ""),
    description: String(record.description || ""),
    bindingtype: bindingType,
    bindingTypeLabel: BINDING_TYPE_LABELS[bindingType] || String(bindingType),
    boundentitylogicalname: String(record.boundentitylogicalname || ""),
    isfunction: Boolean(record.isfunction),
    isprivate: Boolean(record.isprivate),
    allowedcustomprocessingsteptype: stepType,
    allowedProcessingStepLabel: PROCESSING_STEP_TYPE_LABELS[stepType] || String(stepType),
    executeprivilegename: String(record.executeprivilegename || ""),
    workflowsdkstepenabled: Boolean(record.workflowsdkstepenabled),
    ismanaged: Boolean(record.ismanaged),
    statecode,
    stateLabel: STATE_LABELS[statecode] || String(statecode),
    statuscode: Number(record.statuscode || 0),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
    plugintypeid: String(record._plugintypeid_value || ""),
    sdkmessageid: String(record._sdkmessageid_value || ""),
    powerfxruleid: String(record._powerfxruleid_value || ""),
  };
}

function createAmbiguousCustomApiError(
  apiRef: string,
  environmentName: string,
  matches: CustomApiRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Custom API '${apiRef}' is ambiguous in '${environmentName}'. Choose a custom API and try again. Matches: ${matches.map((api) => `${api.name} (${api.uniquename})`).join(", ")}.`,
    {
      parameter: "apiName",
      options: matches.map((api) => createCustomApiOption(api)),
    },
  );
}

function createCustomApiOption(api: CustomApiRecord): AmbiguousMatchOption {
  const value = api.uniquename || api.customapiid;
  const uniqueNameSuffix = api.uniquename ? ` (${api.uniquename})` : "";

  return {
    value,
    label: `${api.name}${uniqueNameSuffix}`,
  };
}

function normalizeParameter(
  record: Record<string, unknown>,
  kind: "request" | "response",
): CustomApiParameterRecord {
  const idField =
    kind === "request" ? "customapirequestparameterid" : "customapiresponsepropertyid";
  const type = Number(record.type || 0);
  const statecode = Number(record.statecode || 0);

  return {
    ...record,
    id: String(record[idField] || ""),
    name: String(record.name || ""),
    uniquename: String(record.uniquename || ""),
    displayname: String(record.displayname || ""),
    description: String(record.description || ""),
    type,
    typeLabel: PARAMETER_TYPE_LABELS[type] || String(type),
    isoptional: kind === "request" ? Boolean(record.isoptional) : false,
    logicalentityname: String(record.logicalentityname || ""),
    ismanaged: Boolean(record.ismanaged),
    statecode,
    stateLabel: STATE_LABELS[statecode] || String(statecode),
    statuscode: Number(record.statuscode || 0),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
    customapiid: String(record._customapiid_value || ""),
    kind,
  };
}

function uniqueApis(apis: CustomApiRecord[]): CustomApiRecord[] {
  const seen = new Set<string>();

  return apis.filter((api) => {
    if (seen.has(api.customapiid)) {
      return false;
    }
    seen.add(api.customapiid);
    return true;
  });
}
