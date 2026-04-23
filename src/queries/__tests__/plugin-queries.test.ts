import { describe, expect, it } from "vitest";
import {
  getPluginTraceLogByIdQuery,
  getPluginAssemblyByNameQuery,
  listPluginAssembliesQuery,
  listPluginImagesForStepsQuery,
  listPluginImagesQuery,
  listPluginTraceLogsQuery,
  listPluginStepsForPluginTypesQuery,
  listPluginStepsQuery,
  listPluginTypesForAssembliesQuery,
  listPluginTypesQuery,
  listSdkMessageProcessingStepsQuery,
  listStepsForAssemblyQuery,
} from "../plugin-queries.js";

describe("plugin queries", () => {
  it("builds the plugin assemblies query", () => {
    const query = listPluginAssembliesQuery();

    expect(query).toContain(
      "$select=pluginassemblyid,name,version,publickeytoken,isolationmode,ismanaged,createdon,modifiedon",
    );
    expect(query).toContain("$filter=ishidden/Value eq false");
    expect(query).toContain("$orderby=name asc");
  });

  it("builds the plugin assembly by name query", () => {
    const query = getPluginAssemblyByNameQuery("O'Hara.Plugin", ["pluginassemblyid", "name"]);

    expect(query).toContain("$select=pluginassemblyid,name");
    expect(query).toContain("$filter=name eq 'O''Hara.Plugin'");
  });

  it("builds the plugin types query", () => {
    const query = listPluginTypesQuery("assembly-1");

    expect(query).toContain("$filter=pluginassemblyid/pluginassemblyid eq 'assembly-1'");
    expect(query).toContain("workflowactivitygroupname");
    expect(query).toContain("customworkflowactivityinfo");
  });

  it("builds the bulk plugin types query", () => {
    const query = listPluginTypesForAssembliesQuery(["assembly-1", "assembly-2"]);

    expect(query).toContain(
      "$filter=_pluginassemblyid_value eq 'assembly-1' or _pluginassemblyid_value eq 'assembly-2'",
    );
    expect(query).toContain("_pluginassemblyid_value");
    expect(query).toContain("workflowactivitygroupname");
    expect(query).toContain("customworkflowactivityinfo");
  });

  it("builds the plugin steps query", () => {
    const query = listPluginStepsQuery("type-1");

    expect(query).toContain("$filter=_eventhandler_value eq 'type-1'");
    expect(query).toContain(
      "$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)",
    );
  });

  it("builds the bulk plugin steps query", () => {
    const query = listPluginStepsForPluginTypesQuery(["type-1", "type-2"]);

    expect(query).toContain(
      "$filter=_eventhandler_value eq 'type-1' or _eventhandler_value eq 'type-2'",
    );
    expect(query).toContain("_eventhandler_value");
  });

  it("builds the plugin images query", () => {
    expect(listPluginImagesQuery("step-1")).toContain(
      "$filter=_sdkmessageprocessingstepid_value eq 'step-1'",
    );
  });

  it("builds the bulk plugin images query", () => {
    const query = listPluginImagesForStepsQuery(["step-1", "step-2"]);

    expect(query).toContain(
      "$filter=_sdkmessageprocessingstepid_value eq 'step-1' or _sdkmessageprocessingstepid_value eq 'step-2'",
    );
    expect(query).toContain("_sdkmessageprocessingstepid_value");
  });

  it("builds the steps for assembly query", () => {
    const query = listStepsForAssemblyQuery("My.Assembly");

    expect(query).toContain(
      "$filter=eventhandler_plugintype/pluginassemblyid/name eq 'My.Assembly'",
    );
    expect(query).toContain("eventhandler_plugintype($select=name,typename)");
  });

  it("builds the org-wide SDK message processing steps query", () => {
    const query = listSdkMessageProcessingStepsQuery({
      message: "Update",
      primaryEntity: "account",
      stage: 20,
      mode: 0,
      statecode: 0,
    });

    expect(query).toContain("tolower(sdkmessageid/name) eq 'update'");
    expect(query).not.toContain("_sdkmessageid_value eq");
    expect(query).toContain("sdkmessagefilterid/primaryobjecttypecode eq 'account'");
    expect(query).toContain("stage eq 20");
    expect(query).toContain("mode eq 0");
    expect(query).toContain("statecode eq 0");
    expect(query).toContain("eventhandler_plugintype");
    expect(query).toContain("pluginassemblyid($select=pluginassemblyid,name)");
    expect(query).toContain("impersonatinguserid($select=systemuserid,fullname,domainname)");
    expect(query).toContain("$orderby=stage asc,rank asc,name asc");
  });

  it("builds the org-wide SDK message processing steps query by message id", () => {
    const query = listSdkMessageProcessingStepsQuery({
      message: "11111111-1111-1111-1111-111111111111",
      primaryEntity: "account",
    });

    expect(query).toContain("_sdkmessageid_value eq 11111111-1111-1111-1111-111111111111");
    expect(query).not.toContain("tolower(sdkmessageid/name)");
  });

  it("builds the plugin trace logs query", () => {
    const query = listPluginTraceLogsQuery({
      pluginTypeName: "Contoso.Plugins.AccountPlugin",
      correlationId: "00000000-0000-0000-0000-000000000001",
      createdAfter: "2026-04-20T08:00:00.000Z",
      createdBefore: "2026-04-20T09:00:00.000Z",
      hasException: true,
      top: 25,
    });

    expect(query).toContain(
      "$select=plugintracelogid,typename,correlationid,createdon,messagename,primaryentity,mode,depth,performanceexecutionduration,exceptiondetails,messageblock",
    );
    expect(query).toContain("typename eq 'Contoso.Plugins.AccountPlugin'");
    expect(query).toContain("correlationid eq '00000000-0000-0000-0000-000000000001'");
    expect(query).toContain("createdon ge 2026-04-20T08:00:00.000Z");
    expect(query).toContain("createdon le 2026-04-20T09:00:00.000Z");
    expect(query).toContain("(exceptiondetails ne null and exceptiondetails ne '')");
    expect(query).toContain("$orderby=createdon desc");
    expect(query).toContain("$top=25");
    expect(query).toContain("$count=true");
  });

  it("builds the plugin trace log by id query", () => {
    const query = getPluginTraceLogByIdQuery();

    expect(query).toContain(
      "$select=plugintracelogid,typename,correlationid,createdon,messagename,primaryentity,mode,depth,performanceexecutionduration,performanceconstructorduration,exceptiondetails,messageblock,configuration,secureconfiguration,profile,requestid,operationtype,pluginstepid,issystemcreated,persistencekey",
    );
  });
});
