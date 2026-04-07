import { describe, expect, it } from "vitest";
import {
  getPluginAssemblyByNameQuery,
  listPluginAssembliesQuery,
  listPluginImagesForStepsQuery,
  listPluginImagesQuery,
  listPluginStepsForPluginTypesQuery,
  listPluginStepsQuery,
  listPluginTypesForAssembliesQuery,
  listPluginTypesQuery,
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

    expect(query).toContain(
      "$filter=pluginassemblyid/pluginassemblyid eq 'assembly-1'",
    );
    expect(query).toContain("workflowactivitygroupname");
    expect(query).toContain("customworkflowactivityinfo");
  });

  it("builds the bulk plugin types query", () => {
    const query = listPluginTypesForAssembliesQuery(["assembly-1", "assembly-2"]);

    expect(query).toContain("$filter=_pluginassemblyid_value eq 'assembly-1' or _pluginassemblyid_value eq 'assembly-2'");
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

    expect(query).toContain("$filter=_eventhandler_value eq 'type-1' or _eventhandler_value eq 'type-2'");
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
});
