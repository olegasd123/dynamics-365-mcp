import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, TokenManager } from "../token-manager.js";

const originalFetch = global.fetch;

const environment = {
  name: "dev",
  url: "https://dev.crm.dynamics.com",
  tenantId: "tenant-id",
  clientId: "client-id",
  clientSecret: "client-secret",
};

function createTokenResponse(token: string): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("TokenManager", () => {
  it("caches tokens until the cache is cleared", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createTokenResponse("token-1"))
      .mockResolvedValueOnce(createTokenResponse("token-2"));

    global.fetch = fetchMock;

    const manager = new TokenManager();

    await expect(manager.getToken(environment)).resolves.toBe("token-1");
    await expect(manager.getToken(environment)).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    manager.clearCache(environment.name);

    await expect(manager.getToken(environment)).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent token requests for the same environment", async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(responsePromise);
    global.fetch = fetchMock;

    const manager = new TokenManager();
    const firstRequest = manager.getToken(environment);
    const secondRequest = manager.getToken(environment);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.(createTokenResponse("shared-token"));

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      "shared-token",
      "shared-token",
    ]);
  });

  it("throws an AuthenticationError when the token request fails", async () => {
    global.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    const manager = new TokenManager();

    await expect(manager.getToken(environment)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(manager.getToken(environment)).rejects.toThrow("Network error: network down");
  });
});
