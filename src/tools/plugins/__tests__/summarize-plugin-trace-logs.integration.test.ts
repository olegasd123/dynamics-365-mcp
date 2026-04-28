import { describe, expect, it } from "vitest";
import { registerSummarizePluginTraceLogs } from "../summarize-plugin-trace-logs.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("summarize_plugin_trace_logs tool", () => {
  it("summarizes trace logs by plugin step with duration and exception metrics", async () => {
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
          "@odata.count": 4,
          value: [
            {
              plugintracelogid: "trace-1",
              typename: "Core.Plugins.AccountPlugin",
              createdon: "2026-04-20T08:10:00.000Z",
              messagename: "Update",
              primaryentity: "account",
              mode: 0,
              performanceexecutionduration: 10,
              exceptiondetails: "",
              pluginstepid: "step-1",
            },
            {
              plugintracelogid: "trace-2",
              typename: "Core.Plugins.AccountPlugin",
              createdon: "2026-04-20T08:11:00.000Z",
              messagename: "Update",
              primaryentity: "account",
              mode: 0,
              performanceexecutionduration: 20,
              exceptiondetails: "System.InvalidOperationException: Boom\n   at Plugin.Execute()",
              pluginstepid: "step-1",
            },
            {
              plugintracelogid: "trace-3",
              typename: "Core.Plugins.AccountPlugin",
              createdon: "2026-04-20T08:12:00.000Z",
              messagename: "Update",
              primaryentity: "account",
              mode: 0,
              performanceexecutionduration: 100,
              exceptiondetails: "System.InvalidOperationException: Boom",
              pluginstepid: "step-1",
            },
            {
              plugintracelogid: "trace-4",
              typename: "Core.Plugins.AccountPlugin",
              createdon: "2026-04-20T08:13:00.000Z",
              messagename: "Create",
              primaryentity: "account",
              mode: 1,
              performanceexecutionduration: 5,
              exceptiondetails: "",
              pluginstepid: "step-2",
            },
          ],
        },
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            name: "Account Pre Update",
            stage: 20,
            mode: 0,
            rank: 1,
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            name: "Account Async Create",
            stage: 40,
            mode: 1,
            rank: 2,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
      },
    });

    registerSummarizePluginTraceLogs(server as never, config, client);

    const response = await server.getHandler("summarize_plugin_trace_logs")({
      pluginName: "AccountPlugin",
      assemblyName: "Core.Plugins",
      createdAfter: "2026-04-20T08:00:00Z",
      createdBefore: "2026-04-20T09:00:00Z",
      maxRecords: 10,
      topExceptions: 3,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Plugin Trace Log Summary");
    expect(response.content[0].text).toContain("Account Pre Update");
    expect(response.structuredContent).toMatchObject({
      tool: "summarize_plugin_trace_logs",
      ok: true,
      data: {
        environment: "dev",
        groupBy: "plugin_step",
        scannedCount: 4,
        totalCount: 4,
        hasMore: false,
        groupCount: 2,
        groups: [
          {
            pluginName: "AccountPlugin",
            pluginStepId: "step-1",
            stepName: "Account Pre Update",
            count: 3,
            failureCount: 2,
            failureRatePercent: 66.67,
            p50DurationMs: 20,
            p95DurationMs: 100,
            maxDurationMs: 100,
            topExceptions: [
              {
                message: "System.InvalidOperationException: Boom",
                count: 2,
              },
            ],
          },
          {
            pluginName: "AccountPlugin",
            pluginStepId: "step-2",
            stepName: "Account Async Create",
            count: 1,
            failureCount: 0,
          },
        ],
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual([
      "pluginassemblies",
      "plugintypes",
      "plugintracelogs",
      "sdkmessageprocessingsteps",
    ]);
    expect(calls[2]?.queryParams).toContain("typename eq 'Core.Plugins.AccountPlugin'");
    expect(calls[2]?.queryParams).toContain("createdon ge 2026-04-20T08:00:00.000Z");
    expect(calls[2]?.queryParams).toContain("createdon le 2026-04-20T09:00:00.000Z");
    expect(calls[2]?.queryParams).toContain("$top=10");
  });
});
