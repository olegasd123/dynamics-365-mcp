import type { TokenManager } from "../auth/token-manager.js";
import type { EnvironmentConfig } from "../config/types.js";
import { requestLogger } from "../logging/request-logger.js";
import { DynamicsApiError, DynamicsRequestError } from "./errors.js";
import { HttpTransport } from "./http-transport.js";
import { ResponseCache } from "./response-cache.js";
import { RetryPolicy } from "./retry-policy.js";

type CacheLayer = Pick<ResponseCache, "clear" | "getHealthSnapshot" | "load">;
type RetryLayer = Pick<RetryPolicy, "send">;
type TransportLayer = Pick<HttpTransport, "send">;

interface ODataResponse<T> {
  value: T[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
}

export interface RequestOptions {
  bypassCache?: boolean;
  cacheTtlMs?: number;
  maxPages?: number;
  timeout?: number;
}

interface DynamicsClientDependencies {
  responseCache?: CacheLayer;
  retryPolicy?: RetryLayer;
  transport?: TransportLayer;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_CACHE_TTL = 15_000;

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
        bypass: options?.bypassCache,
        ttlMs: options?.cacheTtlMs ?? DEFAULT_CACHE_TTL,
      },
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
    const cacheKey = this.buildCacheKey(env, resourcePath, queryParams, "single");

    return this.responseCache.load(
      cacheKey,
      async () => {
        const url = this.buildUrl(env, resourcePath, queryParams);
        const { response, callId } = await this.retryPolicy.send({
          env,
          timeoutMs: DEFAULT_TIMEOUT,
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
      { ttlMs: DEFAULT_CACHE_TTL },
    );
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
    const baseUrl = `${env.url}/api/data/v9.2/${resourcePath}`;
    return queryParams ? `${baseUrl}?${queryParams}` : baseUrl;
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
