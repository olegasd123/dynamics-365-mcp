import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "d365-mcp-config-test-"));
  tempDirs.push(dir);
  return dir;
}

async function importEnvironmentsModule(homeDir: string) {
  vi.resetModules();
  vi.doMock("node:os", () => ({
    homedir: () => homeDir,
  }));
  return import("../environments.js");
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.doUnmock("node:os");

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("environments config", () => {
  it("loads config from the JSON config file path", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "dev",
            url: "https://dev.crm.dynamics.com/",
            tenantId: "tenant",
            clientId: "client",
            clientSecret: "secret",
          },
        ],
        defaultEnvironment: "dev",
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
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
    });
  });

  it("loads config from a connection string", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=ClientSecret;Url=https://org.crm.dynamics.com/;ClientId=client;ClientSecret=secret;TenantId=tenant";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          tenantId: "tenant",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "default",
    });
  });

  it("loads config from individual environment variables", async () => {
    const dir = createTempDir();
    process.env.D365_URL = "https://org.crm.dynamics.com/";
    process.env.D365_TENANT_ID = "tenant";
    process.env.D365_CLIENT_ID = "client";
    process.env.D365_CLIENT_SECRET = "secret";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          tenantId: "tenant",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "default",
    });
  });

  it("returns the default or requested environment", async () => {
    const dir = createTempDir();
    const { getEnvironment } = await importEnvironmentsModule(dir);
    const config = {
      environments: [
        { name: "dev", url: "https://dev", tenantId: "t1", clientId: "c1", clientSecret: "s1" },
        {
          name: "prod",
          url: "https://prod",
          tenantId: "t2",
          clientId: "c2",
          clientSecret: "s2",
        },
      ],
      defaultEnvironment: "dev",
    };

    expect(getEnvironment(config)).toEqual(config.environments[0]);
    expect(getEnvironment(config, "prod")).toEqual(config.environments[1]);
  });

  it("throws when no configuration source is available", async () => {
    const dir = createTempDir();
    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(() => loadConfig()).toThrow("No Dynamics 365 configuration found");
  });
});
