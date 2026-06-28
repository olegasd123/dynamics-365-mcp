import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  type AuthType,
  type ClientSecretSource,
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
  clientSecretSource?: string;
  clientSecretName?: string;
  clientSecretEnv?: string;
  clientSecretKeychainService?: string;
  certificatePath?: string;
  certificateStore?: string;
  certificateStoreThumbprint?: string;
  clientCertificateThumbprint?: string;
  privateKeySource?: string;
  privateKeyName?: string;
  privateKeyKeychainService?: string;
  privateKeyPath?: string;
  privateKeyPassphrase?: string;
  redirectUri?: string;
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
  const clientSecretSource = parts.get("clientsecretsource");
  const clientSecretName = parts.get("clientsecretname");
  const clientSecretEnv =
    parts.get("clientsecretenv") || parts.get("clientsecretenvironmentvariable");
  const clientSecretKeychainService = parts.get("clientsecretkeychainservice");
  const certificatePath = parts.get("certificatepath") || parts.get("clientcertificatepath");
  const certificateStore = parts.get("certificatestore");
  const certificateStoreThumbprint = parts.get("certificatestorethumbprint");
  const clientCertificateThumbprint =
    parts.get("clientcertificatethumbprint") || parts.get("certificatethumbprint");
  const privateKeySource = parts.get("privatekeysource");
  const privateKeyName = parts.get("privatekeyname");
  const privateKeyKeychainService = parts.get("privatekeykeychainservice");
  const privateKeyPath = parts.get("privatekeypath");
  const privateKeyPassphrase = parts.get("privatekeypassphrase");
  const tenantId = parts.get("tenantid");
  const redirectUri = parts.get("redirecturi");

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

  if (authTypeValue === "interactivebrowser" || authTypeValue === "pkce") {
    if (!clientId) {
      throw new Error("Interactive browser auth requires ClientId, Url, and TenantId");
    }

    return {
      name: "default",
      url: url.replace(/\/$/, ""),
      apiVersion: DEFAULT_DYNAMICS_API_VERSION,
      tenantId,
      authType: "interactiveBrowser",
      clientId,
      redirectUri,
    };
  }

  if (authTypeValue === "clientcertificate" || authTypeValue === "certificate") {
    validateClientCertificateConfig("default", {
      clientId,
      certificatePath,
      certificateStore,
      certificateStoreThumbprint,
      clientCertificateThumbprint,
      privateKeySource,
      privateKeyName,
      privateKeyPath,
    });

    const parsed: EnvironmentConfig = {
      name: "default",
      url: url.replace(/\/$/, ""),
      apiVersion: DEFAULT_DYNAMICS_API_VERSION,
      tenantId,
      authType: "clientCertificate",
      clientId,
      certificatePath,
      certificateStore: normalizeCertificateStore(certificateStore),
      certificateStoreThumbprint,
      clientCertificateThumbprint,
    };

    if (!parsed.certificateStore) {
      parsed.privateKeySource = normalizePrivateKeySource(privateKeySource, privateKeyName);
      parsed.privateKeyName = privateKeyName;
      parsed.privateKeyKeychainService = privateKeyKeychainService;
      parsed.privateKeyPath = privateKeyPath;
      parsed.privateKeyPassphrase = privateKeyPassphrase;
    }

    return parsed;
  }

  const clientSecretConfig = {
    clientId,
    clientSecret,
    clientSecretSource,
    clientSecretName,
    clientSecretEnv,
  };
  validateClientSecretConfig("default", clientSecretConfig);

  const parsed: EnvironmentConfig = {
    name: "default",
    url: url.replace(/\/$/, ""),
    apiVersion: DEFAULT_DYNAMICS_API_VERSION,
    tenantId,
    authType: "clientSecret",
    clientId,
  };
  applyClientSecretConfig(parsed, {
    ...clientSecretConfig,
    clientSecretKeychainService,
  });

  return parsed;
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

    const authType = normalizeAuthType(env.authType);
    if (authType === "clientSecret") {
      validateClientSecretConfig(env.name, env);
    }
    if (authType === "clientCertificate") {
      validateClientCertificateConfig(env.name, env);
    }
    if (authType === "interactiveBrowser" && !env.clientId) {
      throw new Error(
        `Environment '${env.name}' uses interactiveBrowser auth and must include clientId`,
      );
    }

    const normalized: EnvironmentConfig = {
      name: env.name,
      url: env.url.replace(/\/$/, ""),
      apiVersion: env.apiVersion || DEFAULT_DYNAMICS_API_VERSION,
      tenantId: env.tenantId,
      authType,
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      redirectUri: env.redirectUri,
    };

    if (authType === "clientSecret") {
      applyClientSecretConfig(normalized, env);
    }

    if (authType === "clientCertificate") {
      normalized.certificatePath = env.certificatePath;
      normalized.certificateStore = normalizeCertificateStore(env.certificateStore);
      normalized.certificateStoreThumbprint = env.certificateStoreThumbprint;
      normalized.clientCertificateThumbprint = env.clientCertificateThumbprint;
      if (!normalized.certificateStore) {
        normalized.privateKeySource = normalizePrivateKeySource(
          env.privateKeySource,
          env.privateKeyName,
        );
        normalized.privateKeyName = env.privateKeyName;
        normalized.privateKeyKeychainService = env.privateKeyKeychainService;
        normalized.privateKeyPath = env.privateKeyPath;
        normalized.privateKeyPassphrase = env.privateKeyPassphrase;
      }
    }

    return normalized;
  });

  return {
    environments,
    defaultEnvironment: json.defaultEnvironment || environments[0].name,
    advancedQueries: normalizeAdvancedQueriesConfig(json.advancedQueries),
  };
}

