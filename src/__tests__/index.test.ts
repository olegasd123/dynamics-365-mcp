import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      ["--transport=http", "--port=4010", "--host=0.0.0.0", "--path=custom"],
      {},
    );

    expect(options).toEqual({
      transport: "http",
      port: 4010,
      host: "0.0.0.0",
      path: "/custom",
    });
  });

  it("builds the HTTP health payload with runtime details", () => {
    const healthState = createHttpHealthState();
    healthState.requestCount = 3;
    healthState.activeRequestCount = 1;
    healthState.activeSessionCount = 2;
    healthState.errorCount = 1;
    healthState.lastErrorMessage = "Boom";
    healthState.lastErrorAt = "2026-04-06T19:00:00.000Z";

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
