import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  DEFAULT_DYNAMICS_API_VERSION,
  type AdvancedQueriesConfig,
  type AppConfig,
  type EnvironmentConfig,
} from "./types.js";

interface ConnectionStringEnvironmentEntry {
  name?: string;
  connectionString?: string;
}

interface EnvironmentJsonEntry {
  name?: string;
  url?: string;
  apiVersion?: string;
  tenantId?: string;
  authType?: string;
  clientId?: string;
  clientSecret?: string;
}

interface ConnectionStringsEnvPayload {
  environments?: ConnectionStringEnvironmentEntry[];
  defaultEnvironment?: string;
}

const DEFAULT_FETCHXML_LIMIT = 50;
const MAX_FETCHXML_LIMIT = 200;
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
      apiVersion: DEFAULT_DYNAMICS_API_VERSION,
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
    apiVersion: DEFAULT_DYNAMICS_API_VERSION,
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

  const environments: EnvironmentConfig[] = json.environments.map((env: EnvironmentJsonEntry) => {
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
      apiVersion: env.apiVersion || DEFAULT_DYNAMICS_API_VERSION,
      tenantId: env.tenantId,
      authType,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
    };
  });

  return {
    environments,
    defaultEnvironment: json.defaultEnvironment || environments[0].name,
    advancedQueries: normalizeAdvancedQueriesConfig(json.advancedQueries),
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

function normalizeAdvancedQueriesConfig(raw: unknown): AdvancedQueriesConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("advancedQueries must be an object when provided.");
  }

  const fetchXml = normalizeFetchXmlConfig((raw as { fetchXml?: unknown }).fetchXml);
  if (!fetchXml) {
    return undefined;
  }

  return { fetchXml };
}

function normalizeFetchXmlConfig(raw: unknown): AdvancedQueriesConfig["fetchXml"] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("advancedQueries.fetchXml must be an object when provided.");
  }

  const value = raw as {
    enabled?: unknown;
    allowedEnvironments?: unknown;
    defaultLimit?: unknown;
    maxLimit?: unknown;
  };
  const enabled =
    value.enabled === undefined
      ? undefined
      : requireBoolean(value.enabled, "advancedQueries.fetchXml.enabled");
  const allowedEnvironments =
    value.allowedEnvironments === undefined
      ? undefined
      : requireStringArray(
          value.allowedEnvironments,
          "advancedQueries.fetchXml.allowedEnvironments",
        );
  const defaultLimit =
    value.defaultLimit === undefined
      ? undefined
      : requirePositiveIntegerInRange(
          value.defaultLimit,
          "advancedQueries.fetchXml.defaultLimit",
          1,
          MAX_FETCHXML_LIMIT,
        );
  const maxLimit =
    value.maxLimit === undefined
      ? undefined
      : requirePositiveIntegerInRange(
          value.maxLimit,
          "advancedQueries.fetchXml.maxLimit",
          1,
          MAX_FETCHXML_LIMIT,
        );

  const resolvedMaxLimit = maxLimit ?? MAX_FETCHXML_LIMIT;
  const resolvedDefaultLimit = defaultLimit ?? DEFAULT_FETCHXML_LIMIT;
  if (resolvedDefaultLimit > resolvedMaxLimit) {
    throw new Error(
      "advancedQueries.fetchXml.defaultLimit cannot be greater than advancedQueries.fetchXml.maxLimit.",
    );
  }

  return {
    enabled,
    allowedEnvironments,
    defaultLimit,
    maxLimit,
  };
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }

  return value.map((item) => item.trim());
}

function requirePositiveIntegerInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  }

  return value;
}
