import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";

function buildOrFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

const ENVIRONMENT_VARIABLE_DEFINITION_SELECT = [
  "environmentvariabledefinitionid",
  "schemaname",
  "displayname",
  "type",
  "defaultvalue",
  "valueschema",
  "ismanaged",
  "modifiedon",
];

const ENVIRONMENT_VARIABLE_VALUE_SELECT = [
  "environmentvariablevalueid",
  "_environmentvariabledefinitionid_value",
  "value",
  "ismanaged",
  "modifiedon",
];

const CONNECTION_REFERENCE_SELECT = [
  "connectionreferenceid",
  "connectionreferencelogicalname",
  "connectionreferencedisplayname",
  "connectorid",
  "connectionid",
  "ismanaged",
  "modifiedon",
  "statecode",
];

const APP_MODULE_SELECT = [
  "appmoduleid",
  "name",
  "uniquename",
  "ismanaged",
  "modifiedon",
  "statecode",
];

export function listEnvironmentVariableDefinitionsQuery(nameFilter?: string): string {
  const filter = nameFilter
    ? `(${odataContains("schemaname", nameFilter)} or ${odataContains("displayname", nameFilter)})`
    : undefined;

  return buildQueryString({
    select: ENVIRONMENT_VARIABLE_DEFINITION_SELECT,
    filter,
    orderby: "schemaname asc",
  });
}

export function listEnvironmentVariableDefinitionsByIdsQuery(ids: string[]): string {
  return buildQueryString({
    select: ENVIRONMENT_VARIABLE_DEFINITION_SELECT,
    filter: buildOrFilter("environmentvariabledefinitionid", ids),
    orderby: "schemaname asc",
  });
}

export function listEnvironmentVariableValuesQuery(): string {
  return buildQueryString({
    select: ENVIRONMENT_VARIABLE_VALUE_SELECT,
    orderby: "modifiedon desc",
  });
}

export function listEnvironmentVariableValuesForDefinitionsQuery(definitionIds: string[]): string {
  return buildQueryString({
    select: ENVIRONMENT_VARIABLE_VALUE_SELECT,
    filter: buildOrFilter("_environmentvariabledefinitionid_value", definitionIds),
    orderby: "modifiedon desc",
  });
}

export function listEnvironmentVariableValuesByIdsQuery(ids: string[]): string {
  return buildQueryString({
    select: ENVIRONMENT_VARIABLE_VALUE_SELECT,
    filter: buildOrFilter("environmentvariablevalueid", ids),
    orderby: "modifiedon desc",
  });
}

export function listConnectionReferencesQuery(nameFilter?: string): string {
  const filter = nameFilter
    ? `(${odataContains("connectionreferencedisplayname", nameFilter)} or ${odataContains("connectionreferencelogicalname", nameFilter)})`
    : undefined;

  return buildQueryString({
    select: CONNECTION_REFERENCE_SELECT,
    filter,
    orderby: "connectionreferencedisplayname asc",
  });
}

export function listConnectionReferencesByIdsQuery(ids: string[]): string {
  return buildQueryString({
    select: CONNECTION_REFERENCE_SELECT,
    filter: buildOrFilter("connectionreferenceid", ids),
    orderby: "connectionreferencedisplayname asc",
  });
}

export function listAppModulesQuery(nameFilter?: string): string {
  const filter = nameFilter
    ? `(${odataContains("name", nameFilter)} or ${odataContains("uniquename", nameFilter)})`
    : undefined;

  return buildQueryString({
    select: APP_MODULE_SELECT,
    filter,
    orderby: "name asc",
  });
}

export function listAppModulesByIdsQuery(ids: string[]): string {
  return buildQueryString({
    select: APP_MODULE_SELECT,
    filter: buildOrFilter("appmoduleid", ids),
    orderby: "name asc",
  });
}
