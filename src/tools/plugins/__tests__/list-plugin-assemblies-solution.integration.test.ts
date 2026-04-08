import { describe, expect, it } from "vitest";
import { registerListPluginAssemblies } from "../list-plugin-assemblies.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_assemblies solution filter", () => {
  it("filters plugin assemblies by solution", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 }],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
          {
            pluginassemblyid: "asm-2",
            name: "Other.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
        ],
      },
    });

    registerListPluginAssemblies(server as never, config, client);

    const response = await server.getHandler("list_plugin_assemblies")({
      solution: "Core",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("Core.Plugins");
    expect(text).not.toContain("Other.Plugins");
  });
});
