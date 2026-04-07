import { describe, expect, it } from "vitest";
import { registerListPluginAssemblyImages } from "../list-plugin-assembly-images.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_assembly_images tool", () => {
  it("returns filtered plugin images through the bulk inventory path", async () => {
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
            _eventhandler_value: "type-1",
            name: "Account Update",
            stage: 40,
            mode: 0,
            rank: 1,
            statecode: 0,
            sdkmessageid: { name: "Update" },
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
          {
            sdkmessageprocessingstepimageid: "img-2",
            _sdkmessageprocessingstepid_value: "step-2",
            name: "PostImage",
            entityalias: "post",
            imagetype: 1,
            attributes: "name,accountnumber",
            messagepropertyname: "Target",
          },
        ],
      },
    });

    registerListPluginAssemblyImages(server as never, config, client);

    const response = await server.getHandler("list_plugin_assembly_images")({
      assemblyName: "Core.Plugins",
      message: "Update",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Found 1 image(s).");
    expect(response.content[0].text).toContain("PostImage");
    expect(response.content[0].text).not.toContain("PreImage");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "pluginassemblies",
      "plugintypes",
      "sdkmessageprocessingsteps",
      "sdkmessageprocessingstepimages",
    ]);
  });
});
