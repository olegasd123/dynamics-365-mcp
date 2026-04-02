import type { EnvironmentConfig } from "../config/types.js";
import { TokenManager } from "../auth/token-manager.js";

export class DynamicsApiError extends Error {
  constructor(
    public readonly environment: string,
    public readonly statusCode: number,
    public readonly odataErrorCode: string | undefined,
    message: string
  ) {
    super(`Dynamics API error [${environment}] (${statusCode}): ${message}`);
    this.name = "DynamicsApiError";
  }
}

interface ODataResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

interface RequestOptions {
  timeout?: number;
  maxPages?: number;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_PAGES = 10;
const MAX_RETRIES = 3;

export class DynamicsClient {
  private tokenManager: TokenManager;

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  private async makeRequest(
    env: EnvironmentConfig,
    url: string,
    timeout: number
  ): Promise<Response> {
    const token = await this.tokenManager.getToken(env);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
          Prefer: 'odata.include-annotations="*"',
        },
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestWithRetry(
    env: EnvironmentConfig,
    url: string,
    timeout: number
  ): Promise<Response> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await this.makeRequest(env, url, timeout);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      return response;
    }

    throw new DynamicsApiError(env.name, 429, undefined, "Rate limit exceeded after retries");
  }

  async query<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    entitySet: string,
    queryParams?: string,
    options?: RequestOptions
  ): Promise<T[]> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;

    const baseUrl = `${env.url}/api/data/v9.2/${entitySet}`;
    let url = queryParams ? `${baseUrl}?${queryParams}` : baseUrl;

    const allResults: T[] = [];
    let pageCount = 0;

    while (url && pageCount < maxPages) {
      const response = await this.requestWithRetry(env, url, timeout);

      if (!response.ok) {
        const body = await response.text();
        let odataCode: string | undefined;
        let message = body;

        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            odataCode = parsed.error.code;
            message = parsed.error.message;
          }
        } catch {
          // Use raw body as message
        }

        throw new DynamicsApiError(env.name, response.status, odataCode, message);
      }

      const data = (await response.json()) as ODataResponse<T>;
      allResults.push(...data.value);

      url = data["@odata.nextLink"] ?? "";
      pageCount++;
    }

    return allResults;
  }

  async querySingle<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    entitySet: string,
    id: string,
    queryParams?: string
  ): Promise<T | null> {
    const timeout = DEFAULT_TIMEOUT;
    const baseUrl = `${env.url}/api/data/v9.2/${entitySet}(${id})`;
    const url = queryParams ? `${baseUrl}?${queryParams}` : baseUrl;

    const response = await this.requestWithRetry(env, url, timeout);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      let odataCode: string | undefined;
      let message = body;

      try {
        const parsed = JSON.parse(body);
        if (parsed.error) {
          odataCode = parsed.error.code;
          message = parsed.error.message;
        }
      } catch {
        // Use raw body as message
      }

      throw new DynamicsApiError(env.name, response.status, odataCode, message);
    }

    return (await response.json()) as T;
  }
}
