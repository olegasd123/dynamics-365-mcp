import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { EnvironmentConfig } from "../config/types.js";
import { requestLogger } from "../logging/request-logger.js";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface DeviceCodeResponse {
  device_code: string;
  expires_in: number;
  interval?: number;
  message?: string;
  user_code?: string;
  verification_uri?: string;
}

interface PersistedDeviceCodeToken {
  environmentName: string;
  tenantId: string;
  url: string;
  clientId: string;
  accessToken?: string;
  accessTokenExpiresAt?: number;
  refreshToken?: string;
  updatedAt: number;
}

interface PersistedTokenStore {
  deviceCodeTokens?: PersistedDeviceCodeToken[];
}

interface TokenRequestOptions {
  forceRefresh?: boolean;
}

const DEFAULT_DEVICE_CODE_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const EXPIRY_BUFFER_SECONDS = 300;
const DEFAULT_TOKEN_CACHE_PATH = resolve(homedir(), ".dynamics365-mcp", "token-cache.json");

export class AuthenticationError extends Error {
  constructor(
    public readonly environment: string,
    message: string,
    public readonly errorCode?: string,
  ) {
    super(`Authentication failed for '${environment}': ${message}`);
    this.name = "AuthenticationError";
  }
}

export class TokenManager {
  private cache = new Map<string, CachedToken>();
  private pendingRequests = new Map<string, Promise<string>>();
  private persistedDeviceCodeTokens = new Map<string, PersistedDeviceCodeToken>();
  private persistedTokensLoaded = false;
  private readonly tokenCachePath: string;

  constructor(tokenCachePath?: string) {
    this.tokenCachePath = resolveTokenCachePath(tokenCachePath);
  }

  async getToken(env: EnvironmentConfig, options?: TokenRequestOptions): Promise<string> {
    const cached = this.cache.get(env.name);
    const now = Date.now();

    if (!options?.forceRefresh && cached && now < cached.expiresAt) {
      return cached.accessToken;
    }

    const pending = this.pendingRequests.get(env.name);
    if (pending && !options?.forceRefresh) {
      return pending;
    }

    const request = this.requestToken(env, options);
    this.pendingRequests.set(env.name, request);

    try {
      return await request;
    } finally {
      this.pendingRequests.delete(env.name);
    }
  }

  getHealthSnapshot(): {
    cachePath: string;
    inMemoryEnvironments: string[];
    persistedDeviceCodeEnvironments: string[];
    pendingEnvironmentCount: number;
  } {
    this.ensurePersistedTokensLoaded();

    return {
      cachePath: this.tokenCachePath,
      inMemoryEnvironments: [...this.cache.keys()].sort(),
      persistedDeviceCodeEnvironments: [...this.persistedDeviceCodeTokens.keys()].sort(),
      pendingEnvironmentCount: this.pendingRequests.size,
    };
  }

  clearCache(environmentName?: string): void {
    if (environmentName) {
      this.cache.delete(environmentName);
      return;
    }

    this.cache.clear();
  }

  private async requestToken(
    env: EnvironmentConfig,
    options?: TokenRequestOptions,
  ): Promise<string> {
    if (env.authType === "deviceCode") {
      return this.requestDeviceCodeFlow(env, options);
    }

    return this.requestClientSecretToken(env);
  }

