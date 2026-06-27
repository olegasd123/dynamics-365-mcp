import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, TokenManager } from "../token-manager.js";
import type { DeviceCodeSecretStore, StoredDeviceCodeToken } from "../os-keychain.js";

const originalFetch = global.fetch;

const environment = {
  name: "dev",
  url: "https://dev.crm.dynamics.com",
  tenantId: "tenant-id",
  authType: "clientSecret" as const,
  clientId: "client-id",
  clientSecret: "client-secret",
};

function createTokenResponse(token: string): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createMemorySecretStore(
  seed?: Iterable<[string, StoredDeviceCodeToken]>,
): DeviceCodeSecretStore {
  const tokens = new Map(seed);

  return {
    async load(environmentName) {
      return tokens.get(environmentName);
    },
    async save(token) {
      tokens.set(token.environmentName, token);
    },
    async delete(environmentName) {
      tokens.delete(environmentName);
    },
    getHealthSnapshot() {
      return {
        storageType: "osKeychain",
        provider: "test-keychain",
        serviceName: "dynamics-365-mcp-test",
        available: true,
      };
    },
  };
}

function createImmediateTimeoutSpy() {
  return vi.spyOn(global, "setTimeout").mockImplementation(((callback: TimerHandler) => {
    if (typeof callback === "function") {
      callback();
    }
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
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

  it("supports device code auth without a client secret", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const timeoutSpy = createImmediateTimeoutSpy();

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          device_code: "device-code",
          expires_in: 900,
          interval: 0,
          message: "Open https://microsoft.com/devicelogin and enter ABC-123",
        }),
      )
      .mockResolvedValueOnce(createTokenResponse("interactive-token"));

    global.fetch = fetchMock;

    const manager = new TokenManager({ secretStore: createMemorySecretStore() });

    await expect(
      manager.getToken({
        name: "interactive",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "deviceCode",
      }),
    ).resolves.toBe("interactive-token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(
      "client_id=04b07795-8ddb-461a-bbee-02f9e1bf7b46",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(
      "scope=https%3A%2F%2Forg.crm.dynamics.com%2Fuser_impersonation",
    );
    expect(stderrSpy).toHaveBeenCalledWith(
      "\n[interactive] Open https://microsoft.com/devicelogin and enter ABC-123\n\n",
    );

    timeoutSpy.mockRestore();
  });

  it("supports interactive browser auth with PKCE", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const redirectUri = "http://127.0.0.1:18401/callback";
    let tokenRequestBody = "";

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith(redirectUri)) {
        return originalFetch(input, init);
      }

      tokenRequestBody = String(init?.body || "");
      return createJsonResponse({
        access_token: "browser-token",
        refresh_token: "browser-refresh-token",
        expires_in: 3600,
      });
    });

    global.fetch = fetchMock;

    const openBrowser = vi.fn(async (authorizeUrl: string) => {
      const url = new URL(authorizeUrl);
      expect(url.pathname).toBe("/tenant-id/oauth2/v2.0/authorize");
      expect(url.searchParams.get("client_id")).toBe("public-client");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);

      const state = url.searchParams.get("state");
      expect(state).toBeTruthy();
      await originalFetch(`${redirectUri}?code=authorization-code&state=${state}`);
    });

    const manager = new TokenManager({
      secretStore: createMemorySecretStore(),
      openBrowser,
    });

    await expect(
      manager.getToken({
        name: "browser",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "interactiveBrowser",
        clientId: "public-client",
        redirectUri,
      }),
    ).resolves.toBe("browser-token");

    expect(openBrowser).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokenRequestBody).toContain("grant_type=authorization_code");
    expect(tokenRequestBody).toContain("client_id=public-client");
    expect(tokenRequestBody).toContain("code=authorization-code");
    expect(tokenRequestBody).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`);
    expect(tokenRequestBody).toContain("code_verifier=");
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("requires a client id for interactive browser auth", async () => {
    const manager = new TokenManager({ secretStore: createMemorySecretStore() });

    await expect(
      manager.getToken({
        name: "browser",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "interactiveBrowser",
      }),
    ).rejects.toThrow("interactiveBrowser auth requires clientId");
  });

  it("persists device code tokens and reuses them after restart", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const timeoutSpy = createImmediateTimeoutSpy();
    const secretStore = createMemorySecretStore();

    global.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          device_code: "device-code",
          expires_in: 900,
          interval: 0,
          message: "Open https://microsoft.com/devicelogin and enter ABC-123",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "interactive-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        }),
      );

    const firstManager = new TokenManager({ secretStore });
    await expect(
      firstManager.getToken({
        name: "interactive",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "deviceCode",
      }),
    ).resolves.toBe("interactive-token");

    const secondManager = new TokenManager({ secretStore });
    const fetchMock = vi.fn<typeof fetch>();
    global.fetch = fetchMock;

    await expect(
      secondManager.getToken({
        name: "interactive",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "deviceCode",
      }),
    ).resolves.toBe("interactive-token");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });

  it("uses the persisted refresh token before starting a new device code flow", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    const now = 1_700_000_000_000;
    nowSpy.mockReturnValue(now);
    const timeoutSpy = createImmediateTimeoutSpy();
    const secretStore = createMemorySecretStore();

    global.fetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          device_code: "device-code",
          expires_in: 900,
          interval: 0,
          message: "Sign in",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "expired-soon-token",
          refresh_token: "refresh-token",
          expires_in: 301,
        }),
      );

    const firstManager = new TokenManager({ secretStore });
    await firstManager.getToken({
      name: "interactive",
      url: "https://org.crm.dynamics.com",
      tenantId: "tenant-id",
      authType: "deviceCode",
    });

    nowSpy.mockReturnValue(now + 61_000);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      createJsonResponse({
        access_token: "refreshed-token",
        refresh_token: "refresh-token-2",
        expires_in: 3600,
      }),
    );
    global.fetch = fetchMock;

    const secondManager = new TokenManager({ secretStore });
    await expect(
      secondManager.getToken({
        name: "interactive",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "deviceCode",
      }),
    ).resolves.toBe("refreshed-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("grant_type=refresh_token");
    timeoutSpy.mockRestore();
  });
});
