import type { TokenManager } from "../auth/token-manager.js";
import type { EnvironmentConfig } from "../config/types.js";
import { requestLogger } from "../logging/request-logger.js";
import { DynamicsRequestError } from "./errors.js";

export interface HttpTransportRequest {
  body?: string;
  env: EnvironmentConfig;
  forceRefreshToken?: boolean;
  headers?: Record<string, string>;
  method?: string;
  timeoutMs: number;
  url: string;
}

export interface HttpTransportResponse {
  callId?: number;
  durationMs: number;
  response: Response;
}

export class HttpTransport {
  constructor(
    private readonly tokenManager: TokenManager,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(request: HttpTransportRequest): Promise<HttpTransportResponse> {
    const token = await this.tokenManager.getToken(request.env, {
      forceRefresh: request.forceRefreshToken,
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);
    const method = request.method || "GET";
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Prefer: 'odata.include-annotations="*"',
      ...(request.headers || {}),
    };
    const startedAt = Date.now();
    const callId = requestLogger.beginHttpCall({
      type: "crm",
      method,
      url: request.url,
      timeoutMs: request.timeoutMs,
      headers,
      body: request.body,
    });

    try {
      const response = await this.fetchFn(request.url, {
        method,
        body: request.body,
        headers,
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
          environment: request.env.name,
          timeoutMs: request.timeoutMs,
          url: request.url,
          callId: callId ?? null,
        });
        throw new DynamicsRequestError(
          request.env.name,
          "timeout",
          `Request timed out after ${request.timeoutMs} ms for ${request.url}`,
        );
      }

      requestLogger.logError("crm-network", error, {
        environment: request.env.name,
        url: request.url,
        callId: callId ?? null,
      });
      throw new DynamicsRequestError(
        request.env.name,
        "network",
        `Network failure for ${request.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
