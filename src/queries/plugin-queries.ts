import {
  and,
  eq,
  guidEq,
  inList,
  normalizeGuid,
  odataStringLiteral,
  query,
  rawFilter,
} from "../utils/odata-builder.js";

const DEFAULT_PLUGIN_ASSEMBLY_SELECT = [
  "pluginassemblyid",
  "name",
  "version",
  "publickeytoken",
  "isolationmode",
  "ismanaged",
  "createdon",
  "modifiedon",
];

export function listPluginAssembliesQuery(): string {
  return query()
    .select(DEFAULT_PLUGIN_ASSEMBLY_SELECT)
    .filter(eq("ishidden/Value", false))
    .orderby("name asc")
    .toString();
}

export function getPluginAssemblyByNameQuery(
  assemblyName: string,
  select = DEFAULT_PLUGIN_ASSEMBLY_SELECT,
): string {
  return query().select(select).filter(eq("name", assemblyName)).toString();
}

export function listPluginAssembliesByIdsQuery(assemblyIds: string[]): string {
  return query()
    .select(DEFAULT_PLUGIN_ASSEMBLY_SELECT)
    .filter(inList("pluginassemblyid", assemblyIds))
    .orderby("name asc")
    .toString();
}

export function listPluginTypesQuery(assemblyId: string): string {
  return query()
    .select([
      "plugintypeid",
      "name",
      "typename",
      "friendlyname",
      "isworkflowactivity",
      "workflowactivitygroupname",
      "customworkflowactivityinfo",
    ])
    .filter(eq("pluginassemblyid/pluginassemblyid", assemblyId))
    .orderby("name asc")
    .toString();
}

export function listPluginTypesForAssembliesQuery(assemblyIds: string[]): string {
  return query()
    .select([
      "plugintypeid",
      "name",
      "typename",
      "friendlyname",
      "isworkflowactivity",
      "workflowactivitygroupname",
      "customworkflowactivityinfo",
      "_pluginassemblyid_value",
    ])
    .filter(inList("_pluginassemblyid_value", assemblyIds))
    .orderby("name asc")
    .toString();
}

export function listPluginTypesByIdsQuery(pluginTypeIds: string[]): string {
  return query()
    .select([
      "plugintypeid",
      "name",
      "typename",
      "friendlyname",
      "isworkflowactivity",
      "workflowactivitygroupname",
      "customworkflowactivityinfo",
      "_pluginassemblyid_value",
    ])
    .filter(inList("plugintypeid", pluginTypeIds))
    .orderby("name asc")
    .toString();
}

export function listPluginStepsQuery(pluginTypeId: string): string {
  return query()
    .select([
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
    ])
    .filter(eq("_eventhandler_value", pluginTypeId))
    .expand("sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)")
    .orderby("name asc")
    .toString();
}

export function listPluginStepsForPluginTypesQuery(pluginTypeIds: string[]): string {
  return query()
    .select([
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
    ])
    .filter(inList("_eventhandler_value", pluginTypeIds))
    .expand("sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)")
    .orderby("name asc")
    .toString();
}

export function listPluginStepsByIdsQuery(stepIds: string[]): string {
  return query()
    .select([
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
    ])
    .filter(inList("sdkmessageprocessingstepid", stepIds))
    .expand("sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)")
    .orderby("name asc")
    .toString();
}

export function listPluginImagesQuery(stepId: string): string {
  return query()
    .select([
      "sdkmessageprocessingstepimageid",
      "_sdkmessageprocessingstepid_value",
      "name",
      "entityalias",
      "imagetype",
      "attributes",
      "messagepropertyname",
    ])
    .filter(eq("_sdkmessageprocessingstepid_value", stepId))
    .toString();
}

export function listPluginImagesForStepsQuery(stepIds: string[]): string {
  return query()
    .select([
      "sdkmessageprocessingstepimageid",
      "_sdkmessageprocessingstepid_value",
      "name",
      "entityalias",
      "imagetype",
      "attributes",
      "messagepropertyname",
    ])
    .filter(inList("_sdkmessageprocessingstepid_value", stepIds))
    .toString();
}

