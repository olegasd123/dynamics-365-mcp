import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { AppConfig, EnvironmentConfig } from "./types.js";

interface ConnectionStringEnvironmentEntry {
  name?: string;
  connectionString?: string;
}

interface ConnectionStringsEnvPayload {
  environments?: ConnectionStringEnvironmentEntry[];
  defaultEnvironment?: string;
}

const CONFIG_HELP_DOC = "docs/run-mcp.md";

export class EnvironmentNotFoundError extends Error {
  constructor(
    public readonly environment: string,
    public readonly availableEnvironments: string[],
  ) {
    super(`Environment '${environment}' not found. Available: ${availableEnvironments.join(", ")}`);
    this.name = "EnvironmentNotFoundError";
  }
}

function parseConnectionString(connStr: string): EnvironmentConfig {
  const parts = new Map<string, string>();
  for (const segment of connStr.split(";")) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) continue;
    const key = segment.slice(0, eqIndex).trim().toLowerCase();
    const value = segment.slice(eqIndex + 1).trim();
    parts.set(key, value);
  }

  const authTypeValue = parts.get("authtype")?.toLowerCase();
  const url = parts.get("url");
  const clientId = parts.get("clientid");
  const clientSecret = parts.get("clientsecret");
  const tenantId = parts.get("tenantid");

  if (!url || !tenantId) {
    throw new Error("Connection string must contain Url and TenantId");
  }

  if (authTypeValue === "devicecode") {
    return {
      name: "default",
      url: url.replace(/\/$/, ""),
      tenantId,
      authType: "deviceCode",
      clientId,
    };
  }

  if (!clientId || !clientSecret) {
    throw new Error("Client secret auth requires ClientId, ClientSecret, Url, and TenantId");
  }

  return {
    name: "default",
    url: url.replace(/\/$/, ""),
    tenantId,
    authType: "clientSecret",
    clientId,
    clientSecret,
  };
}

function loadFromConnectionStringsEnv(): AppConfig | null {
  const raw = process.env.D365_CONNECTION_STRINGS;
  if (!raw) {
    return null;
  }

  let payload: ConnectionStringsEnvPayload;
  try {
    payload = JSON.parse(raw) as ConnectionStringsEnvPayload;
  } catch {
    throw new Error("D365_CONNECTION_STRINGS must be valid JSON");
  }

  if (
    !payload.environments ||
    !Array.isArray(payload.environments) ||
    payload.environments.length === 0
  ) {
    throw new Error("D365_CONNECTION_STRINGS must contain a non-empty 'environments' array");
  }

  const environments = payload.environments.map((env) => {
    if (!env.name || !env.connectionString) {
      throw new Error(
        "Each D365_CONNECTION_STRINGS environment must contain 'name' and 'connectionString'",
      );
    }

    const parsed = parseConnectionString(env.connectionString);
    return { ...parsed, name: env.name };
  });

  return {
    environments,
    defaultEnvironment: payload.defaultEnvironment || environments[0].name,
  };
}

function loadFromJsonFile(filePath: string): AppConfig {
  const content = readFileSync(filePath, "utf-8");
  const json = JSON.parse(content);

  if (!json.environments || !Array.isArray(json.environments)) {
    throw new Error("Config file must contain an 'environments' array");
  }

  const environments: EnvironmentConfig[] = json.environments.map((env: Record<string, string>) => {
    if (!env.name || !env.url || !env.tenantId) {
      throw new Error(
        `Environment '${env.name || "unknown"}' is missing required fields (name, url, tenantId)`,
      );
    }

    const authType = env.authType === "deviceCode" ? "deviceCode" : "clientSecret";
    if (authType === "clientSecret" && (!env.clientId || !env.clientSecret)) {
      throw new Error(
        `Environment '${env.name}' uses clientSecret auth and must include clientId and clientSecret`,
      );
    }

    return {
      name: env.name,
      url: env.url.replace(/\/$/, ""),
      tenantId: env.tenantId,
      authType,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    };
  });

  return {
    environments,
    defaultEnvironment: json.defaultEnvironment || environments[0].name,
  };
}

export function loadConfig(): AppConfig {
  // Priority 1: JSON config file
  const configPath = process.env.D365_MCP_CONFIG;
  if (configPath) {
    const resolved = resolve(configPath.replace(/^~/, homedir()));
    return loadFromJsonFile(resolved);
  }

  // Priority 2: Default config file location
  const defaultPath = resolve(homedir(), ".dynamics-365-mcp", "config.json");
  try {
    return loadFromJsonFile(defaultPath);
  } catch {
    // File doesn't exist or is invalid — continue to other sources
  }

  // Priority 3: Multiple connection strings
  const fromConnectionStringsEnv = loadFromConnectionStringsEnv();
  if (fromConnectionStringsEnv) {
    return fromConnectionStringsEnv;
  }

  // Priority 4: Connection string
  const connStr = process.env.D365_CONNECTION_STRING;
  if (connStr) {
    const env = parseConnectionString(connStr);
    return { environments: [env], defaultEnvironment: "default" };
  }

  throw new Error(
    `No Dynamics 365 configuration found. Set D365_MCP_CONFIG, D365_CONNECTION_STRINGS, or D365_CONNECTION_STRING. See ${CONFIG_HELP_DOC} for setup examples.`,
  );
}

export function getEnvironment(config: AppConfig, name?: string): EnvironmentConfig {
  const envName = name || config.defaultEnvironment;
  const env = config.environments.find((e) => e.name === envName);
  if (!env) {
    throw new EnvironmentNotFoundError(
      envName,
      config.environments.map((environment) => environment.name),
    );
  }
  return env;
}
