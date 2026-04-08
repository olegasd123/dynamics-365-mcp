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
});