export function listPluginImagesByIdsQuery(imageIds: string[]): string {
  return query()
    .select([
      "sdkmessageprocessingstepimageid",
      "_sdkmessageprocessingstepid_value",
      "name",
      "entityalias",
      "imagetype",
      "attributes",
      "messagepropertyname",
    ])
    .filter(inList("sdkmessageprocessingstepimageid", imageIds))
    .toString();
}

export function listSdkMessageProcessingStepsQuery(options: {
  message: string;
  primaryEntity?: string;
  stage?: number;
  mode?: number;
  statecode?: number;
}): string {
  const messageId = normalizeGuid(options.message);

  return query()
    .select([
      "sdkmessageprocessingstepid",
      "_eventhandler_value",
      "_sdkmessageid_value",
      "_sdkmessagefilterid_value",
      "_impersonatinguserid_value",
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
    ])
    .filter(
      and(
        messageId
          ? guidEq("_sdkmessageid_value", messageId)
          : rawFilter(
              `tolower(sdkmessageid/name) eq ${odataStringLiteral(options.message.toLowerCase())}`,
            ),
        options.primaryEntity
          ? eq("sdkmessagefilterid/primaryobjecttypecode", options.primaryEntity)
          : undefined,
        options.stage !== undefined ? eq("stage", options.stage) : undefined,
        options.mode !== undefined ? eq("mode", options.mode) : undefined,
        options.statecode !== undefined ? eq("statecode", options.statecode) : undefined,
      ),
    )
    .expand(
      "sdkmessageid($select=sdkmessageid,name),sdkmessagefilterid($select=sdkmessagefilterid,primaryobjecttypecode),eventhandler_plugintype($select=plugintypeid,name,typename,isworkflowactivity,workflowactivitygroupname,customworkflowactivityinfo,_pluginassemblyid_value;$expand=pluginassemblyid($select=pluginassemblyid,name)),impersonatinguserid($select=systemuserid,fullname,domainname)",
    )
    .orderby("stage asc,rank asc,name asc")
    .toString();
}

export function listStepsForAssemblyQuery(assemblyName: string): string {
  return query()
    .select([
      "sdkmessageprocessingstepid",
      "name",
      "stage",
      "mode",
      "rank",
      "statecode",
      "filteringattributes",
    ])
    .filter(eq("eventhandler_plugintype/pluginassemblyid/name", assemblyName))
    .expand(
      "sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode),eventhandler_plugintype($select=name,typename)",
    )
    .orderby("name asc")
    .toString();
}

export function listPluginTraceLogsQuery(options?: {
  pluginTypeName?: string;
  correlationId?: string;
  createdAfter?: string;
  createdBefore?: string;
  hasException?: boolean;
  top?: number;
}): string {
  const filter = and(
    options?.pluginTypeName ? eq("typename", options.pluginTypeName) : undefined,
    options?.correlationId ? eq("correlationid", options.correlationId) : undefined,
    options?.createdAfter ? rawFilter(`createdon ge ${options.createdAfter}`) : undefined,
    options?.createdBefore ? rawFilter(`createdon le ${options.createdBefore}`) : undefined,
    options?.hasException
      ? rawFilter("(exceptiondetails ne null and exceptiondetails ne '')")
      : undefined,
  );

  return query()
    .select([
      "plugintracelogid",
      "typename",
      "correlationid",
      "createdon",
      "messagename",
      "primaryentity",
      "mode",
      "depth",
      "performanceexecutionduration",
      "exceptiondetails",
      "messageblock",
    ])
    .filter(filter)
    .orderby("createdon desc")
    .top(options?.top ?? 50)
    .count(true)
    .toString();
}

export function getPluginTraceLogByIdQuery(): string {
  return query()
    .select([
      "plugintracelogid",
      "typename",
      "correlationid",
      "createdon",
      "messagename",
      "primaryentity",
      "mode",
      "depth",
      "performanceexecutionduration",
      "performanceconstructorduration",
      "exceptiondetails",
      "messageblock",
      "configuration",
      "secureconfiguration",
      "profile",
      "requestid",
      "operationtype",
      "pluginstepid",
      "issystemcreated",
      "persistencekey",
    ])
    .toString();
}
