import type { EnvironmentConfig } from "../config/types.js";
import type { TokenManager } from "../auth/token-manager.js";

export class DynamicsApiError extends Error {
  constructor(
    public readonly environment: string,
    public readonly statusCode: number,
    public readonly odataErrorCode: string | undefined,
    message: string,
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
  cacheTtlMs?: number;
  bypassCache?: boolean;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_CACHE_TTL = 15_000;
const MAX_CACHE_ENTRIES = 500;
const MAX_RETRIES = 3;

export class DynamicsClient {
  private tokenManager: TokenManager;
  private readonly responseCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly pendingRequests = new Map<string, Promise<unknown>>();

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  private buildUrl(env: EnvironmentConfig, resourcePath: string, queryParams?: string): string {
    const baseUrl = `${env.url}/api/data/v9.2/${resourcePath}`;
    return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
  }

  private async makeRequest(
    env: EnvironmentConfig,
    url: string,
    timeout: number,
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
    timeout: number,
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
    options?: RequestOptions,
  ): Promise<T[]> {
    return this.queryPath(env, entitySet, queryParams, options);
  }

  async queryPath<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
    options?: RequestOptions,
  ): Promise<T[]> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
    const cacheKey = this.buildCacheKey(env, resourcePath, queryParams, `pages=${maxPages}`);

    return this.loadCached(
      cacheKey,
      options,
      async () => {
        let url = this.buildUrl(env, resourcePath, queryParams);

        const allResults: T[] = [];
        let pageCount = 0;

        while (url && pageCount < maxPages) {
          const response = await this.requestWithRetry(env, url, timeout);

          if (!response.ok) {
            await this.throwApiError(env, response);
          }

          const data = (await response.json()) as ODataResponse<T>;
          allResults.push(...data.value);

          url = data["@odata.nextLink"] ?? "";
          pageCount++;
        }

        return allResults;
      },
      options?.cacheTtlMs ?? DEFAULT_CACHE_TTL,
    );
  }

  async querySingle<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    entitySet: string,
    id: string,
    queryParams?: string,
  ): Promise<T | null> {
    return this.getPath(env, `${entitySet}(${id})`, queryParams);
  }

  async getPath<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
  ): Promise<T | null> {
    const timeout = DEFAULT_TIMEOUT;
    const cacheKey = this.buildCacheKey(env, resourcePath, queryParams, "single");

    return this.loadCached(
      cacheKey,
      undefined,
      async () => {
        const url = this.buildUrl(env, resourcePath, queryParams);
        const response = await this.requestWithRetry(env, url, timeout);

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          await this.throwApiError(env, response);
        }

        return (await response.json()) as T;
      },
      DEFAULT_CACHE_TTL,
    );
  }

  clearCache(environmentName?: string): void {
    if (!environmentName) {
      this.responseCache.clear();
      this.pendingRequests.clear();
      return;
    }

    for (const key of this.responseCache.keys()) {
      if (key.startsWith(`${environmentName}|`)) {
        this.responseCache.delete(key);
      }
    }

    for (const key of this.pendingRequests.keys()) {
      if (key.startsWith(`${environmentName}|`)) {
        this.pendingRequests.delete(key);
      }
    }
  }

  private async throwApiError(env: EnvironmentConfig, response: Response): Promise<never> {
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

  private async loadCached<T>(
    cacheKey: string,
    options: RequestOptions | undefined,
    loader: () => Promise<T>,
    cacheTtlMs: number,
  ): Promise<T> {
    if (options?.bypassCache || cacheTtlMs <= 0) {
      return loader();
    }

    this.deleteExpiredEntries();

    const cached = this.responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.cloneValue(cached.value as T);
    }

    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return this.cloneValue((await pending) as T);
    }

    const request = loader()
      .then((result) => {
        this.responseCache.set(cacheKey, {
          expiresAt: Date.now() + cacheTtlMs,
          value: this.cloneValue(result),
        });
        this.enforceCacheLimit();
        return result;
      })
      .finally(() => {
        this.pendingRequests.delete(cacheKey);
      });

    this.pendingRequests.set(cacheKey, request);
    return this.cloneValue(await request);
  }

  private buildCacheKey(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
    extraKey?: string,
  ): string {
    return [env.name, resourcePath, queryParams || "", extraKey || ""].join("|");
  }

  private deleteExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.responseCache.entries()) {
      if (entry.expiresAt <= now) {
        this.responseCache.delete(key);
      }
    }
  }

  private enforceCacheLimit(): void {
    if (this.responseCache.size <= MAX_CACHE_ENTRIES) {
      return;
    }

    const entries = [...this.responseCache.entries()].sort(
      (left, right) => left[1].expiresAt - right[1].expiresAt,
    );

    for (const [key] of entries.slice(0, this.responseCache.size - MAX_CACHE_ENTRIES)) {
      this.responseCache.delete(key);
    }
  }

  private cloneValue<T>(value: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as T;
  }
}
