import { describe, expect, it } from "vitest";
import { registerListPluginSteps } from "../list-plugin-steps.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_steps tool", () => {
  it("lists steps for one plugin class", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "ContactPlugin",
            typename: "Core.Plugins.ContactPlugin",
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
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-2",
            name: "Contact Update",
            stage: 40,
            mode: 1,
            rank: 2,
            statecode: 1,
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
        ],
        sdkmessageprocessingstepimages: [],
      },
    });

    registerListPluginSteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_steps")({
      pluginName: "AccountPlugin",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Core.Plugins.AccountPlugin");
    expect(response.content[0].text).toContain("Account Create");
    expect(response.content[0].text).not.toContain("Contact Update");
    expect(response.structuredContent).toMatchObject({
      tool: "list_plugin_steps",
      ok: true,
      data: {
        count: 1,
        plugin: {
          fullName: "Core.Plugins.AccountPlugin",
          assemblyName: "Core.Plugins",
        },
      },
    });
  });

  it("returns an error when the plugin name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [
          { pluginassemblyid: "asm-1", name: "Core.Plugins" },
          { pluginassemblyid: "asm-2", name: "Other.Plugins" },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "SharedPlugin",
            typename: "Core.Plugins.SharedPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "SharedPlugin",
            typename: "Other.Plugins.SharedPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-2",
          },
        ],
        sdkmessageprocessingsteps: [],
      },
    });

    registerListPluginSteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_steps")({
      pluginName: "SharedPlugin",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("ambiguous");
  });
});
