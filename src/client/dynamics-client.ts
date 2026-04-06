import type { EnvironmentConfig } from "../config/types.js";
import type { TokenManager } from "../auth/token-manager.js";
import { requestLogger } from "../logging/request-logger.js";

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

export class DynamicsRequestError extends Error {
  constructor(
    public readonly environment: string,
    public readonly kind: "timeout" | "network",
    message: string,
  ) {
    super(`Dynamics request ${kind} [${environment}]: ${message}`);
    this.name = "DynamicsRequestError";
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
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export class DynamicsClient {
  private tokenManager: TokenManager;
  private readonly responseCache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly pendingRequests = new Map<string, Promise<unknown>>();

  constructor(tokenManager: TokenManager) {
    this.tokenManager = tokenManager;
  }

  getHealthSnapshot(): {
    responseCacheEntries: number;
    pendingRequestCount: number;
  } {
    this.deleteExpiredEntries();
    return {
      responseCacheEntries: this.responseCache.size,
      pendingRequestCount: this.pendingRequests.size,
    };
  }

  private buildUrl(env: EnvironmentConfig, resourcePath: string, queryParams?: string): string {
    const baseUrl = `${env.url}/api/data/v9.2/${resourcePath}`;
    return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
  }

  private async makeRequest(
    env: EnvironmentConfig,
    url: string,
    timeout: number,
    options?: { forceRefreshToken?: boolean },
  ): Promise<{ response: Response; durationMs: number; callId?: number }> {
    const token = await this.tokenManager.getToken(env, {
      forceRefresh: options?.forceRefreshToken,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const startedAt = Date.now();
    const callId = requestLogger.beginHttpCall({
      type: "crm",
      method: "GET",
      url,
      timeoutMs: timeout,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Prefer: 'odata.include-annotations="*"',
      },
    });

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
      const durationMs = Date.now() - startedAt;
      requestLogger.logHttpResponse(callId, {
        status: response.status,
        statusText: response.statusText,
        durationMs,
        headers: Object.fromEntries(response.headers.entries()),
      });
      return { response, durationMs, callId };
    } catch (error) {
      if (isAbortError(error)) {
        requestLogger.logError("crm-timeout", error, {
          environment: env.name,
          timeoutMs: timeout,
          url,
          callId: callId || null,
        });
        throw new DynamicsRequestError(
          env.name,
          "timeout",
          `Request timed out after ${timeout} ms for ${url}`,
        );
      }

      requestLogger.logError("crm-network", error, {
        environment: env.name,
        url,
        callId: callId || null,
      });
      throw new DynamicsRequestError(
        env.name,
        "network",
        `Network failure for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestWithRetry(
    env: EnvironmentConfig,
    url: string,
    timeout: number,
  ): Promise<{ response: Response; callId?: number }> {
    let attempt = 0;
    let refreshedAfterUnauthorized = false;
    let forceRefreshToken = false;
    let lastResponse: { response: Response; callId?: number } | undefined;

    while (attempt < MAX_RETRIES) {
      try {
        const result = await this.makeRequest(env, url, timeout, {
          forceRefreshToken,
        });
        forceRefreshToken = false;
        const { response } = result;

        if (response.status === 401 && !refreshedAfterUnauthorized) {
          this.tokenManager.clearCache(env.name);
          refreshedAfterUnauthorized = true;
          forceRefreshToken = true;
          continue;
        }

        if (TRANSIENT_STATUS_CODES.has(response.status)) {
          lastResponse = result;
          if (attempt < MAX_RETRIES - 1) {
            await delay(getRetryDelayMs(attempt, response.headers.get("Retry-After")));
            attempt += 1;
            continue;
          }
        }

        return result;
      } catch (error) {
        if (isRetriableRequestError(error) && attempt < MAX_RETRIES - 1) {
          await delay(getRetryDelayMs(attempt));
          attempt += 1;
          continue;
        }

        throw error;
      }
    }

    if (lastResponse) {
      return lastResponse;
    }

    throw new DynamicsRequestError(
      env.name,
      "network",
      `Request failed after ${MAX_RETRIES} attempts for ${url}`,
    );
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
          const { response, callId } = await this.requestWithRetry(env, url, timeout);

          if (!response.ok) {
            await this.throwApiError(env, response, callId);
          }

          const data = (await response.json()) as ODataResponse<T>;
          requestLogger.logHttpResponse(callId, {
            status: response.status,
            body: {
              "@odata.count": data["@odata.count"] ?? null,
              "@odata.nextLink": data["@odata.nextLink"] ?? null,
              value: data.value,
            },
          });
          allResults.push(...data.value);

          url = data["@odata.nextLink"] ?? "";
          pageCount += 1;
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
        const { response, callId } = await this.requestWithRetry(env, url, timeout);

        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          await this.throwApiError(env, response, callId);
        }

        const data = (await response.json()) as T;
        requestLogger.logHttpResponse(callId, {
          status: response.status,
          body: data,
        });
        return data;
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

  private async throwApiError(
    env: EnvironmentConfig,
    response: Response,
    callId?: number,
  ): Promise<never> {
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

    requestLogger.logHttpResponse(callId, {
      status: response.status,
      statusText: response.statusText,
      body,
    });
    requestLogger.logError("crm-api", {
      environment: env.name,
      statusCode: response.status,
      odataCode: odataCode || null,
      message,
    });
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterDelay = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterDelay !== undefined) {
    return retryAfterDelay;
  }

  return Math.min(1000 * 2 ** attempt, 8000);
}

function parseRetryAfterMs(header?: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(header);
  if (Number.isNaN(retryDate)) {
    return undefined;
  }

  return Math.max(retryDate - Date.now(), 0);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function isRetriableRequestError(error: unknown): boolean {
  return error instanceof DynamicsRequestError;
}
