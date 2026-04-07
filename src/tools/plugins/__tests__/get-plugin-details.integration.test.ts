import { describe, expect, it } from "vitest";
import { registerGetPluginDetails } from "../get-plugin-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_plugin_details tool", () => {
  it("renders plugin class details with steps and images", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
          },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            friendlyname: "Account plugin",
            isworkflowactivity: false,
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
      pluginName: "Core.Plugins.AccountPlugin",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Plugin: AccountPlugin");
    expect(response.content[0].text).toContain("- **Full Name**: Core.Plugins.AccountPlugin");
    expect(response.content[0].text).toContain("- **Assembly**: Core.Plugins");
    expect(response.content[0].text).toContain("Account Create");
    expect(response.content[0].text).toContain("PreImage (PreImage, alias: pre, attributes: name)");
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_details",
      ok: true,
      data: {
        plugin: {
          name: "AccountPlugin",
          fullName: "Core.Plugins.AccountPlugin",
          assemblyName: "Core.Plugins",
        },
        counts: {
          steps: 1,
          images: 1,
        },
      },
    });
  });

  it("returns an error when the plugin does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [],
      },
    });

    registerGetPluginDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_details")({
      pluginName: "MissingPlugin",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Plugin 'MissingPlugin' not found");
  });
});
