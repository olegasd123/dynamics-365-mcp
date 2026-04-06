import { describe, expect, it } from "vitest";
import { buildHealthPayload, createHttpHealthState, parseRuntimeOptions } from "../index.js";

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
          cachePath: "/tmp/token-cache.json",
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
      auth: {
        persistedDeviceCodeEnvironments: ["dev"],
      },
      client: {
        responseCacheEntries: 4,
        pendingRequestCount: 2,
      },
    });
  });
});
