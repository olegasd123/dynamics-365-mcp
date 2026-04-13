import type { TokenManager } from "../auth/token-manager.js";
import type { EnvironmentConfig } from "../config/types.js";
import type { HttpTransport, HttpTransportResponse } from "./http-transport.js";
import { DynamicsRequestError } from "./errors.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryPolicyRequest {
  body?: string;
  env: EnvironmentConfig;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs: number;
  url: string;
}

interface RetryPolicyOptions {
  delayFn?: (ms: number) => Promise<void>;
  maxRetries?: number;
  transientStatusCodes?: ReadonlySet<number>;
}

type TokenCacheController = Pick<TokenManager, "clearCache">;

export class RetryPolicy {
  private readonly delayFn: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly transientStatusCodes: ReadonlySet<number>;

  constructor(
    private readonly transport: Pick<HttpTransport, "send">,
    private readonly tokenManager: TokenCacheController,
    options: RetryPolicyOptions = {},
  ) {
    this.delayFn = options.delayFn ?? delay;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.transientStatusCodes = options.transientStatusCodes ?? DEFAULT_TRANSIENT_STATUS_CODES;
  }

  async send(request: RetryPolicyRequest): Promise<HttpTransportResponse> {
    let attempt = 0;
    let refreshedAfterUnauthorized = false;
    let forceRefreshToken = false;

    while (attempt < this.maxRetries) {
      try {
        const result = await this.transport.send({
          body: request.body,
          env: request.env,
          forceRefreshToken,
          headers: request.headers,
          method: request.method,
          timeoutMs: request.timeoutMs,
          url: request.url,
        });
        forceRefreshToken = false;

        if (result.response.status === 401 && !refreshedAfterUnauthorized) {
          this.tokenManager.clearCache(request.env.name);
          refreshedAfterUnauthorized = true;
          forceRefreshToken = true;
          continue;
        }

        if (
          this.transientStatusCodes.has(result.response.status) &&
          attempt < this.maxRetries - 1
        ) {
          await this.delayFn(getRetryDelayMs(attempt, result.response.headers.get("Retry-After")));
          attempt += 1;
          continue;
        }

        return result;
      } catch (error) {
        if (isRetriableRequestError(error) && attempt < this.maxRetries - 1) {
          await this.delayFn(getRetryDelayMs(attempt));
          attempt += 1;
          continue;
        }

        throw error;
      }
    }

    throw new DynamicsRequestError(
      request.env.name,
      "network",
      `Request failed after ${this.maxRetries} attempts for ${request.url}`,
    );
  }
}

export function getRetryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterDelay = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterDelay !== undefined) {
    return retryAfterDelay;
  }

  return Math.min(1000 * 2 ** attempt, 8000);
}

export function parseRetryAfterMs(header?: string | null): number | undefined {
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableRequestError(error: unknown): boolean {
  return error instanceof DynamicsRequestError;
}
