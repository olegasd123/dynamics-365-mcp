import { describe, expect, it } from "vitest";
import { registerGetSolutionLayers } from "../get-solution-layers.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_solution_layers tool", () => {
  it("shows the ordered layer stack for one supported component", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-wr", objectid: "wr-1", componenttype: 61 }],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/account.js",
            webresourcetype: 3,
            ismanaged: false,
          },
        ],
        msdyn_componentlayers: [
          {
            msdyn_componentlayerid: "layer-1",
            msdyn_name: "Active layer",
            msdyn_componentid: "wr-1",
            msdyn_solutioncomponentname: "WebResource",
            msdyn_solutionname: "Active",
            msdyn_publishername: "Default Publisher",
            msdyn_order: 200,
            msdyn_overwritetime: "2026-04-21T10:00:00Z",
            msdyn_changes: '{"name":"account.js"}',
          },
          {
            msdyn_componentlayerid: "layer-2",
            msdyn_name: "Managed layer",
            msdyn_componentid: "wr-1",
            msdyn_solutioncomponentname: "WebResource",
            msdyn_solutionname: "Contoso_Core",
            msdyn_publishername: "Contoso",
            msdyn_order: 100,
            msdyn_overwritetime: "2026-04-20T10:00:00Z",
            msdyn_changes: '{"name":"account.js","managed":true}',
          },
        ],
      },
    });

    registerGetSolutionLayers(server as never, config, client);

    const response = await server.getHandler("get_solution_layers")({
      solution: "Core",
      componentType: "web_resource",
      componentName: "account.js",
      includeChanges: true,
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Solution Layers");
    expect(text).toContain("**Runtime Layer**: Active (unmanaged)");
    expect(text).toContain("**Unmanaged Layer Present**: Yes");
    expect(text).toContain("Layer Stack");
    expect(text).toContain("Default Publisher");
    expect(text).toContain("Contoso_Core");
    expect(text).toContain("Changes: Active");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_solution_layers",
      ok: true,
      data: {
        count: 2,
        hasUnmanagedLayer: true,
      },
    });
  });

  it("returns a clear message when no layer rows are exposed", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-view", objectid: "view-1", componenttype: 26 },
        ],
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
          },
        ],
        msdyn_componentlayers: [],
      },
    });

    registerGetSolutionLayers(server as never, config, client);

    const response = await server.getHandler("get_solution_layers")({
      solution: "Core",
      componentType: "view",
      componentName: "Active Accounts",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("No layer rows were returned");
  });
});