  private async requestClientSecretToken(env: EnvironmentConfig): Promise<string> {
    if (!env.clientId || !env.clientSecret) {
      throw new AuthenticationError(
        env.name,
        "clientSecret auth requires clientId and clientSecret",
      );
    }

    const tokenUrl = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`;
    const scope = `${env.url}/.default`;

    const data = await this.requestTokenEndpoint(
      env,
      tokenUrl,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.clientId,
        client_secret: env.clientSecret,
        scope,
      }),
    );

    return this.storeToken(env, data);
  }

  private async requestDeviceCodeFlow(
    env: EnvironmentConfig,
    options?: TokenRequestOptions,
  ): Promise<string> {
    const persisted = this.getPersistedDeviceCodeToken(env);
    const now = Date.now();

    if (
      !options?.forceRefresh &&
      persisted?.accessToken &&
      persisted.accessTokenExpiresAt &&
      now < persisted.accessTokenExpiresAt
    ) {
      this.cache.set(env.name, {
        accessToken: persisted.accessToken,
        expiresAt: persisted.accessTokenExpiresAt,
      });
      return persisted.accessToken;
    }

    if (persisted?.refreshToken) {
      try {
        const refreshed = await this.requestRefreshToken(env, persisted.refreshToken);
        return this.storeToken(env, refreshed);
      } catch (error) {
        if (error instanceof AuthenticationError && isRecoverableRefreshFailure(error.errorCode)) {
          this.updatePersistedDeviceCodeToken(env, {
            accessToken: undefined,
            accessTokenExpiresAt: undefined,
            refreshToken: undefined,
          });
        } else {
          throw error;
        }
      }
    }

    return this.requestDeviceCodeToken(env);
  }

  private async requestRefreshToken(
    env: EnvironmentConfig,
    refreshToken: string,
  ): Promise<TokenResponse> {
    const clientId = env.clientId || DEFAULT_DEVICE_CODE_CLIENT_ID;
    const tokenUrl = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`;
    const scope = `${env.url}/user_impersonation offline_access openid profile`;

    return this.requestTokenEndpoint(
      env,
      tokenUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: refreshToken,
        scope,
      }),
    );
  }

  private async requestDeviceCodeToken(env: EnvironmentConfig): Promise<string> {
    const clientId = env.clientId || DEFAULT_DEVICE_CODE_CLIENT_ID;
    const tenantBaseUrl = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0`;
    const scope = `${env.url}/user_impersonation offline_access openid profile`;

    const deviceCodeData = await this.requestDeviceCode(env, tenantBaseUrl, clientId, scope);

    process.stderr.write(this.buildDeviceCodeMessage(env.name, deviceCodeData));

    const deadline = Date.now() + deviceCodeData.expires_in * 1000;
    let intervalSeconds = Math.max(deviceCodeData.interval ?? 5, 1);

    while (Date.now() < deadline) {
      await this.delay(intervalSeconds * 1000);
      const pollResult = await this.pollDeviceCodeToken(
        env,
        tenantBaseUrl,
        clientId,
        deviceCodeData.device_code,
      );
      if (pollResult.status === "success") {
        return this.storeToken(env, pollResult.data);
      }

      if (pollResult.status === "pending") {
        continue;
      }

      if (pollResult.status === "slowDown") {
        intervalSeconds += 5;
        continue;
      }

      throw new AuthenticationError(env.name, pollResult.message, pollResult.errorCode);
    }

    throw new AuthenticationError(env.name, "Device code expired before sign-in completed");
  }

  private async requestDeviceCode(
    env: EnvironmentConfig,
    tenantBaseUrl: string,
    clientId: string,
    scope: string,
  ): Promise<DeviceCodeResponse> {
    let response: Response;
    const callId = requestLogger.beginHttpCall({
      type: "auth",
      method: "POST",
      url: `${tenantBaseUrl}/devicecode`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: {
        client_id: clientId,
        scope,
      },
    });
    try {
      response = await fetch(`${tenantBaseUrl}/devicecode`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          scope,
        }).toString(),
      });
      requestLogger.logHttpResponse(callId, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error) {
      requestLogger.logError("auth-device-code-request", error, {
        environment: env.name,
        url: `${tenantBaseUrl}/devicecode`,
      });
      throw new AuthenticationError(
        env.name,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw await this.createAuthenticationError(env.name, response);
    }

    return (await response.json()) as DeviceCodeResponse;
  }

  private async pollDeviceCodeToken(
    env: EnvironmentConfig,
    tenantBaseUrl: string,
    clientId: string,
    deviceCode: string,
  ): Promise<
    | { status: "success"; data: TokenResponse }
    | { status: "pending" }
    | { status: "slowDown" }
    | { status: "error"; message: string; errorCode?: string }
  > {
    let response: Response;
    const callId = requestLogger.beginHttpCall({
      type: "auth",
      method: "POST",
      url: `${tenantBaseUrl}/token`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: deviceCode,
      },
    });
    try {
      response = await fetch(`${tenantBaseUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId,
          device_code: deviceCode,
        }).toString(),
      });
      requestLogger.logHttpResponse(callId, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error) {
      requestLogger.logError("auth-device-code-poll", error, {
        environment: env.name,
        url: `${tenantBaseUrl}/token`,
      });
      throw new AuthenticationError(
        env.name,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (response.ok) {
      return {
        status: "success",
        data: (await response.json()) as TokenResponse,
      };
    }

    const errorBody = this.parseAuthErrorBody(await response.text());

    if (errorBody.error === "authorization_pending") {
      return { status: "pending" };
    }

    if (errorBody.error === "slow_down") {
      return { status: "slowDown" };
    }

    return {
      status: "error",
      message: errorBody.error_description || errorBody.error || `HTTP ${response.status}`,
      errorCode: errorBody.error,
    };
  }

  private async requestTokenEndpoint(
    env: EnvironmentConfig,
    url: string,
    body: URLSearchParams,
  ): Promise<TokenResponse> {
    let response: Response;
    const callId = requestLogger.beginHttpCall({
      type: "auth",
      method: "POST",
      url,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      requestLogger.logHttpResponse(callId, {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error) {
      requestLogger.logError("auth-token-request", error, {
        environment: env.name,
        url,
      });
      throw new AuthenticationError(
        env.name,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw await this.createAuthenticationError(env.name, response);
    }

    return (await response.json()) as TokenResponse;
  }

  private async createAuthenticationError(
    environmentName: string,
    response: Response,
  ): Promise<AuthenticationError> {
    const body = await response.text();
    const parsed = this.parseAuthErrorBody(body);
    requestLogger.logError("auth-response", {
      name: "AuthenticationError",
      message: parsed.error_description || parsed.error || `HTTP ${response.status}: ${body}`,
      environment: environmentName,
      errorCode: parsed.error || null,
      statusCode: response.status,
      body,
    });
    return new AuthenticationError(
      environmentName,
      parsed.error_description || parsed.error || `HTTP ${response.status}: ${body}`,
      parsed.error,
    );
  }

  private buildDeviceCodeMessage(
    environmentName: string,
    deviceCodeData: DeviceCodeResponse,
  ): string {
    if (deviceCodeData.message) {
      return `\n[${environmentName}] ${deviceCodeData.message}\n\n`;
    }

    const verificationUrl = deviceCodeData.verification_uri || "https://microsoft.com/devicelogin";
    const userCode = deviceCodeData.user_code || "(missing code)";
    return `\n[${environmentName}] Sign in at ${verificationUrl} with code ${userCode}\n\n`;
  }

  private parseAuthErrorBody(body: string): {
    error?: string;
    error_description?: string;
  } {
    try {
      return JSON.parse(body) as { error?: string; error_description?: string };
    } catch {
      return { error: body };
    }
  }

  private storeToken(env: EnvironmentConfig, data: TokenResponse): string {
    const expiresAt = Date.now() + computeExpiresInMs(data.expires_in);
    this.cache.set(env.name, {
      accessToken: data.access_token,
      expiresAt,
    });

    if (env.authType === "deviceCode") {
      this.updatePersistedDeviceCodeToken(env, {
        accessToken: data.access_token,
        accessTokenExpiresAt: expiresAt,
        refreshToken: data.refresh_token || this.getPersistedDeviceCodeToken(env)?.refreshToken,
      });
    }

    return data.access_token;
  }

  private getPersistedDeviceCodeToken(
    env: EnvironmentConfig,
  ): PersistedDeviceCodeToken | undefined {
    this.ensurePersistedTokensLoaded();
    const persisted = this.persistedDeviceCodeTokens.get(env.name);
    if (!persisted) {
      return undefined;
    }

    const expectedClientId = env.clientId || DEFAULT_DEVICE_CODE_CLIENT_ID;
    if (
      persisted.tenantId !== env.tenantId ||
      persisted.url !== env.url ||
      persisted.clientId !== expectedClientId
    ) {
      return undefined;
    }

    return persisted;
  }

  private updatePersistedDeviceCodeToken(
    env: EnvironmentConfig,
    update: {
      accessToken?: string;
      accessTokenExpiresAt?: number;
      refreshToken?: string;
    },
  ): void {
    this.ensurePersistedTokensLoaded();
    const existing = this.getPersistedDeviceCodeToken(env);
    const persisted: PersistedDeviceCodeToken = {
      environmentName: env.name,
      tenantId: env.tenantId,
      url: env.url,
      clientId: env.clientId || DEFAULT_DEVICE_CODE_CLIENT_ID,
      accessToken: update.accessToken,
      accessTokenExpiresAt: update.accessTokenExpiresAt,
      refreshToken: update.refreshToken,
      updatedAt: Date.now(),
    };

    if (!persisted.accessToken && !persisted.refreshToken && !existing?.refreshToken) {
      this.persistedDeviceCodeTokens.delete(env.name);
      this.writePersistedTokens();
      return;
    }

    if (!persisted.refreshToken && existing?.refreshToken) {
      persisted.refreshToken = existing.refreshToken;
    }

    this.persistedDeviceCodeTokens.set(env.name, persisted);
    this.writePersistedTokens();
  }

  private ensurePersistedTokensLoaded(): void {
    if (this.persistedTokensLoaded) {
      return;
    }

    this.persistedTokensLoaded = true;
    if (!existsSync(this.tokenCachePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.tokenCachePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedTokenStore;
      for (const token of parsed.deviceCodeTokens || []) {
        if (token.environmentName) {
          this.persistedDeviceCodeTokens.set(token.environmentName, token);
        }
      }
    } catch {
      this.persistedDeviceCodeTokens.clear();
    }
  }

  private writePersistedTokens(): void {
    try {
      mkdirSync(dirname(this.tokenCachePath), { recursive: true });
      const payload: PersistedTokenStore = {
        deviceCodeTokens: [...this.persistedDeviceCodeTokens.values()].sort((left, right) =>
          left.environmentName.localeCompare(right.environmentName),
        ),
      };
      writeFileSync(this.tokenCachePath, JSON.stringify(payload, null, 2));
    } catch {
      // Persistence is best-effort. The token should still be usable in memory.
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

function computeExpiresInMs(expiresInSeconds: number): number {
  const bufferedSeconds = Math.max(expiresInSeconds - EXPIRY_BUFFER_SECONDS, 60);
  return bufferedSeconds * 1000;
}

function resolveTokenCachePath(tokenCachePath?: string): string {
  const configuredPath = tokenCachePath || process.env.D365_MCP_TOKEN_CACHE;
  return resolve((configuredPath || DEFAULT_TOKEN_CACHE_PATH).replace(/^~/, homedir()));
}

function isRecoverableRefreshFailure(errorCode?: string): boolean {
  return (
    errorCode === "invalid_grant" ||
    errorCode === "invalid_request" ||
    errorCode === "interaction_required"
  );
}
