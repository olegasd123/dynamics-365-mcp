import { describe, expect, it } from "vitest";
import { registerListPluginSteps } from "../list-plugin-steps.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_steps tool", () => {
  it("returns plugin steps through the bulk inventory path", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "ContactPlugin",
            typename: "Core.Plugins.ContactPlugin",
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
      },
    });

    registerListPluginSteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_steps")({
      pluginName: "Core.Plugins",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Found 2 step(s).");
    expect(response.content[0].text).toContain("Account Create");
    expect(response.content[0].text).toContain("Contact Update");
    expect(response.content[0].text).toContain("Asynchronous");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "pluginassemblies",
      "plugintypes",
      "sdkmessageprocessingsteps",
    ]);
  });
});
