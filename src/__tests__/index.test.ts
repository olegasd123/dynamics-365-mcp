import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../../package.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import {
  buildHealthPayload,
  createHttpHealthState,
  loadRuntimeEnv,
  parseRuntimeOptions,
} from "../index.js";

describe("index runtime helpers", () => {
  it("parses HTTP runtime options from argv and env", () => {
    const options = parseRuntimeOptions(
      [
        "--transport=http",
        "--port=4010",
        "--host=0.0.0.0",
        "--path=custom",
        "--session-idle-timeout-ms=120000",
        "--max-active-sessions=7",
        "--session-cleanup-interval-ms=15000",
      ],
      { MCP_PORT: "9999" },
    );

    expect(options).toEqual({
      transport: "http",
      port: 4010,
      host: "0.0.0.0",
      path: "/custom",
      sessionIdleTimeoutMs: 120000,
      maxActiveSessions: 7,
      sessionCleanupIntervalMs: 15000,
    });
  });

  it("builds the HTTP health payload with runtime details", () => {
    const healthState = createHttpHealthState();
    healthState.requestCount = 3;
    healthState.activeRequestCount = 1;
    healthState.activeSessionCount = 2;
    healthState.pendingSessionCount = 1;
    healthState.errorCount = 1;
    healthState.lastErrorMessage = "Boom";
    healthState.lastErrorAt = "2026-04-06T19:00:00.000Z";
    healthState.evictedSessionCount = 2;
    healthState.expiredSessionCount = 2;
    healthState.rejectedSessionCount = 1;
    healthState.oldestSessionAgeMs = 8500;
    healthState.longestIdleSessionMs = 4200;
    healthState.lastExpiredAt = "2026-04-06T19:05:00.000Z";

    const payload = buildHealthPayload(
      {
        environments: [
          {
            name: "dev",
            url: "https://dev.crm.dynamics.com",
            tenantId: "tenant",
            clientId: "client",
            clientSecret: "secret",
          },
        ],
        defaultEnvironment: "dev",
      },
      {
        transport: "http",
        host: "127.0.0.1",
        port: 3003,
        path: "/mcp",
        sessionIdleTimeoutMs: 600000,
        maxActiveSessions: 10,
        sessionCleanupIntervalMs: 30000,
      },
      {
        getHealthSnapshot: () => ({
          storageType: "osKeychain",
          storageProvider: "macos-keychain",
          storageServiceName: "dynamics-365-mcp",
          storageAvailable: true,
          inMemoryEnvironments: ["dev"],
          persistedDeviceCodeEnvironments: ["dev"],
          pendingEnvironmentCount: 0,
        }),
      } as never,
      {
        getHealthSnapshot: () => ({
          responseCacheEntries: 4,
          pendingRequestCount: 2,
        }),
      } as never,
      healthState,
    );

    expect(payload).toMatchObject({
      status: "ok",
      service: {
        name: "dynamics-365-mcp",
        version: packageJson.version,
        transport: "http",
        host: "127.0.0.1",
        port: 3003,
        path: "/mcp",
      },
      configuration: {
        defaultEnvironment: "dev",
        environmentNames: ["dev"],
        environmentCount: 1,
      },
      requests: {
        total: 3,
        active: 1,
        errors: 1,
        lastErrorMessage: "Boom",
      },
      sessions: {
        active: 2,
        pending: 1,
        maxActive: 10,
        idleTimeoutMs: 600000,
        cleanupIntervalMs: 30000,
        evicted: 2,
        expired: 2,
        rejected: 1,
        oldestAgeSeconds: 8,
        longestIdleSeconds: 4,
        lastExpiredAt: "2026-04-06T19:05:00.000Z",
        shuttingDown: false,
      },
      auth: {
        persistedDeviceCodeEnvironments: ["dev"],
      },
      client: {
        responseCacheEntries: 4,
        pendingRequestCount: 2,
      },
    });
  });

  it("loads runtime env values from the current working directory .env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "d365-mcp-env-"));
    const envFilePath = join(dir, ".env");
    const env: NodeJS.ProcessEnv = {
      D365_MCP_LOG_ENABLED: "false",
    };

    writeFileSync(
      envFilePath,
      [
        "D365_MCP_LOG_ENABLED=true",
        "D365_MCP_LOG_MAX_BODY_CHARS=123",
        "export D365_MCP_LOG_DIR=./logs # comment",
      ].join("\n"),
    );

    try {
      const loaded = loadRuntimeEnv(env, dir);

      expect(loaded).toContain(envFilePath);
      expect(env.D365_MCP_LOG_ENABLED).toBe("false");
      expect(env.D365_MCP_LOG_MAX_BODY_CHARS).toBe("123");
      expect(env.D365_MCP_LOG_DIR).toBe("./logs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
