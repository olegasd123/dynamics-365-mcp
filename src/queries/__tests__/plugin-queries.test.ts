import { describe, expect, it } from "vitest";
import {
  listPluginAssembliesQuery,
  listPluginImagesQuery,
  listPluginStepsQuery,
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

  it("builds the plugin types query", () => {
    expect(listPluginTypesQuery("assembly-1")).toContain(
      "$filter=pluginassemblyid/pluginassemblyid eq 'assembly-1'",
    );
  });

  it("builds the plugin steps query", () => {
    const query = listPluginStepsQuery("type-1");

    expect(query).toContain("$filter=_eventhandler_value eq 'type-1'");
    expect(query).toContain(
      "$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)",
    );
  });

  it("builds the plugin images query", () => {
    expect(listPluginImagesQuery("step-1")).toContain(
      "$filter=_sdkmessageprocessingstepid_value eq 'step-1'",
    );
  });

  it("builds the steps for assembly query", () => {
    const query = listStepsForAssemblyQuery("My.Assembly");

    expect(query).toContain(
      "$filter=eventhandler_plugintype/pluginassemblyid/name eq 'My.Assembly'",
    );
    expect(query).toContain("eventhandler_plugintype($select=name,typename)");
  });
});
