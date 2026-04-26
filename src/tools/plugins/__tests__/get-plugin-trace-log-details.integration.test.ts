import { describe, expect, it } from "vitest";
import { registerGetPluginTraceLogDetails } from "../get-plugin-trace-log-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_plugin_trace_log_details tool", () => {
  it("loads one trace log with full details", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        "plugintracelogs(trace-1)": {
          plugintracelogid: "trace-1",
          typename: "Core.Plugins.AccountPlugin",
          correlationid: "corr-1",
          requestid: "req-1",
          createdon: "2026-04-20T08:10:00.000Z",
          messagename: "Update",
          primaryentity: "account",
          mode: 0,
          depth: 2,
          performanceexecutionduration: 42,
          performanceconstructorduration: 5,
          operationtype: 1,
          pluginstepid: "step-1",
          issystemcreated: false,
          persistencekey: "persist-1",
          exceptiondetails: "System.InvalidOperationException: Boom",
          messageblock: "Trace line 1\nTrace line 2",
          configuration: "config value",
          secureconfiguration: "secure config value",
          profile: '{"run":1}',
        },
      },
    });

    registerGetPluginTraceLogDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_trace_log_details")({
      pluginTraceLogId: "trace-1",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Plugin Trace Log: trace-1");
    expect(response.content[0].text).toContain("System.InvalidOperationException: Boom");
    expect(response.content[0].text).toContain("Trace line 1");
    expect(response.content[0].text).toContain("secure config value");
    expect(response.structuredContent).toMatchObject({
      tool: "get_plugin_trace_log_details",
      ok: true,
      data: {
        environment: "dev",
        traceLog: {
          pluginTraceLogId: "trace-1",
          typeName: "Core.Plugins.AccountPlugin",
          correlationId: "corr-1",
          requestId: "req-1",
          messageName: "Update",
          primaryEntity: "account",
          mode: 0,
          modeLabel: "Synchronous",
          depth: 2,
          executionDurationMs: 42,
          constructorDurationMs: 5,
        },
      },
    });
    expect(calls).toEqual([
      {
        environment: "dev",
        entitySet: "plugintracelogs(trace-1)",
        queryParams: expect.stringContaining("$select=plugintracelogid"),
      },
    ]);
  });

  it("returns an error when the trace log is missing", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({ dev: {} });

    registerGetPluginTraceLogDetails(server as never, config, client);

    const response = await server.getHandler("get_plugin_trace_log_details")({
      pluginTraceLogId: "missing-id",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Plugin trace log 'missing-id' not found.");
  });
});
