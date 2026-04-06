import { describe, expect, it } from "vitest";
import { registerGetPluginDetails } from "../get-plugin-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_plugin_details tool", () => {
  it("renders plugin details with types, steps, and images", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.2.3",
            publickeytoken: "abcd1234",
            isolationmode: 2,
            ismanaged: false,
            createdon: "2026-01-10T12:00:00Z",
            modifiedon: "2026-02-11T12:00:00Z",
          },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            isworkflowactivity: true,
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Create",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "img-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name",
            messagepropertyname: "Target",
          },
        ],
      },
    });

    registerGetPluginDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_details")({
      pluginName: "Core.Plugins",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Plugin: Core.Plugins");
    expect(text).toContain("- **Version**: 1.2.3");
    expect(text).toContain("#### AccountPlugin (`Core.Plugins.AccountPlugin`)");
    expect(text).toContain("*Workflow Activity*");
    expect(text).toContain("Message: Create | Entity: account | Stage: Pre-Operation | Mode: Synchronous | Status: Enabled");
    expect(text).toContain("Filtering: name");
    expect(text).toContain("PreImage (PreImage, alias: pre, attributes: name)");
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_details",
      ok: true,
      data: {
        environment: "dev",
        found: true,
        counts: {
          types: 1,
          steps: 1,
          images: 1,
        },
      },
    });

    const payload = response.structuredContent as {
      data: {
        types: Array<{
          name: string;
          steps: Array<{ stageLabel: string; images: Array<{ imageTypeLabel: string }> }>;
        }>;
      };
    };
    expect(payload.data.types[0].name).toBe("AccountPlugin");
    expect(payload.data.types[0].steps[0].stageLabel).toBe("Pre-Operation");
    expect(payload.data.types[0].steps[0].images[0].imageTypeLabel).toBe("PreImage");
  });

  it("returns a not found message when the plugin assembly does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [],
      },
    });

    registerGetPluginDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_details")({
      pluginName: "Missing.Plugin",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Plugin assembly 'Missing.Plugin' not found in 'dev'.");
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_details",
      ok: true,
      data: {
        environment: "dev",
        found: false,
        pluginName: "Missing.Plugin",
      },
    });
  });

  it("returns an error when the client query fails", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const client = {
      async query(): Promise<never[]> {
        throw new Error("Dynamics API error [dev] (500): Plugin details failed");
      },
    } as never;

    registerGetPluginDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_details")({
      pluginName: "Core.Plugins",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Dynamics API error [dev] (500): Plugin details failed",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_details",
      ok: false,
      error: {
        message: "Dynamics API error [dev] (500): Plugin details failed",
      },
    });
  });
});
