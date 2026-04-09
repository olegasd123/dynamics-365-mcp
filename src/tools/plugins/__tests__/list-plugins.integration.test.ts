import { describe, expect, it } from "vitest";
import { registerListPlugins } from "../list-plugins.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugins tool", () => {
  it("lists plugin classes and excludes workflow activities", async () => {
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
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [],
      },
    });

    registerListPlugins(server as never, config, client);

    const response = await server.getHandler("list_plugins")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("AccountPlugin");
    expect(response.content[0].text).toContain("Core.Plugins.AccountPlugin");
    expect(response.content[0].text).toContain("Core.Plugins");
    expect(response.content[0].text).not.toContain("AccountActivity");
    expect(response.structuredContent).toMatchObject({
      tool: "list_plugins",
      ok: true,
      data: {
        environment: "dev",
        limit: 50,
        cursor: null,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it("supports orphaned plugin class detection with solution filter", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 }],
        pluginassemblies: [
          { pluginassemblyid: "asm-1", name: "Core.Plugins" },
          { pluginassemblyid: "asm-2", name: "Other.Plugins" },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "OrphanPlugin",
            typename: "Core.Plugins.OrphanPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "OtherPlugin",
            typename: "Other.Plugins.OtherPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-2",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-2",
            name: "Other Step",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [],
      },
    });

    registerListPlugins(server as never, config, client);

    const response = await server.getHandler("list_plugins")({
      solution: "Core",
      filter: "no_steps",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("OrphanPlugin");
    expect(response.content[0].text).not.toContain("OtherPlugin");
  });

  it("supports paging for plugin classes", async () => {
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
          {
            plugintypeid: "type-3",
            name: "LeadPlugin",
            typename: "Core.Plugins.LeadPlugin",
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [],
        sdkmessageprocessingstepimages: [],
      },
    });

    registerListPlugins(server as never, config, client);

    const response = await server.getHandler("list_plugins")({ limit: 2 });
    const payload = response.structuredContent as {
      data: {
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ name: string }>;
      };
    };

    expect(response.content[0].text).toContain("Showing 2 of 3 plugin classes.");
    expect(payload.data.returnedCount).toBe(2);
    expect(payload.data.totalCount).toBe(3);
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data.nextCursor).toBe("2");
    expect(payload.data.items.map((item) => item.name)).toEqual(["AccountPlugin", "ContactPlugin"]);
  });
});
