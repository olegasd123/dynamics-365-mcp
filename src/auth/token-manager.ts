import type { EnvironmentConfig } from "../config/types.js";

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class AuthenticationError extends Error {
  constructor(
    public readonly environment: string,
    message: string
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
        `Network error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new AuthenticationError(
        env.name,
        `HTTP ${response.status}: ${text}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    // Cache with 5-minute buffer before expiry
    this.cache.set(env.name, {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    });

    return data.access_token;
  }

  clearCache(environmentName?: string): void {
    if (environmentName) {
      this.cache.delete(environmentName);
    } else {
      this.cache.clear();
    }
  }
}
