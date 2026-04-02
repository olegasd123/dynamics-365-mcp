import type { EnvironmentConfig } from "../config/types.js";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface DeviceCodeResponse {
  device_code: string;
  expires_in: number;
  interval?: number;
  message?: string;
  user_code?: string;
  verification_uri?: string;
}

const DEFAULT_DEVICE_CODE_CLIENT_ID = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";
const EXPIRY_BUFFER_SECONDS = 300;

export class AuthenticationError extends Error {
  constructor(
    public readonly environment: string,
    message: string,
  ) {
    super(`Authentication failed for '${environment}': ${message}`);
    this.name = "AuthenticationError";
  }
}

export class TokenManager {
  private cache = new Map<string, CachedToken>();
  private pendingRequests = new Map<string, Promise<string>>();

  async getToken(env: EnvironmentConfig): Promise<string> {
    const cached = this.cache.get(env.name);
    const now = Date.now();

    if (cached && now < cached.expiresAt) {
      return cached.accessToken;
    }

    // Deduplicate concurrent token requests for the same environment
    const pending = this.pendingRequests.get(env.name);
    if (pending) {
      return pending;
    }

    const request = this.requestToken(env);
    this.pendingRequests.set(env.name, request);

    try {
      return await request;
    } finally {
      this.pendingRequests.delete(env.name);
    }
  }

  private async requestToken(env: EnvironmentConfig): Promise<string> {
    if (env.authType === "deviceCode") {
      return this.requestDeviceCodeToken(env);
    }

    return this.requestClientSecretToken(env);
  }

  private async requestClientSecretToken(env: EnvironmentConfig): Promise<string> {
    if (!env.clientId || !env.clientSecret) {
      throw new AuthenticationError(env.name, "clientSecret auth requires clientId and clientSecret");
    }

    const tokenUrl = `https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`;
    const scope = `${env.url}/.default`;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope,
    });

    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (error) {
      throw new AuthenticationError(
        env.name,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AuthenticationError(env.name, `HTTP ${response.status}: ${text}`);
    }

    const data = (await response.json()) as TokenResponse;

    return this.storeToken(env.name, data);
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
      const pollResult = await this.pollDeviceCodeToken(env, tenantBaseUrl, clientId, deviceCodeData.device_code);
      if (pollResult.status === "success") {
        return this.storeToken(env.name, pollResult.data);
      }

      if (pollResult.status === "pending") {
        continue;
      }

      if (pollResult.status === "slowDown") {
        intervalSeconds += 5;
        continue;
      }

      throw new AuthenticationError(env.name, pollResult.message);
    }

    throw new AuthenticationError(env.name, "Device code expired before sign-in completed");
  }

  private async requestDeviceCode(
    env: EnvironmentConfig,
    tenantBaseUrl: string,
    clientId: string,
    scope: string,
  ): Promise<DeviceCodeResponse> {
    const body = new URLSearchParams({
      client_id: clientId,
      scope,
    });

    let response: Response;
    try {
      response = await fetch(`${tenantBaseUrl}/devicecode`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (error) {
      throw new AuthenticationError(
        env.name,
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AuthenticationError(env.name, `HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as DeviceCodeResponse;
  }

  private async pollDeviceCodeToken(
    env: EnvironmentConfig,
    tenantBaseUrl: string,
    clientId: string,
    deviceCode: string,
  ):
    Promise<
      | { status: "success"; data: TokenResponse }
      | { status: "pending" }
      | { status: "slowDown" }
      | { status: "error"; message: string }
    > {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: clientId,
      device_code: deviceCode,
    });

    let response: Response;
    try {
      response = await fetch(`${tenantBaseUrl}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (error) {
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

    const errorText = await response.text();
    const errorBody = this.parseDeviceCodeError(errorText) as {
      error?: string;
      error_description?: string;
    };

    if (errorBody.error === "authorization_pending") {
      return { status: "pending" };
    }

    if (errorBody.error === "slow_down") {
      return { status: "slowDown" };
    }

    return {
      status: "error",
      message: errorBody.error_description || errorBody.error || `HTTP ${response.status}`,
    };
  }

  private buildDeviceCodeMessage(environmentName: string, deviceCodeData: DeviceCodeResponse): string {
    if (deviceCodeData.message) {
      return `\n[${environmentName}] ${deviceCodeData.message}\n\n`;
    }

    const verificationUrl = deviceCodeData.verification_uri || "https://microsoft.com/devicelogin";
    const userCode = deviceCodeData.user_code || "(missing code)";
    return `\n[${environmentName}] Sign in at ${verificationUrl} with code ${userCode}\n\n`;
  }

  private parseDeviceCodeError(body: string): { error?: string; error_description?: string } {
    try {
      return JSON.parse(body) as { error?: string; error_description?: string };
    } catch {
      return { error: body };
    }
  }

  private storeToken(environmentName: string, data: TokenResponse): string {
    const expiresInSeconds = Math.max(data.expires_in - EXPIRY_BUFFER_SECONDS, 60);
    this.cache.set(environmentName, {
      accessToken: data.access_token,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });

    return data.access_token;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  clearCache(environmentName?: string): void {
    if (environmentName) {
      this.cache.delete(environmentName);
    } else {
      this.cache.clear();
    }
  }
}
