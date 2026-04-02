import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { AppConfig, EnvironmentConfig } from "./types.js";

function parseConnectionString(connStr: string): EnvironmentConfig {
  const parts = new Map<string, string>();
  for (const segment of connStr.split(";")) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) continue;
    const key = segment.slice(0, eqIndex).trim().toLowerCase();
    const value = segment.slice(eqIndex + 1).trim();
    parts.set(key, value);
  }

  const url = parts.get("url");
  const clientId = parts.get("clientid");
  const clientSecret = parts.get("clientsecret");
  const tenantId = parts.get("tenantid");

  if (!url || !clientId || !clientSecret || !tenantId) {
    throw new Error(
      "Connection string must contain Url, ClientId, ClientSecret, and TenantId"
    );
  }

  return {
    name: "default",
    url: url.replace(/\/$/, ""),
    tenantId,
    clientId,
    clientSecret,
  };
}

function loadFromJsonFile(filePath: string): AppConfig {
  const content = readFileSync(filePath, "utf-8");
  const json = JSON.parse(content);

  if (!json.environments || !Array.isArray(json.environments)) {
    throw new Error("Config file must contain an 'environments' array");
  }

  const environments: EnvironmentConfig[] = json.environments.map(
    (env: Record<string, string>) => {
      if (!env.name || !env.url || !env.tenantId || !env.clientId || !env.clientSecret) {
        throw new Error(
          `Environment '${env.name || "unknown"}' is missing required fields (name, url, tenantId, clientId, clientSecret)`
        );
      }
      return {
        name: env.name,
        url: env.url.replace(/\/$/, ""),
        tenantId: env.tenantId,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
      };
    }
  );

  return {
    environments,
    defaultEnvironment: json.defaultEnvironment || environments[0].name,
  };
}

function loadFromEnvVars(): AppConfig | null {
  const url = process.env.D365_URL;
  const tenantId = process.env.D365_TENANT_ID;
  const clientId = process.env.D365_CLIENT_ID;
  const clientSecret = process.env.D365_CLIENT_SECRET;

  if (!url || !tenantId || !clientId || !clientSecret) {
    return null;
  }

  const env: EnvironmentConfig = {
    name: "default",
    url: url.replace(/\/$/, ""),
    tenantId,
    clientId,
    clientSecret,
  };

  return { environments: [env], defaultEnvironment: "default" };
}

export function loadConfig(): AppConfig {
  // Priority 1: JSON config file
  const configPath = process.env.D365_MCP_CONFIG;
  if (configPath) {
    const resolved = resolve(configPath.replace(/^~/, homedir()));
    return loadFromJsonFile(resolved);
  }

  // Priority 2: Default config file location
  const defaultPath = resolve(homedir(), ".dynamics365-mcp", "config.json");
  try {
    return loadFromJsonFile(defaultPath);
  } catch {
    // File doesn't exist or is invalid — continue to other sources
  }

  // Priority 3: Connection string
  const connStr = process.env.D365_CONNECTION_STRING;
  if (connStr) {
    const env = parseConnectionString(connStr);
    return { environments: [env], defaultEnvironment: "default" };
  }

  // Priority 4: Individual env vars
  const fromEnv = loadFromEnvVars();
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error(
    "No Dynamics 365 configuration found. Set D365_MCP_CONFIG, D365_CONNECTION_STRING, or individual D365_* env vars. See .env.example for details."
  );
}

export function getEnvironment(
  config: AppConfig,
  name?: string
): EnvironmentConfig {
  const envName = name || config.defaultEnvironment;
  const env = config.environments.find((e) => e.name === envName);
  if (!env) {
    const available = config.environments.map((e) => e.name).join(", ");
    throw new Error(
      `Environment '${envName}' not found. Available: ${available}`
    );
  }
  return env;
}
