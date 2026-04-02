import { buildQueryString, odataEq } from "../utils/odata-helpers.js";

function buildOrFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

export function listPluginAssembliesQuery(): string {
  return buildQueryString({
    select: [
      "pluginassemblyid",
      "name",
      "version",
      "publickeytoken",
      "isolationmode",
      "ismanaged",
      "createdon",
      "modifiedon",
    ],
    filter: "ishidden/Value eq false",
    orderby: "name asc",
  });
}

export function listPluginTypesQuery(assemblyId: string): string {
  return buildQueryString({
    select: ["plugintypeid", "name", "typename", "friendlyname", "isworkflowactivity"],
    filter: odataEq("pluginassemblyid/pluginassemblyid", assemblyId),
    orderby: "name asc",
  });
}

export function listPluginTypesForAssembliesQuery(assemblyIds: string[]): string {
  return buildQueryString({
    select: [
      "plugintypeid",
      "name",
      "typename",
      "friendlyname",
      "isworkflowactivity",
      "_pluginassemblyid_value",
    ],
    filter: buildOrFilter("_pluginassemblyid_value", assemblyIds),
    orderby: "name asc",
  });
}

export function listPluginStepsQuery(pluginTypeId: string): string {
  return buildQueryString({
    select: [
      "sdkmessageprocessingstepid",
      "_eventhandler_value",
      "name",
      "stage",
      "mode",
      "rank",
      "statecode",
      "statuscode",
      "filteringattributes",
      "description",
      "configuration",
      "asyncautodelete",
      "supporteddeployment",
    ],
    filter: odataEq("_eventhandler_value", pluginTypeId),
    expand: "sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)",
    orderby: "name asc",
  });
}

export function listPluginStepsForPluginTypesQuery(pluginTypeIds: string[]): string {
  return buildQueryString({
    select: [
      "sdkmessageprocessingstepid",
      "_eventhandler_value",
      "name",
      "stage",
      "mode",
      "rank",
      "statecode",
      "statuscode",
      "filteringattributes",
      "description",
      "configuration",
      "asyncautodelete",
      "supporteddeployment",
    ],
    filter: buildOrFilter("_eventhandler_value", pluginTypeIds),
    expand: "sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)",
    orderby: "name asc",
  });
}

export function listPluginImagesQuery(stepId: string): string {
  return buildQueryString({
    select: [
      "sdkmessageprocessingstepimageid",
      "_sdkmessageprocessingstepid_value",
      "name",
      "entityalias",
      "imagetype",
      "attributes",
      "messagepropertyname",
    ],
    filter: odataEq("_sdkmessageprocessingstepid_value", stepId),
  });
}

export function listPluginImagesForStepsQuery(stepIds: string[]): string {
  return buildQueryString({
    select: [
      "sdkmessageprocessingstepimageid",
      "_sdkmessageprocessingstepid_value",
      "name",
      "entityalias",
      "imagetype",
      "attributes",
      "messagepropertyname",
    ],
    filter: buildOrFilter("_sdkmessageprocessingstepid_value", stepIds),
  });
}

export function listStepsForAssemblyQuery(assemblyName: string): string {
  return buildQueryString({
    select: [
      "sdkmessageprocessingstepid",
      "name",
      "stage",
      "mode",
      "rank",
      "statecode",
      "filteringattributes",
    ],
    filter: odataEq("eventhandler_plugintype/pluginassemblyid/name", assemblyName),
    expand:
      "sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode),eventhandler_plugintype($select=name,typename)",
    orderby: "name asc",
  });
}
