import type { TokenManager } from "../auth/token-manager.js";
import { DEFAULT_DYNAMICS_API_VERSION, type EnvironmentConfig } from "../config/types.js";
import { requestLogger } from "../logging/request-logger.js";
import { DynamicsApiError, DynamicsRequestError } from "./errors.js";
import { HttpTransport } from "./http-transport.js";
import { ResponseCache } from "./response-cache.js";
import { RetryPolicy } from "./retry-policy.js";
import { resolveCachePolicy, type CacheRequestOptions, type CacheTier } from "./cache-policy.js";

type CacheLayer = Pick<ResponseCache, "clear" | "getHealthSnapshot" | "load">;
type RetryLayer = Pick<RetryPolicy, "send">;
type TransportLayer = Pick<HttpTransport, "send">;

interface ODataResponse<T> {
  value: T[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

export interface ODataPageResult<T> {
  items: T[];
  totalCount: number | null;
  nextLink: string | null;
}

export interface RequestOptions {
  bypassCache?: boolean;
  cacheTier?: CacheTier;
  cacheTtlMs?: number;
  maxPages?: number;
  pageLink?: string;
  timeout?: number;
}

interface DynamicsClientDependencies {
  responseCache?: CacheLayer;
  retryPolicy?: RetryLayer;
  transport?: TransportLayer;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_PAGES = 10;
export class DynamicsClient {
  private readonly responseCache: CacheLayer;
  private readonly retryPolicy: RetryLayer;

  constructor(tokenManager: TokenManager, dependencies: DynamicsClientDependencies = {}) {
    const transport = dependencies.transport ?? new HttpTransport(tokenManager);
    this.retryPolicy = dependencies.retryPolicy ?? new RetryPolicy(transport, tokenManager);
    this.responseCache = dependencies.responseCache ?? new ResponseCache();
  }

  getHealthSnapshot(): {
    pendingRequestCount: number;
    responseCacheEntries: number;
  } {
    return this.responseCache.getHealthSnapshot();
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
    const cachePolicy = this.getCachePolicy(resourcePath, options);

    return this.responseCache.load(
      cacheKey,
      async () => {
        let url = this.buildUrl(env, resourcePath, queryParams);
        const allResults: T[] = [];
        let pageCount = 0;

        while (url && pageCount < maxPages) {
          const { response, callId } = await this.retryPolicy.send({
            env,
            timeoutMs: timeout,
            url,
          });

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
      {
        bypass: cachePolicy.bypass,
        ttlMs: cachePolicy.ttlMs,
      },
    );
  }

  async queryPage<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    entitySet: string,
    queryParams?: string,
    options?: RequestOptions,
  ): Promise<ODataPageResult<T>> {
    return this.queryPagePath(env, entitySet, queryParams, options);
  }

  async queryPagePath<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
    options?: RequestOptions,
  ): Promise<ODataPageResult<T>> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const url = options?.pageLink || this.buildUrl(env, resourcePath, queryParams);
    const cacheKey = this.buildCacheKey(
      env,
      options?.pageLink || resourcePath,
      queryParams,
      "page",
    );
    const cachePolicy = this.getCachePolicy(resourcePath, options);

    return this.responseCache.load(
      cacheKey,
      async () => {
        const { response, callId } = await this.retryPolicy.send({
          env,
          timeoutMs: timeout,
          url,
        });

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

        return {
          items: [...data.value],
          totalCount: typeof data["@odata.count"] === "number" ? data["@odata.count"] : null,
          nextLink: data["@odata.nextLink"] ?? null,
        };
      },
      {
        bypass: cachePolicy.bypass,
        ttlMs: cachePolicy.ttlMs,
      },
    );
  }

  async querySingle<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    entitySet: string,
    id: string,
    queryParams?: string,
    options?: RequestOptions,
  ): Promise<T | null> {
    return this.getPath(env, `${entitySet}(${id})`, queryParams, options);
  }

  async getPath<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
    options?: RequestOptions,
  ): Promise<T | null> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const cacheKey = this.buildCacheKey(env, resourcePath, queryParams, "single");
    const cachePolicy = this.getCachePolicy(resourcePath, options);

    return this.responseCache.load(
      cacheKey,
      async () => {
        const url = this.buildUrl(env, resourcePath, queryParams);
        const { response, callId } = await this.retryPolicy.send({
          env,
          timeoutMs: timeout,
          url,
        });

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
      {
        bypass: cachePolicy.bypass,
        ttlMs: cachePolicy.ttlMs,
      },
    );
  }

  async invokeAction<T = Record<string, unknown>>(
    env: EnvironmentConfig,
    actionPath: string,
    body?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(env, actionPath);
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
    const { response, callId } = await this.retryPolicy.send({
      body: body ? JSON.stringify(body) : undefined,
      env,
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      timeoutMs: timeout,
      url,
    });

    if (!response.ok) {
      await this.throwApiError(env, response, callId);
    }

    const rawBody = await response.text();
    const data = rawBody ? (JSON.parse(rawBody) as T) : ({} as T);
    requestLogger.logHttpResponse(callId, {
      status: response.status,
      body: data,
    });
    return data;
  }

  clearCache(environmentName?: string): void {
    this.responseCache.clear(environmentName ? `${environmentName}|` : undefined);
  }

  private buildCacheKey(
    env: EnvironmentConfig,
    resourcePath: string,
    queryParams?: string,
    extraKey?: string,
  ): string {
    return [env.name, resourcePath, queryParams || "", extraKey || ""].join("|");
  }

  private buildUrl(env: EnvironmentConfig, resourcePath: string, queryParams?: string): string {
    const apiVersion = env.apiVersion ?? DEFAULT_DYNAMICS_API_VERSION;
    const baseUrl = `${env.url}/api/data/${apiVersion}/${resourcePath}`;
    return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
  }

  private getCachePolicy(resourcePath: string, options?: CacheRequestOptions) {
    return resolveCachePolicy(resourcePath, options);
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
}

export { DynamicsApiError, DynamicsRequestError };
