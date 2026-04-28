import { describe, expect, it } from "vitest";
import { registerGetAppModuleDetails } from "../get-app-module-details.js";
import { registerListAppModules } from "../list-app-modules.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("app module tools", () => {
  it("lists app modules with state labels", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
      },
    });

    registerListAppModules(server as never, config, client);

    const response = await server.getHandler("list_app_modules")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Sales Hub");
    expect(response.content[0].text).toContain("Active");
  });

  it("loads one app module", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 1,
          },
        ],
      },
    });

    registerGetAppModuleDetails(server as never, config, client);

    const response = await server.getHandler("get_app_module_details")({
      appName: "contoso_SalesHub",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("State: Inactive");
    expect(response.structuredContent).toMatchObject({
      data: {
        app: {
          name: "Sales Hub",
          stateLabel: "Inactive",
        },
      },
    });
  });

  it("uses solution components directly when listing app modules in a solution", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "solution-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "component-app-1",
            _solutionid_value: "solution-1",
            objectid: "app-1",
            componenttype: 80,
          },
          {
            solutioncomponentid: "component-table-1",
            _solutionid_value: "solution-1",
            objectid: "table-1",
            componenttype: 1,
          },
        ],
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
          },
        ],
      },
    });

    registerListAppModules(server as never, config, client);

    const response = await server.getHandler("list_app_modules")({
      solution: "Contoso_Core",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Sales Hub");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "solutions",
      "solutioncomponents",
      "appmodules",
    ]);
  });

  it("returns structured retry options when the app module is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub_A",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
          {
            appmoduleid: "app-2",
            name: "Sales Hub",
            uniquename: "contoso_SalesHub_B",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
      },
    });

    registerGetAppModuleDetails(server as never, config, client);

    const response = await server.getHandler("get_app_module_details")({
      appName: "Sales Hub",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching app module");
    expect(response.structuredContent).toMatchObject({
      tool: "get_app_module_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "appName",
        options: [
          { value: "contoso_SalesHub_A", label: "Sales Hub (contoso_SalesHub_A)" },
          { value: "contoso_SalesHub_B", label: "Sales Hub (contoso_SalesHub_B)" },
        ],
        retryable: false,
      },
    });
  });
});
