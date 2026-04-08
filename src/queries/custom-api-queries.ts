import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";

function buildOrFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

const CUSTOM_API_SELECT = [
  "customapiid",
  "name",
  "uniquename",
  "displayname",
  "description",
  "bindingtype",
  "boundentitylogicalname",
  "isfunction",
  "isprivate",
  "allowedcustomprocessingsteptype",
  "executeprivilegename",
  "workflowsdkstepenabled",
  "ismanaged",
  "statecode",
  "statuscode",
  "createdon",
  "modifiedon",
  "_plugintypeid_value",
  "_sdkmessageid_value",
  "_powerfxruleid_value",
];

const CUSTOM_API_PARAMETER_SELECT = [
  "customapirequestparameterid",
  "name",
  "uniquename",
  "displayname",
  "description",
  "type",
  "isoptional",
  "logicalentityname",
  "ismanaged",
  "statecode",
  "statuscode",
  "createdon",
  "modifiedon",
  "_customapiid_value",
];

const CUSTOM_API_RESPONSE_SELECT = [
  "customapiresponsepropertyid",
  "name",
  "uniquename",
  "displayname",
  "description",
  "type",
  "logicalentityname",
  "ismanaged",
  "statecode",
  "statuscode",
  "createdon",
  "modifiedon",
  "_customapiid_value",
];

export function listCustomApisQuery(nameFilter?: string): string {
  const filter = nameFilter
    ? `(${odataContains("name", nameFilter)} or ${odataContains("uniquename", nameFilter)})`
    : undefined;

  return buildQueryString({
    select: CUSTOM_API_SELECT,
    filter,
    orderby: "name asc",
  });
}

export function getCustomApiByIdentityQuery(options: {
  apiName?: string;
  uniqueName?: string;
}): string {
  const filter = options.uniqueName
    ? odataEq("uniquename", options.uniqueName)
    : odataEq("name", options.apiName as string);

  return buildQueryString({
    select: CUSTOM_API_SELECT,
    filter,
  });
}

export function listCustomApiRequestParametersQuery(customApiId: string): string {
  return buildQueryString({
    select: CUSTOM_API_PARAMETER_SELECT,
    filter: odataEq("_customapiid_value", customApiId),
    orderby: "name asc",
  });
}

export function listCustomApiRequestParametersForApisQuery(customApiIds: string[]): string {
  return buildQueryString({
    select: CUSTOM_API_PARAMETER_SELECT,
    filter: buildOrFilter("_customapiid_value", customApiIds),
    orderby: "name asc",
  });
}

export function listCustomApiResponsePropertiesQuery(customApiId: string): string {
  return buildQueryString({
    select: CUSTOM_API_RESPONSE_SELECT,
    filter: odataEq("_customapiid_value", customApiId),
    orderby: "name asc",
  });
}

export function listCustomApiResponsePropertiesForApisQuery(customApiIds: string[]): string {
  return buildQueryString({
    select: CUSTOM_API_RESPONSE_SELECT,
    filter: buildOrFilter("_customapiid_value", customApiIds),
    orderby: "name asc",
  });
}
