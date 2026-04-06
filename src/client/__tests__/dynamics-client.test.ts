import { afterEach, describe, expect, it, vi } from "vitest";
import { DynamicsClient } from "../dynamics-client.js";

const originalFetch = global.fetch;

const env = {
  name: "dev",
  url: "https://dev.crm.dynamics.com",
  tenantId: "tenant",
  clientId: "client",
  clientSecret: "secret",
};

function createODataResponse(payload: unknown): Response {
  return new Response(JSON.stringify({ value: payload }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("DynamicsClient", () => {
  it("caches repeated query calls for a short time", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createODataResponse([{ accountid: "1", name: "Account" }]));
    global.fetch = fetchMock;

    const tokenManager = {
      getToken: vi.fn().mockResolvedValue("token-1"),
    } as never;
    const client = new DynamicsClient(tokenManager);

    const first = await client.query(env, "accounts", "$select=name");
    const second = await client.query(env, "accounts", "$select=name");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("deduplicates concurrent query calls for the same cache key", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(responsePromise);
    global.fetch = fetchMock;

    const tokenManager = {
      getToken: vi.fn().mockResolvedValue("token-1"),
    } as never;
    const client = new DynamicsClient(tokenManager);

    const first = client.query(env, "accounts", "$select=name");
    const second = client.query(env, "accounts", "$select=name");

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.(createODataResponse([{ accountid: "1", name: "Account" }]));

    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ accountid: "1", name: "Account" }],
      [{ accountid: "1", name: "Account" }],
    ]);
  });
});
