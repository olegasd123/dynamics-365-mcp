import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { EnvironmentConfig } from "../config/types.js";
import { requestLogger } from "../logging/request-logger.js";
import {
  createOsKeychainSecretStore,
  type DeviceCodeSecretStore,
  type StoredDeviceCodeToken,
} from "./os-keychain.js";

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

interface TokenRequestOptions {
  forceRefresh?: boolean;
}

const DEFAULT_DEVICE_CODE_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const DEFAULT_INTERACTIVE_BROWSER_REDIRECT_URI = "http://localhost:8400/callback";
const EXPIRY_BUFFER_SECONDS = 300;
const DEFAULT_INTERACTIVE_BROWSER_TIMEOUT_MS = 5 * 60 * 1000;

interface TokenManagerOptions {
  secretStore?: DeviceCodeSecretStore;
  openBrowser?: (url: string) => Promise<void> | void;
  interactiveBrowserTimeoutMs?: number;
}

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
  private persistedDeviceCodeTokens = new Map<string, StoredDeviceCodeToken>();
  private loadedPersistedDeviceCodeEnvironments = new Set<string>();
  private readonly secretStore: DeviceCodeSecretStore;
  private readonly openBrowser: (url: string) => Promise<void> | void;
  private readonly interactiveBrowserTimeoutMs: number;

  constructor(options: TokenManagerOptions = {}) {
    this.secretStore = options.secretStore || createOsKeychainSecretStore();
    this.openBrowser = options.openBrowser || openSystemBrowser;
    this.interactiveBrowserTimeoutMs =
      options.interactiveBrowserTimeoutMs || DEFAULT_INTERACTIVE_BROWSER_TIMEOUT_MS;
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
    storageType: "osKeychain";
    storageProvider: string;
    storageServiceName: string;
    storageAvailable: boolean;
    storageLastError?: string;
    inMemoryEnvironments: string[];
    persistedDeviceCodeEnvironments: string[];
    pendingEnvironmentCount: number;
  } {
    const storage = this.secretStore.getHealthSnapshot();

    return {
      storageType: storage.storageType,
      storageProvider: storage.provider,
      storageServiceName: storage.serviceName,
      storageAvailable: storage.available,
      storageLastError: storage.lastError,
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

    if (env.authType === "interactiveBrowser") {
      return this.requestInteractiveBrowserFlow(env, options);
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
    const persisted = await this.getPersistedInteractiveToken(env, "deviceCode");
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
          await this.updatePersistedDeviceCodeToken(env, {
            authType: "deviceCode",
            accessToken: undefined,
            accessTokenExpiresAt: undefined,
            refreshToken: undefined,
            clearRefreshToken: true,
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
    const clientId = this.getPublicClientId(env);
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

  private async requestInteractiveBrowserFlow(
    env: EnvironmentConfig,
    options?: TokenRequestOptions,
  ): Promise<string> {
    const persisted = await this.getPersistedInteractiveToken(env, "interactiveBrowser");
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
          await this.updatePersistedDeviceCodeToken(env, {
            authType: "interactiveBrowser",
            accessToken: undefined,
            accessTokenExpiresAt: undefined,
            refreshToken: undefined,
            clearRefreshToken: true,
          });
        } else {
          throw error;
        }
      }
    }

    return this.requestInteractiveBrowserToken(env);
  }

  private async requestInteractiveBrowserToken(env: EnvironmentConfig): Promise<string> {
    if (!env.clientId) {
      throw new AuthenticationError(
        env.name,
        "interactiveBrowser auth requires clientId for a public Entra app",
      );
    }

    const redirectUri = this.getInteractiveBrowserRedirectUri(env);
    const state = createPkceValue();
    const codeVerifier = createPkceValue();
    const codeChallenge = createPkceChallenge(codeVerifier);
    const tenantBaseUrl = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0`;
    const scope = `${env.url}/user_impersonation offline_access openid profile`;
    const listener = await this.createAuthorizationCodeListener(env, redirectUri, state);

    try {
      const authorizeUrl = new URL(`${tenantBaseUrl}/authorize`);
      authorizeUrl.search = new URLSearchParams({
        client_id: env.clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        response_mode: "query",
        scope,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();

      process.stderr.write(
        `\n[${env.name}] Opening browser for sign-in. If it does not open, visit: ${authorizeUrl.toString()}\n\n`,
      );
      await this.openBrowser(authorizeUrl.toString());
      const authorizationCode = await listener.authorizationCode;

      const tokenData = await this.requestTokenEndpoint(
        env,
        `${tenantBaseUrl}/token`,
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: env.clientId,
          code: authorizationCode,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          scope,
        }),
      );

      return this.storeToken(env, tokenData);
    } finally {
      await listener.close();
    }
  }

  private async requestDeviceCodeToken(env: EnvironmentConfig): Promise<string> {
    const clientId = this.getPublicClientId(env);
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

  private getPublicClientId(env: EnvironmentConfig): string {
    return env.clientId || DEFAULT_DEVICE_CODE_CLIENT_ID;
  }

  private getInteractiveBrowserRedirectUri(env: EnvironmentConfig): string {
    return env.redirectUri || DEFAULT_INTERACTIVE_BROWSER_REDIRECT_URI;
  }

  private async createAuthorizationCodeListener(
    env: EnvironmentConfig,
    redirectUri: string,
    expectedState: string,
  ): Promise<{
    authorizationCode: Promise<string>;
    close: () => Promise<void>;
  }> {
    const parsedRedirectUri = this.parseLoopbackRedirectUri(env, redirectUri);
    let settleCode: ((code: string) => void) | undefined;
    let rejectCode: ((error: Error) => void) | undefined;

    const authorizationCode = new Promise<string>((resolve, reject) => {
      settleCode = resolve;
      rejectCode = reject;
    });

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url || "/", redirectUri);

      if (requestUrl.pathname !== parsedRedirectUri.pathname) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");
      const errorDescription = requestUrl.searchParams.get("error_description");
      const code = requestUrl.searchParams.get("code");

      if (state !== expectedState) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(buildBrowserCallbackHtml("Sign-in failed. You can close this tab."));
        rejectCode?.(new AuthenticationError(env.name, "Interactive browser state did not match"));
        return;
      }

      if (error) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(buildBrowserCallbackHtml("Sign-in failed. You can close this tab."));
        rejectCode?.(new AuthenticationError(env.name, errorDescription || error, error));
        return;
      }

      if (!code) {
        response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        response.end(buildBrowserCallbackHtml("Sign-in failed. You can close this tab."));
        rejectCode?.(new AuthenticationError(env.name, "Interactive browser callback missed code"));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(buildBrowserCallbackHtml("Sign-in complete. You can close this tab."));
      settleCode?.(code);
    });

    try {
      await listen(server, parsedRedirectUri);
    } catch (error) {
      throw new AuthenticationError(
        env.name,
        `Could not start interactive browser callback server at ${redirectUri}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const timeout = setTimeout(() => {
      rejectCode?.(
        new AuthenticationError(env.name, "Interactive browser sign-in timed out before callback"),
      );
    }, this.interactiveBrowserTimeoutMs);

    return {
      authorizationCode: authorizationCode.finally(() => clearTimeout(timeout)),
      close: () => closeServer(server),
    };
  }

  private parseLoopbackRedirectUri(env: EnvironmentConfig, redirectUri: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw new AuthenticationError(env.name, `Invalid redirectUri: ${redirectUri}`);
    }

    if (parsed.protocol !== "http:") {
      throw new AuthenticationError(
        env.name,
        "interactiveBrowser redirectUri must use http on localhost",
      );
    }

    if (!isLoopbackHost(parsed.hostname)) {
      throw new AuthenticationError(
        env.name,
        "interactiveBrowser redirectUri must use localhost or a loopback IP address",
      );
    }

    if (!parsed.pathname || parsed.pathname === "/") {
      throw new AuthenticationError(
        env.name,
        "interactiveBrowser redirectUri must include a callback path",
      );
    }

    return parsed;
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

  private async storeToken(env: EnvironmentConfig, data: TokenResponse): Promise<string> {
    const expiresAt = Date.now() + computeExpiresInMs(data.expires_in);
    this.cache.set(env.name, {
      accessToken: data.access_token,
      expiresAt,
    });

    if (env.authType === "deviceCode" || env.authType === "interactiveBrowser") {
      const persisted = await this.getPersistedInteractiveToken(env, env.authType);
      await this.updatePersistedDeviceCodeToken(env, {
        authType: env.authType,
        accessToken: data.access_token,
        accessTokenExpiresAt: expiresAt,
        refreshToken: data.refresh_token || persisted?.refreshToken,
      });
    }

    return data.access_token;
  }

  private async getPersistedInteractiveToken(
    env: EnvironmentConfig,
    authType: "deviceCode" | "interactiveBrowser",
  ): Promise<StoredDeviceCodeToken | undefined> {
    await this.loadPersistedDeviceCodeToken(env.name);
    const persisted = this.persistedDeviceCodeTokens.get(env.name);
    if (!persisted) {
      return undefined;
    }

    const expectedClientId = authType === "deviceCode" ? this.getPublicClientId(env) : env.clientId;
    if (!expectedClientId) {
      return undefined;
    }

    const expectedRedirectUri =
      authType === "interactiveBrowser" ? this.getInteractiveBrowserRedirectUri(env) : undefined;
    const persistedAuthType = persisted.authType || "deviceCode";
    if (
      persistedAuthType !== authType ||
      persisted.tenantId !== env.tenantId ||
      persisted.url !== env.url ||
      persisted.clientId !== expectedClientId ||
      (expectedRedirectUri && persisted.redirectUri !== expectedRedirectUri)
    ) {
      return undefined;
    }

    return persisted;
  }

  private async updatePersistedDeviceCodeToken(
    env: EnvironmentConfig,
    update: {
      authType: "deviceCode" | "interactiveBrowser";
      accessToken?: string;
      accessTokenExpiresAt?: number;
      refreshToken?: string;
      clearRefreshToken?: boolean;
    },
  ): Promise<void> {
    await this.loadPersistedDeviceCodeToken(env.name);
    const existing = this.persistedDeviceCodeTokens.get(env.name);
    const clientId = update.authType === "deviceCode" ? this.getPublicClientId(env) : env.clientId;
    if (!clientId) {
      throw new AuthenticationError(
        env.name,
        `${update.authType} auth requires clientId before tokens can be persisted`,
      );
    }

    const persisted: StoredDeviceCodeToken = {
      environmentName: env.name,
      tenantId: env.tenantId,
      url: env.url,
      clientId,
      authType: update.authType,
      redirectUri:
        update.authType === "interactiveBrowser"
          ? this.getInteractiveBrowserRedirectUri(env)
          : undefined,
      accessToken: update.accessToken,
      accessTokenExpiresAt: update.accessTokenExpiresAt,
      refreshToken: update.clearRefreshToken ? undefined : update.refreshToken,
      updatedAt: Date.now(),
    };

    if (!persisted.accessToken && !persisted.refreshToken && !existing?.refreshToken) {
      this.persistedDeviceCodeTokens.delete(env.name);
      await this.secretStore.delete(env.name);
      return;
    }

    if (!persisted.refreshToken && existing?.refreshToken && !update.clearRefreshToken) {
      persisted.refreshToken = existing.refreshToken;
    }

    this.persistedDeviceCodeTokens.set(env.name, persisted);
    await this.secretStore.save(persisted);
  }

  private async loadPersistedDeviceCodeToken(environmentName: string): Promise<void> {
    if (this.loadedPersistedDeviceCodeEnvironments.has(environmentName)) {
      return;
    }

    this.loadedPersistedDeviceCodeEnvironments.add(environmentName);
    const persisted = await this.secretStore.load(environmentName);
    if (persisted?.environmentName) {
      this.persistedDeviceCodeTokens.set(environmentName, persisted);
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

function createPkceValue(): string {
  return base64UrlEncode(randomBytes(32));
}

function createPkceChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash("sha256").update(codeVerifier).digest());
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function listen(server: Server, redirectUri: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = Number.parseInt(redirectUri.port || "80", 10);
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, redirectUri.hostname);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function buildBrowserCallbackHtml(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dynamics 365 MCP</title></head><body><h1>${message}</h1></body></html>`;
}

function openSystemBrowser(url: string): Promise<void> {
  const command = getBrowserOpenCommand(url);

  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      detached: true,
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function getBrowserOpenCommand(url: string): { command: string; args: string[] } {
  if (process.platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/c", "start", "", url] };
  }

  return { command: "xdg-open", args: [url] };
}

function isRecoverableRefreshFailure(errorCode?: string): boolean {
  return (
    errorCode === "invalid_grant" ||
    errorCode === "invalid_request" ||
    errorCode === "interaction_required"
  );
}
