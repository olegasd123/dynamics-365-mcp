import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createToolErrorResponse, createToolSuccessResponse } from "../../tools/response.js";
import { FakeServer } from "../../tools/__tests__/tool-test-helpers.js";
import { instrumentServerToolLogging, requestLogger } from "../request-logger.js";

describe("request logger", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    requestLogger.configureFromEnv({});
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("writes one log file for one tool call", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "d365-mcp-logs-"));
    requestLogger.configureFromEnv({
      D365_MCP_LOG_ENABLED: "true",
      D365_MCP_LOG_DIR: tempDir,
    });

    const server = new FakeServer();
    instrumentServerToolLogging(server as never);

    server.tool("demo_tool", "Demo", {}, async () => {
      const callId = requestLogger.beginHttpCall({
        type: "crm",
        method: "GET",
        url: "https://dev.crm.dynamics.com/api/data/v9.2/accounts?$select=name",
        headers: {
          Authorization: "Bearer secret-token",
        },
      });
      requestLogger.logHttpResponse(callId, {
        status: 200,
        body: {
          value: [{ name: "Account" }],
        },
      });

      return createToolSuccessResponse("demo_tool", "Done", "Done", {
        ok: true,
      });
    });

    const handler = server.getHandler("demo_tool") as never;
    await handler(
      { environment: "dev", nameFilter: "Account" },
      { requestId: "req-42", sessionId: "session-1" },
    );

    const [dateFolder] = readdirSync(tempDir);
    expect(dateFolder).toBeTruthy();

    const [fileName] = readdirSync(join(tempDir, dateFolder));
    expect(fileName).toContain("demo_tool");
    expect(fileName).toContain("req-req-42");

    const text = readFileSync(join(tempDir, dateFolder, fileName), "utf8");
    expect(text).toContain("REQUEST START");
    expect(text).toContain("CRM REQUEST #1");
    expect(text).toContain("HTTP RESPONSE #1");
    expect(text).toContain('"Authorization": "[REDACTED]"');
    expect(text).toContain("TOOL RESPONSE demo_tool");
  });

  it("writes error responses to the same request log file", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "d365-mcp-logs-"));
    requestLogger.configureFromEnv({
      D365_MCP_LOG_ENABLED: "true",
      D365_MCP_LOG_DIR: tempDir,
    });

    const server = new FakeServer();
    instrumentServerToolLogging(server as never);

    server.tool("demo_error", "Demo Error", {}, async () =>
      createToolErrorResponse("demo_error", "Something failed"),
    );

    const handler = server.getHandler("demo_error") as never;
    await handler({}, { requestId: "req-99" });

    const [dateFolder] = readdirSync(tempDir);
    const [fileName] = readdirSync(join(tempDir, dateFolder));
    const text = readFileSync(join(tempDir, dateFolder, fileName), "utf8");

    expect(text).toContain("TOOL RESPONSE demo_error");
    expect(text).toContain("ERROR tool-response:demo_error");
    expect(text).toContain("Something failed");
  });
});
