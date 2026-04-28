import { contains, eq, guidEq, guidInList, or, query } from "../utils/odata-builder.js";

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
  return query()
    .select(CUSTOM_API_SELECT)
    .filter(
      nameFilter ? or(contains("name", nameFilter), contains("uniquename", nameFilter)) : undefined,
    )
    .orderby("name asc")
    .toString();
}

export function getCustomApiByIdentityQuery(options: {
  apiName?: string;
  uniqueName?: string;
}): string {
  return query()
    .select(CUSTOM_API_SELECT)
    .filter(
      options.uniqueName
        ? eq("uniquename", options.uniqueName)
        : eq("name", options.apiName as string),
    )
    .toString();
}

export function listCustomApiRequestParametersQuery(customApiId: string): string {
  return query()
    .select(CUSTOM_API_PARAMETER_SELECT)
    .filter(guidEq("_customapiid_value", customApiId))
    .orderby("name asc")
    .toString();
}

export function listCustomApiRequestParametersForApisQuery(customApiIds: string[]): string {
  return query()
    .select(CUSTOM_API_PARAMETER_SELECT)
    .filter(guidInList("_customapiid_value", customApiIds))
    .orderby("name asc")
    .toString();
}

export function listCustomApiResponsePropertiesQuery(customApiId: string): string {
  return query()
    .select(CUSTOM_API_RESPONSE_SELECT)
    .filter(guidEq("_customapiid_value", customApiId))
    .orderby("name asc")
    .toString();
}

export function listCustomApiResponsePropertiesForApisQuery(customApiIds: string[]): string {
  return query()
    .select(CUSTOM_API_RESPONSE_SELECT)
    .filter(guidInList("_customapiid_value", customApiIds))
    .orderby("name asc")
    .toString();
}
