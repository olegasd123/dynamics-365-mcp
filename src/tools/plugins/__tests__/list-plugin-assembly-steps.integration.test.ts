import { describe, expect, it } from "vitest";
import { registerListPluginAssemblySteps } from "../list-plugin-assembly-steps.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_assembly_steps tool", () => {
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

    registerListPluginAssemblySteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_assembly_steps")({
      assemblyName: "Core.Plugins",
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

  it("returns an error when the environment does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({ dev: {} });

    registerListPluginAssemblySteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_assembly_steps")({
      environment: "prod",
      assemblyName: "Core.Plugins",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Environment 'prod' not found");
  });

  it("returns a not found message when the plugin assembly does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [],
      },
    });

    registerListPluginAssemblySteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_assembly_steps")({
      assemblyName: "Missing.Plugin",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "Plugin assembly 'Missing.Plugin' not found in 'dev'.",
    );
  });

  it("returns an error when the client query fails", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const client = {
      async query(): Promise<never[]> {
        throw new Error("Dynamics API error [dev] (500): Plugin query failed");
      },
    } as never;

    registerListPluginAssemblySteps(server as never, config, client);

    const response = await server.getHandler("list_plugin_assembly_steps")({
      assemblyName: "Core.Plugins",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Dynamics API error [dev] (500): Plugin query failed",
    );
  });
});
