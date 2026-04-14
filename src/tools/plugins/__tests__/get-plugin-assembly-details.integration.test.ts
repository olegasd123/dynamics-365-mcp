import { describe, expect, it } from "vitest";
import { registerGetPluginAssemblyDetails } from "../get-plugin-assembly-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_plugin_assembly_details tool", () => {
  it("renders plugin classes and workflow activities in separate sections", async () => {
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
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "AccountActivity",
            typename: "Core.Plugins.AccountActivity",
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
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-2",
            name: "Activity Execute",
            stage: 40,
            mode: 0,
            rank: 1,
            statecode: 0,
            filteringattributes: "",
            supporteddeployment: 0,
            asyncautodelete: false,
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
        ],
      },
    });

    registerGetPluginAssemblyDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_assembly_details")({
      assemblyName: "Core.Plugins",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Plugin Assembly: Core.Plugins");
    expect(text).toContain("- **Version**: 1.2.3");
    expect(text).toContain("### Plugin Classes (1)");
    expect(text).toContain("### Workflow Activities (1)");
    expect(text).toContain("#### AccountPlugin (`Core.Plugins.AccountPlugin`)");
    expect(text).toContain("#### AccountActivity (`Core.Plugins.AccountActivity`)");
    expect(text).toContain(
      "Message: Create | Entity: account | Stage: Pre-Operation | Mode: Synchronous | Status: Enabled",
    );
    expect(text).toContain(
      "Message: Update | Entity: account | Stage: Post-Operation | Mode: Synchronous | Status: Enabled",
    );
    expect(text).toContain("Filtering: name");
    expect(text).toContain("PreImage (PreImage, alias: pre, attributes: name)");
    expect(text).toContain("plugin tools exclude workflow activities");
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_assembly_details",
      ok: true,
      data: {
        environment: "dev",
        found: true,
        counts: {
          types: 2,
          pluginClasses: 1,
          workflowActivities: 1,
          steps: 2,
          images: 1,
        },
      },
    });

    const payload = response.structuredContent as {
      data: {
        pluginClasses: Array<{
          name: string;
          steps: Array<{ stageLabel: string; images: Array<{ imageTypeLabel: string }> }>;
        }>;
        workflowActivities: Array<{
          name: string;
          steps: Array<{ stageLabel: string }>;
        }>;
      };
    };
    expect(payload.data.pluginClasses[0].name).toBe("AccountPlugin");
    expect(payload.data.pluginClasses[0].steps[0].stageLabel).toBe("Pre-Operation");
    expect(payload.data.pluginClasses[0].steps[0].images[0].imageTypeLabel).toBe("PreImage");
    expect(payload.data.workflowActivities[0].name).toBe("AccountActivity");
    expect(payload.data.workflowActivities[0].steps[0].stageLabel).toBe("Post-Operation");
  });

  it("returns a not found message when the plugin assembly does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [],
      },
    });

    registerGetPluginAssemblyDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_assembly_details")({
      assemblyName: "Missing.Plugin",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "Plugin assembly 'Missing.Plugin' not found in 'dev'.",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_assembly_details",
      ok: true,
      data: {
        environment: "dev",
        found: false,
        assemblyName: "Missing.Plugin",
      },
    });
  });

  it("returns structured retry options when the assembly name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
          },
          {
            pluginassemblyid: "asm-2",
            name: "core.plugins",
          },
        ],
      },
    });

    registerGetPluginAssemblyDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_assembly_details")({
      assemblyName: "CORE.PLUGINS",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose an assembly and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_plugin_assembly_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "assemblyName",
        options: [
          { value: "asm-1", label: "Core.Plugins (asm-1)" },
          { value: "asm-2", label: "core.plugins (asm-2)" },
        ],
        retryable: false,
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

    registerGetPluginAssemblyDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_assembly_details")({
      assemblyName: "Core.Plugins",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Dynamics API error [dev] (500): Plugin details failed",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_assembly_details",
      ok: false,
      error: {
        message: "Dynamics API error [dev] (500): Plugin details failed",
      },
    });
  });
});
