import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenManager } from "../../auth/token-manager.js";
import { CACHE_TIERS } from "../cache-policy.js";
import { DynamicsClient, DynamicsRequestError } from "../dynamics-client.js";

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

function createImmediateTimeoutSpy() {
  return vi.spyOn(global, "setTimeout").mockImplementation(((callback: TimerHandler) => {
    if (typeof callback === "function") {
      callback();
    }
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
}

type TokenManagerStub = Pick<TokenManager, "getToken" | "clearCache">;

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

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    const first = await client.query(env, "accounts", "$select=name");
    const second = await client.query(env, "accounts", "$select=name");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("uses the configured api version when building request URLs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(createODataResponse([{ accountid: "1", name: "Account" }]));
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    await client.query({ ...env, apiVersion: "v9.1" }, "accounts", "$select=name", {
      bypassCache: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.crm.dynamics.com/api/data/v9.1/accounts?$select=name",
      expect.any(Object),
    );
  });

  it("returns one Dataverse page without following next links", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          "@odata.count": 3,
          "@odata.nextLink": "https://dev.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=abc",
          value: [{ accountid: "1", name: "Account A" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    await expect(
      client.queryPage(env, "accounts", "$select=name&$top=1&$count=true", { bypassCache: true }),
    ).resolves.toEqual({
      items: [{ accountid: "1", name: "Account A" }],
      totalCount: 3,
      nextLink: "https://dev.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=abc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent query calls for the same cache key", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(responsePromise);
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

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

  it("refreshes the token and retries once after a 401 response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(createODataResponse([{ accountid: "1", name: "Account" }]));
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    await expect(
      client.query(env, "accounts", "$select=name", { bypassCache: true }),
    ).resolves.toEqual([{ accountid: "1", name: "Account" }]);

    expect(tokenManager.clearCache).toHaveBeenCalledWith("dev");
    expect(tokenManager.getToken).toHaveBeenNthCalledWith(2, env, { forceRefresh: true });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer token-2",
    });
  });

  it("retries transient 503 responses with backoff", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("Busy", { status: 503 }))
      .mockResolvedValueOnce(createODataResponse([{ accountid: "1", name: "Account" }]));
    const timeoutSpy = createImmediateTimeoutSpy();
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    await expect(
      client.query(env, "accounts", "$select=name", { bypassCache: true }),
    ).resolves.toEqual([{ accountid: "1", name: "Account" }]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });

  it("wraps timeout failures with a clear request error", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    const timeoutSpy = createImmediateTimeoutSpy();
    global.fetch = vi.fn<typeof fetch>().mockRejectedValue(abortError);

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    await expect(
      client.query(env, "accounts", "$select=name", { bypassCache: true }),
    ).rejects.toBeInstanceOf(DynamicsRequestError);
    await expect(
      client.query(env, "accounts", "$select=name", { bypassCache: true }),
    ).rejects.toThrow("Dynamics request timeout [dev]");
    timeoutSpy.mockRestore();
  });

  it("uses the explicit cache tier when provided", async () => {
    const responseCache = {
      clear: vi.fn(),
      getHealthSnapshot: vi.fn().mockReturnValue({
        pendingRequestCount: 0,
        responseCacheEntries: 0,
      }),
      load: vi.fn(async (_key: string, loader: () => Promise<unknown>, options: unknown) => {
        await loader();
        return options;
      }),
    };
    const transport = {
      send: vi.fn().mockResolvedValue({
        response: createODataResponse([{ accountid: "1" }]),
        callId: 1,
      }),
    };
    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager, {
      responseCache,
      transport,
    });

    const cacheOptions = await client.query(env, "accounts", "$select=name", {
      cacheTier: CACHE_TIERS.METADATA,
    });

    expect(cacheOptions).toEqual({
      bypass: false,
      ttlMs: 300_000,
    });
  });

  it("infers a schema cache tier for EntityDefinitions queries", async () => {
    const responseCache = {
      clear: vi.fn(),
      getHealthSnapshot: vi.fn().mockReturnValue({
        pendingRequestCount: 0,
        responseCacheEntries: 0,
      }),
      load: vi.fn(async (_key: string, loader: () => Promise<unknown>, options: unknown) => {
        await loader();
        return options;
      }),
    };
    const transport = {
      send: vi.fn().mockResolvedValue({
        response: createODataResponse([{ MetadataId: "1" }]),
        callId: 1,
      }),
    };
    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager, {
      responseCache,
      transport,
    });

    const cacheOptions = await client.query(env, "EntityDefinitions", "$select=LogicalName");

    expect(cacheOptions).toEqual({
      bypass: false,
      ttlMs: 1_800_000,
    });
  });

  it("applies cache tier options to single-record reads", async () => {
    const responseCache = {
      clear: vi.fn(),
      getHealthSnapshot: vi.fn().mockReturnValue({
        pendingRequestCount: 0,
        responseCacheEntries: 0,
      }),
      load: vi.fn(async (_key: string, loader: () => Promise<unknown>, options: unknown) => {
        await loader();
        return options;
      }),
    };
    const transport = {
      send: vi.fn().mockResolvedValue({
        response: new Response(JSON.stringify({ roleid: "1", name: "Admin" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        callId: 1,
      }),
    };
    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager, {
      responseCache,
      transport,
    });

    const cacheOptions = await client.querySingle(env, "roles", "1", "$select=name", {
      cacheTier: CACHE_TIERS.METADATA,
    });

    expect(cacheOptions).toEqual({
      bypass: false,
      ttlMs: 300_000,
    });
  });

  it("invokes bound actions with a POST body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ExportTranslationFile: "UEsDBA==" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = fetchMock;

    const tokenManager: TokenManagerStub = {
      getToken: vi.fn().mockResolvedValue("token-1"),
      clearCache: vi.fn(),
    };
    const client = new DynamicsClient(tokenManager as TokenManager);

    const response = await client.invokeAction(
      env,
      "solutions/Microsoft.Dynamics.CRM.ExportTranslation",
      {
        SolutionName: "SYNERGIE_TalentPlug",
      },
      { timeout: 45000 },
    );

    expect(response).toEqual({ ExportTranslationFile: "UEsDBA==" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.crm.dynamics.com/api/data/v9.2/solutions/Microsoft.Dynamics.CRM.ExportTranslation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ SolutionName: "SYNERGIE_TalentPlug" }),
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Content-Type": "application/json",
        }),
      }),
    );
  });
});
