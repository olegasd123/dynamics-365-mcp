import { describe, expect, it } from "vitest";
import { registerListPluginTraceLogs } from "../list-plugin-trace-logs.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_plugin_trace_logs tool", () => {
  it("lists filtered trace logs for one resolved plugin class", async () => {
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
            isworkflowactivity: false,
            _pluginassemblyid_value: "asm-1",
          },
        ],
        plugintracelogs: {
          "@odata.count": 1,
          value: [
            {
              plugintracelogid: "trace-1",
              typename: "Core.Plugins.AccountPlugin",
              correlationid: "00000000-0000-0000-0000-000000000001",
              createdon: "2026-04-20T08:10:00.000Z",
              messagename: "Update",
              primaryentity: "account",
              mode: 0,
              depth: 1,
              performanceexecutionduration: 42,
              exceptiondetails: "System.InvalidOperationException: Boom",
              messageblock: "Trace line 1\nTrace line 2",
            },
          ],
        },
      },
    });

    registerListPluginTraceLogs(server as never, config, client);

    const response = await server.getHandler("list_plugin_trace_logs")({
      pluginName: "AccountPlugin",
      assemblyName: "Core.Plugins",
      correlationId: "00000000-0000-0000-0000-000000000001",
      createdAfter: "2026-04-20T08:00:00Z",
      createdBefore: "2026-04-20T09:00:00Z",
      hasException: true,
      limit: 5,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Plugin Trace Logs");
    expect(response.content[0].text).toContain("AccountPlugin");
    expect(response.content[0].text).toContain("System.InvalidOperationException: Boom");
    expect(response.structuredContent).toMatchObject({
      tool: "list_plugin_trace_logs",
      ok: true,
      data: {
        environment: "dev",
        plugin: {
          fullName: "Core.Plugins.AccountPlugin",
          assemblyName: "Core.Plugins",
        },
        filters: {
          pluginName: "Core.Plugins.AccountPlugin",
          correlationId: "00000000-0000-0000-0000-000000000001",
          createdAfter: "2026-04-20T08:00:00.000Z",
          createdBefore: "2026-04-20T09:00:00.000Z",
          hasException: true,
        },
        limit: 5,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual([
      "pluginassemblies",
      "plugintypes",
      "plugintracelogs",
    ]);
    expect(calls[2]?.queryParams).toContain("typename eq 'Core.Plugins.AccountPlugin'");
    expect(calls[2]?.queryParams).toContain(
      "correlationid eq '00000000-0000-0000-0000-000000000001'",
    );
    expect(calls[2]?.queryParams).toContain("createdon ge 2026-04-20T08:00:00.000Z");
    expect(calls[2]?.queryParams).toContain("createdon le 2026-04-20T09:00:00.000Z");
  });

  it("supports server-side paging with nextCursor", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        plugintracelogs: {
          "@odata.count": 3,
          "@odata.nextLink": "https://next-page",
          value: [
            {
              plugintracelogid: "trace-1",
              typename: "Core.Plugins.AccountPlugin",
              correlationid: "c-1",
              createdon: "2026-04-20T09:10:00.000Z",
              messagename: "Create",
              primaryentity: "account",
              mode: 0,
              depth: 1,
            },
            {
              plugintracelogid: "trace-2",
              typename: "Core.Plugins.AccountPlugin",
              correlationid: "c-2",
              createdon: "2026-04-20T09:05:00.000Z",
              messagename: "Update",
              primaryentity: "account",
              mode: 1,
              depth: 2,
            },
          ],
        },
        "https://next-page": {
          value: [
            {
              plugintracelogid: "trace-3",
              typename: "Core.Plugins.AccountPlugin",
              correlationid: "c-3",
              createdon: "2026-04-20T09:00:00.000Z",
              messagename: "Delete",
              primaryentity: "account",
              mode: 0,
              depth: 1,
            },
          ],
        },
      },
    });

    registerListPluginTraceLogs(server as never, config, client);

    const firstResponse = await server.getHandler("list_plugin_trace_logs")({
      limit: 2,
    });
    const firstPayload = firstResponse.structuredContent as {
      data: {
        nextCursor: string | null;
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
      };
    };

    expect(firstPayload.data.returnedCount).toBe(2);
    expect(firstPayload.data.totalCount).toBe(3);
    expect(firstPayload.data.hasMore).toBe(true);
    expect(firstPayload.data.nextCursor).toBeTruthy();

    const secondResponse = await server.getHandler("list_plugin_trace_logs")({
      limit: 2,
      cursor: firstPayload.data.nextCursor || undefined,
    });
    const secondPayload = secondResponse.structuredContent as {
      data: {
        cursor: string | null;
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ pluginTraceLogId: string }>;
      };
    };

    expect(secondPayload.data.cursor).toBe(firstPayload.data.nextCursor);
    expect(secondPayload.data.returnedCount).toBe(1);
    expect(secondPayload.data.totalCount).toBe(3);
    expect(secondPayload.data.hasMore).toBe(false);
    expect(secondPayload.data.nextCursor).toBeNull();
    expect(secondPayload.data.items.map((item) => item.pluginTraceLogId)).toEqual(["trace-3"]);
    expect(calls.map((call) => call.entitySet)).toEqual(["plugintracelogs", "https://next-page"]);
  });
});
