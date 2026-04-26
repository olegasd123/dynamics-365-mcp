import { and, contains, eq, inList, or, query } from "../utils/odata-builder.js";

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
  "appmoduleidunique",
  "name",
  "uniquename",
  "ismanaged",
  "modifiedon",
  "statecode",
];

const SITEMAP_SELECT = [
  "sitemapid",
  "sitemapidunique",
  "sitemapname",
  "sitemapnameunique",
  "sitemapxml",
  "sitemapxmlmanaged",
  "isappaware",
  "ismanaged",
  "modifiedon",
  "componentstate",
  "showhome",
  "showpinned",
  "showrecents",
  "enablecollapsiblegroups",
];

const APP_MODULE_COMPONENT_SELECT = [
  "appmodulecomponentid",
  "componenttype",
  "objectid",
  "isdefault",
  "ismetadata",
  "rootcomponentbehavior",
  "_appmoduleidunique_value",
];

export function listEnvironmentVariableDefinitionsQuery(nameFilter?: string): string {
  return query()
    .select(ENVIRONMENT_VARIABLE_DEFINITION_SELECT)
    .filter(
      nameFilter
        ? or(contains("schemaname", nameFilter), contains("displayname", nameFilter))
        : undefined,
    )
    .orderby("schemaname asc")
    .toString();
}

export function listEnvironmentVariableDefinitionsByIdsQuery(ids: string[]): string {
  return query()
    .select(ENVIRONMENT_VARIABLE_DEFINITION_SELECT)
    .filter(inList("environmentvariabledefinitionid", ids))
    .orderby("schemaname asc")
    .toString();
}

export function listEnvironmentVariableValuesQuery(): string {
  return query().select(ENVIRONMENT_VARIABLE_VALUE_SELECT).orderby("modifiedon desc").toString();
}

export function listEnvironmentVariableValuesForDefinitionsQuery(definitionIds: string[]): string {
  return query()
    .select(ENVIRONMENT_VARIABLE_VALUE_SELECT)
    .filter(inList("_environmentvariabledefinitionid_value", definitionIds))
    .orderby("modifiedon desc")
    .toString();
}

export function listEnvironmentVariableValuesByIdsQuery(ids: string[]): string {
  return query()
    .select(ENVIRONMENT_VARIABLE_VALUE_SELECT)
    .filter(inList("environmentvariablevalueid", ids))
    .orderby("modifiedon desc")
    .toString();
}

export function listConnectionReferencesQuery(nameFilter?: string): string {
  return query()
    .select(CONNECTION_REFERENCE_SELECT)
    .filter(
      nameFilter
        ? or(
            contains("connectionreferencedisplayname", nameFilter),
            contains("connectionreferencelogicalname", nameFilter),
          )
        : undefined,
    )
    .orderby("connectionreferencedisplayname asc")
    .toString();
}

export function listConnectionReferencesByIdsQuery(ids: string[]): string {
  return query()
    .select(CONNECTION_REFERENCE_SELECT)
    .filter(inList("connectionreferenceid", ids))
    .orderby("connectionreferencedisplayname asc")
    .toString();
}

export function listAppModulesQuery(nameFilter?: string): string {
  return query()
    .select(APP_MODULE_SELECT)
    .filter(
      nameFilter ? or(contains("name", nameFilter), contains("uniquename", nameFilter)) : undefined,
    )
    .orderby("name asc")
    .toString();
}

export function listAppModulesByIdsQuery(ids: string[]): string {
  return query()
    .select(APP_MODULE_SELECT)
    .filter(inList("appmoduleid", ids))
    .orderby("name asc")
    .toString();
}

export function listSitemapsQuery(nameFilter?: string): string {
  return query()
    .select(SITEMAP_SELECT)
    .filter(
      nameFilter
        ? or(contains("sitemapname", nameFilter), contains("sitemapnameunique", nameFilter))
        : undefined,
    )
    .orderby("sitemapname asc")
    .toString();
}

export function listSitemapsByIdsQuery(ids: string[]): string {
  return query()
    .select(SITEMAP_SELECT)
    .filter(inList("sitemapid", ids))
    .orderby("sitemapname asc")
    .toString();
}

export function listAppModuleSitemapComponentsQuery(appModuleIdUnique: string): string {
  return query()
    .select(APP_MODULE_COMPONENT_SELECT)
    .filter(and(eq("_appmoduleidunique_value", appModuleIdUnique), eq("componenttype", 62)))
    .orderby("appmodulecomponentid asc")
    .toString();
}
