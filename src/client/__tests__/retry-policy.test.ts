import { describe, expect, it, vi } from "vitest";
import { DynamicsRequestError } from "../errors.js";
import { RetryPolicy } from "../retry-policy.js";

const env = {
  name: "dev",
  url: "https://dev.crm.dynamics.com",
  tenantId: "tenant",
  clientId: "client",
  clientSecret: "secret",
};

describe("RetryPolicy", () => {
  it("refreshes the token cache once after a 401 response", async () => {
    const transport = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          response: new Response("Unauthorized", { status: 401 }),
          durationMs: 1,
        })
        .mockResolvedValueOnce({
          response: new Response(JSON.stringify({ value: [] }), { status: 200 }),
          durationMs: 1,
        }),
    };
    const tokenManager = { clearCache: vi.fn() };
    const policy = new RetryPolicy(transport, tokenManager, {
      delayFn: vi.fn().mockResolvedValue(undefined),
    });

    const result = await policy.send({
      env,
      timeoutMs: 1_000,
      url: "https://example.test/accounts",
    });

    expect(result.response.status).toBe(200);
    expect(tokenManager.clearCache).toHaveBeenCalledWith("dev");
    expect(transport.send).toHaveBeenNthCalledWith(2, {
      env,
      forceRefreshToken: true,
      timeoutMs: 1_000,
      url: "https://example.test/accounts",
    });
  });

  it("retries transient responses with backoff", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const transport = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          response: new Response("Busy", {
            status: 503,
            headers: { "Retry-After": "2" },
          }),
          durationMs: 1,
        })
        .mockResolvedValueOnce({
          response: new Response(JSON.stringify({ value: [] }), { status: 200 }),
          durationMs: 1,
        }),
    };
    const policy = new RetryPolicy(transport, { clearCache: vi.fn() }, { delayFn });

    const result = await policy.send({
      env,
      timeoutMs: 1_000,
      url: "https://example.test/accounts",
    });

    expect(result.response.status).toBe(200);
    expect(delayFn).toHaveBeenCalledWith(2_000);
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it("retries request errors and rethrows the last failure", async () => {
    const delayFn = vi.fn().mockResolvedValue(undefined);
    const error = new DynamicsRequestError("dev", "network", "boom");
    const transport = {
      send: vi.fn().mockRejectedValue(error),
    };
    const policy = new RetryPolicy(transport, { clearCache: vi.fn() }, { delayFn });

    await expect(
      policy.send({
        env,
        timeoutMs: 1_000,
        url: "https://example.test/accounts",
      }),
    ).rejects.toBe(error);

    expect(transport.send).toHaveBeenCalledTimes(3);
    expect(delayFn).toHaveBeenCalledTimes(2);
  });
});
