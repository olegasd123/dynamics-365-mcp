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
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: undefined,
    });
  });

  it("loads client secret auth with an environment variable secret source", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "prod",
            url: "https://prod.crm.dynamics.com/",
            tenantId: "tenant",
            authType: "clientSecret",
            clientId: "client",
            clientSecretSource: "env",
            clientSecretEnv: "D365_PROD_CLIENT_SECRET",
          },
        ],
        defaultEnvironment: "prod",
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "prod",
          url: "https://prod.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: undefined,
          clientSecretSource: "env",
          clientSecretEnv: "D365_PROD_CLIENT_SECRET",
        },
      ],
      defaultEnvironment: "prod",
      advancedQueries: undefined,
    });
  });

  it("loads client secret auth with an OS keychain secret source", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "prod",
            url: "https://prod.crm.dynamics.com/",
            tenantId: "tenant",
            authType: "clientSecret",
            clientId: "client",
            clientSecretSource: "osKeychain",
            clientSecretName: "prod-client-secret",
            clientSecretKeychainService: "dynamics-365-mcp-client-secrets",
          },
        ],
        defaultEnvironment: "prod",
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "prod",
          url: "https://prod.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: undefined,
          clientSecretSource: "osKeychain",
          clientSecretName: "prod-client-secret",
          clientSecretKeychainService: "dynamics-365-mcp-client-secrets",
        },
      ],
      defaultEnvironment: "prod",
      advancedQueries: undefined,
    });
  });

  it("throws when client secret auth misses the required source field", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "prod",
            url: "https://prod.crm.dynamics.com/",
            tenantId: "tenant",
            authType: "clientSecret",
            clientId: "client",
            clientSecretSource: "env",
          },
        ],
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(() => loadConfig()).toThrow(
      "Environment 'prod' uses clientSecret auth with env clientSecretSource and must include clientSecretEnv",
    );
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
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads client secret auth with an environment variable from a connection string", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=ClientSecret;Url=https://org.crm.dynamics.com/;ClientId=client;ClientSecretSource=Env;ClientSecretEnv=D365_CLIENT_SECRET;TenantId=tenant";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecretSource: "env",
          clientSecretEnv: "D365_CLIENT_SECRET",
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads config from multiple connection strings", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRINGS = JSON.stringify({
      environments: [
        {
          name: "dev",
          connectionString:
            "AuthType=ClientSecret;Url=https://dev.crm.dynamics.com/;ClientId=dev-client;ClientSecret=dev-secret;TenantId=dev-tenant",
        },
        {
          name: "prod",
          connectionString:
            "AuthType=ClientSecret;Url=https://prod.crm.dynamics.com/;ClientId=prod-client;ClientSecret=prod-secret;TenantId=prod-tenant",
        },
      ],
      defaultEnvironment: "prod",
    });

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "dev",
          url: "https://dev.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "dev-tenant",
          authType: "clientSecret",
          clientId: "dev-client",
          clientSecret: "dev-secret",
        },
        {
          name: "prod",
          url: "https://prod.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "prod-tenant",
          authType: "clientSecret",
          clientId: "prod-client",
          clientSecret: "prod-secret",
        },
      ],
      defaultEnvironment: "prod",
      advancedQueries: undefined,
    });
  });

  it("returns the default or requested environment", async () => {
    const dir = createTempDir();
    const { getEnvironment } = await importEnvironmentsModule(dir);
    const config = {
      environments: [
        {
          name: "dev",
          url: "https://dev",
          apiVersion: "v9.2",
          tenantId: "t1",
          authType: "clientSecret" as const,
          clientId: "c1",
          clientSecret: "s1",
        },
        {
          name: "prod",
          url: "https://prod",
          apiVersion: "v9.2",
          tenantId: "t2",
          authType: "clientSecret" as const,
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

    expect(() => loadConfig()).toThrow(
      "No Dynamics 365 configuration found. Set D365_MCP_CONFIG, D365_CONNECTION_STRINGS, or D365_CONNECTION_STRING. See docs/run-mcp.md for setup examples.",
    );
  });

  it("loads device code auth from the JSON config file", async () => {
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
            authType: "deviceCode",
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
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "deviceCode",
          clientId: undefined,
          clientSecret: undefined,
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: undefined,
    });
  });

  it("loads client certificate auth from the JSON config file", async () => {
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
            authType: "clientCertificate",
            clientId: "client",
            certificatePath: "/secure/client.crt",
            privateKeyPath: "/secure/client.key",
            privateKeyPassphrase: "passphrase",
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
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientCertificate",
          clientId: "client",
          clientSecret: undefined,
          certificatePath: "/secure/client.crt",
          certificateStore: undefined,
          certificateStoreThumbprint: undefined,
          clientCertificateThumbprint: undefined,
          privateKeySource: "file",
          privateKeyName: undefined,
          privateKeyKeychainService: undefined,
          privateKeyPath: "/secure/client.key",
          privateKeyPassphrase: "passphrase",
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: undefined,
    });
  });

  it("loads client certificate auth from a connection string", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=ClientCertificate;Url=https://org.crm.dynamics.com/;TenantId=tenant;ClientId=client;CertificatePath=/secure/client.crt;PrivateKeyPath=/secure/client.key;PrivateKeyPassphrase=passphrase";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientCertificate",
          clientId: "client",
          certificatePath: "/secure/client.crt",
          certificateStore: undefined,
          certificateStoreThumbprint: undefined,
          clientCertificateThumbprint: undefined,
          privateKeySource: "file",
          privateKeyName: undefined,
          privateKeyKeychainService: undefined,
          privateKeyPath: "/secure/client.key",
          privateKeyPassphrase: "passphrase",
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads client certificate auth with an OS keychain private key", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "prod",
            url: "https://prod.crm.dynamics.com/",
            tenantId: "tenant",
            authType: "clientCertificate",
            clientId: "client",
            certificatePath: "/secure/client.crt",
            privateKeySource: "osKeychain",
            privateKeyName: "prod-client-key",
            privateKeyKeychainService: "dynamics-365-mcp-client-certificates",
          },
        ],
        defaultEnvironment: "prod",
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "prod",
          url: "https://prod.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientCertificate",
          clientId: "client",
          clientSecret: undefined,
          certificatePath: "/secure/client.crt",
          certificateStore: undefined,
          certificateStoreThumbprint: undefined,
          clientCertificateThumbprint: undefined,
          privateKeySource: "osKeychain",
          privateKeyName: "prod-client-key",
          privateKeyKeychainService: "dynamics-365-mcp-client-certificates",
          privateKeyPath: undefined,
          privateKeyPassphrase: undefined,
        },
      ],
      defaultEnvironment: "prod",
      advancedQueries: undefined,
    });
  });

  it("loads client certificate auth with a Windows certificate store", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=ClientCertificate;Url=https://org.crm.dynamics.com/;TenantId=tenant;ClientId=client;CertificateStore=windowsCurrentUser;CertificateStoreThumbprint=11223344556677889900AABBCCDDEEFF00112233";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientCertificate",
          clientId: "client",
          certificatePath: undefined,
          certificateStore: "windowsCurrentUser",
          certificateStoreThumbprint: "11223344556677889900AABBCCDDEEFF00112233",
          clientCertificateThumbprint: undefined,
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads device code auth from a connection string", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=DeviceCode;Url=https://org.crm.dynamics.com/;TenantId=tenant";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "deviceCode",
          clientId: undefined,
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads interactive browser auth from the JSON config file", async () => {
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
            authType: "interactiveBrowser",
            clientId: "public-client",
            redirectUri: "http://localhost:8400/callback",
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
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "interactiveBrowser",
          clientId: "public-client",
          clientSecret: undefined,
          redirectUri: "http://localhost:8400/callback",
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: undefined,
    });
  });

  it("loads interactive browser auth from a connection string", async () => {
    const dir = createTempDir();
    process.env.D365_CONNECTION_STRING =
      "AuthType=InteractiveBrowser;Url=https://org.crm.dynamics.com/;TenantId=tenant;ClientId=public-client;RedirectUri=http://127.0.0.1:8401/callback";

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "default",
          url: "https://org.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "interactiveBrowser",
          clientId: "public-client",
          redirectUri: "http://127.0.0.1:8401/callback",
        },
      ],
      defaultEnvironment: "default",
      advancedQueries: undefined,
    });
  });

  it("loads a custom api version from the JSON config file", async () => {
    const dir = createTempDir();
    const configPath = join(dir, "config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        environments: [
          {
            name: "dev",
            url: "https://dev.crm.dynamics.com/",
            apiVersion: "v9.1",
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
          apiVersion: "v9.1",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: undefined,
    });
  });

  it("loads advanced FetchXML query settings from the JSON config file", async () => {
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
        advancedQueries: {
          fetchXml: {
            enabled: true,
            allowedEnvironments: ["dev"],
            defaultLimit: 25,
            maxLimit: 100,
          },
        },
      }),
    );

    process.env.D365_MCP_CONFIG = configPath;

    const { loadConfig } = await importEnvironmentsModule(dir);

    expect(loadConfig()).toEqual({
      environments: [
        {
          name: "dev",
          url: "https://dev.crm.dynamics.com",
          apiVersion: "v9.2",
          tenantId: "tenant",
          authType: "clientSecret",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "dev",
      advancedQueries: {
        fetchXml: {
          enabled: true,
          allowedEnvironments: ["dev"],
          defaultLimit: 25,
          maxLimit: 100,
        },
      },
    });
  });
});