function normalizeAuthType(authType: string | undefined): AuthType {
  if (authType === "deviceCode") {
    return "deviceCode";
  }

  if (authType === "interactiveBrowser" || authType === "pkce") {
    return "interactiveBrowser";
  }

  if (authType === "clientCertificate" || authType === "certificate") {
    return "clientCertificate";
  }

  return "clientSecret";
}

function validateClientSecretConfig(
  name: string,
  env: {
    clientId?: string;
    clientSecret?: string;
    clientSecretSource?: string;
    clientSecretName?: string;
    clientSecretEnv?: string;
  },
): void {
  if (!env.clientId) {
    throw new Error(`Environment '${name}' uses clientSecret auth and must include clientId`);
  }

  const source = normalizeClientSecretSource(env.clientSecretSource, env);
  if (source === "inline") {
    if (!env.clientSecret) {
      throw new Error(
        `Environment '${name}' uses clientSecret auth with inline clientSecretSource and must include clientSecret`,
      );
    }
    return;
  }

  if (source === "env") {
    if (!env.clientSecretEnv) {
      throw new Error(
        `Environment '${name}' uses clientSecret auth with env clientSecretSource and must include clientSecretEnv`,
      );
    }
    return;
  }

  if (!env.clientSecretName) {
    throw new Error(
      `Environment '${name}' uses clientSecret auth with osKeychain clientSecretSource and must include clientSecretName`,
    );
  }
}

function applyClientSecretConfig(
  target: EnvironmentConfig,
  env: {
    clientSecret?: string;
    clientSecretSource?: string;
    clientSecretName?: string;
    clientSecretEnv?: string;
    clientSecretKeychainService?: string;
  },
): void {
  const source = normalizeClientSecretSource(env.clientSecretSource, env);

  if (source === "inline") {
    target.clientSecret = env.clientSecret;
    if (env.clientSecretSource) {
      target.clientSecretSource = source;
    }
    return;
  }

  target.clientSecretSource = source;
  if (source === "env") {
    target.clientSecretEnv = env.clientSecretEnv;
    return;
  }

  target.clientSecretName = env.clientSecretName;
  target.clientSecretKeychainService = env.clientSecretKeychainService;
}

function normalizeClientSecretSource(
  source: string | undefined,
  env: {
    clientSecret?: string;
    clientSecretName?: string;
    clientSecretEnv?: string;
  },
): ClientSecretSource {
  const normalizedSource = source?.toLowerCase();

  if (normalizedSource === "inline") {
    return "inline";
  }

  if (
    normalizedSource === "env" ||
    normalizedSource === "environment" ||
    normalizedSource === "environmentvariable"
  ) {
    return "env";
  }

  if (normalizedSource === "oskeychain" || normalizedSource === "keychain") {
    return "osKeychain";
  }

  if (source) {
    throw new Error(`Unsupported clientSecretSource '${source}'. Use inline, env, or osKeychain.`);
  }

  if (env.clientSecretName) {
    return "osKeychain";
  }

  if (env.clientSecretEnv) {
    return "env";
  }

  return "inline";
}

function validateClientCertificateConfig(
  name: string,
  env: {
    clientId?: string;
    certificatePath?: string;
    certificateStore?: string;
    certificateStoreThumbprint?: string;
    clientCertificateThumbprint?: string;
    privateKeySource?: string;
    privateKeyName?: string;
    privateKeyPath?: string;
  },
): void {
  if (!env.clientId) {
    throw new Error(`Environment '${name}' uses clientCertificate auth and must include clientId`);
  }

  const certificateStore = normalizeCertificateStore(env.certificateStore);
  if (certificateStore) {
    if (!env.certificateStoreThumbprint) {
      throw new Error(
        `Environment '${name}' uses clientCertificate auth with certificateStore and must include certificateStoreThumbprint`,
      );
    }
    return;
  }

  if (!env.certificatePath && !env.clientCertificateThumbprint) {
    throw new Error(
      `Environment '${name}' uses clientCertificate auth and must include certificatePath or clientCertificateThumbprint`,
    );
  }

  const privateKeySource = normalizePrivateKeySource(env.privateKeySource, env.privateKeyName);
  if (privateKeySource === "osKeychain") {
    if (!env.privateKeyName) {
      throw new Error(
        `Environment '${name}' uses clientCertificate auth with osKeychain and must include privateKeyName`,
      );
    }
    return;
  }

  if (!env.privateKeyPath) {
    throw new Error(
      `Environment '${name}' uses clientCertificate auth with file private key source and must include privateKeyPath`,
    );
  }
}

function normalizePrivateKeySource(
  source: string | undefined,
  privateKeyName?: string,
): EnvironmentConfig["privateKeySource"] {
  if (source === "osKeychain" || source === "keychain") {
    return "osKeychain";
  }

  if (source === "file") {
    return "file";
  }

  return privateKeyName ? "osKeychain" : "file";
}

function normalizeCertificateStore(
  store: string | undefined,
): EnvironmentConfig["certificateStore"] {
  if (store === "windowsCurrentUser" || store === "CurrentUser") {
    return "windowsCurrentUser";
  }

  if (store === "windowsLocalMachine" || store === "LocalMachine") {
    return "windowsLocalMachine";
  }

  if (store) {
    throw new Error(
      `Unsupported certificateStore '${store}'. Use windowsCurrentUser or windowsLocalMachine.`,
    );
  }

  return undefined;
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
