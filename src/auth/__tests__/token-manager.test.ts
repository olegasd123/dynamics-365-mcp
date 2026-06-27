import { constants, generateKeyPairSync, sign as cryptoSign, verify } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, TokenManager } from "../token-manager.js";
import type {
  DeviceCodeSecretStore,
  OsSecretReader,
  StoredDeviceCodeToken,
} from "../os-keychain.js";

const originalFetch = global.fetch;
const tempDirs: string[] = [];

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

function createMemoryPrivateKeyStore(secrets: Record<string, string>): OsSecretReader {
  return {
    async loadSecret(secretName) {
      return secrets[secretName];
    },
    getHealthSnapshot() {
      return {
        storageType: "osKeychain",
        provider: "test-keychain",
        serviceName: "dynamics-365-mcp-client-certificates-test",
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

  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it("supports client certificate auth with a signed client assertion", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const dir = mkdtempSync(join(tmpdir(), "d365-mcp-cert-auth-"));
    tempDirs.push(dir);
    const privateKeyPath = join(dir, "client.key");
    writeFileSync(privateKeyPath, privateKeyPem);
    let tokenRequestBody = "";

    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      expect(String(input)).toBe("https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token");
      tokenRequestBody = String(init?.body || "");
      return Promise.resolve(createTokenResponse("certificate-token"));
    });
    global.fetch = fetchMock;

    const manager = new TokenManager();
    await expect(
      manager.getToken({
        name: "cert",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "clientCertificate",
        clientId: "client-id",
        privateKeyPath,
        clientCertificateThumbprint:
          "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      }),
    ).resolves.toBe("certificate-token");

    const body = new URLSearchParams(tokenRequestBody);
    const assertion = body.get("client_assertion") || "";
    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const signature = Buffer.from(encodedSignature, "base64url");

    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_assertion_type")).toBe(
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    );
    expect(body.get("scope")).toBe("https://org.crm.dynamics.com/.default");
    expect(header).toMatchObject({
      alg: "PS256",
      typ: "JWT",
      "x5t#S256": "ABEiM0RVZneImaq7zN3u_wARIjNEVWZ3iJmqu8zd7v8",
    });
    expect(payload).toMatchObject({
      aud: "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
      exp: 1_700_000_600,
      iss: "client-id",
      nbf: 1_700_000_000,
      sub: "client-id",
    });
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        signature,
      ),
    ).toBe(true);
    nowSpy.mockRestore();
  });

  it("supports client certificate auth with a private key from the OS keychain", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    let tokenRequestBody = "";

    global.fetch = vi.fn<typeof fetch>((_input, init) => {
      tokenRequestBody = String(init?.body || "");
      return Promise.resolve(createTokenResponse("keychain-certificate-token"));
    });

    const manager = new TokenManager({
      privateKeySecretStore: createMemoryPrivateKeyStore({
        "prod-client-key": privateKeyPem,
      }),
    });
    await expect(
      manager.getToken({
        name: "cert",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "clientCertificate",
        clientId: "client-id",
        privateKeySource: "osKeychain",
        privateKeyName: "prod-client-key",
        clientCertificateThumbprint:
          "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      }),
    ).resolves.toBe("keychain-certificate-token");

    const assertion = new URLSearchParams(tokenRequestBody).get("client_assertion") || "";
    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
    const signature = Buffer.from(encodedSignature, "base64url");

    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        signature,
      ),
    ).toBe(true);
  });

  it("supports client certificate auth with a certificate store signer", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    let tokenRequestBody = "";

    global.fetch = vi.fn<typeof fetch>((_input, init) => {
      tokenRequestBody = String(init?.body || "");
      return Promise.resolve(createTokenResponse("store-certificate-token"));
    });

    const manager = new TokenManager({
      certificateStoreClient: {
        async getCertificateThumbprint() {
          return { x5tS256: "ABEiM0RVZneImaq7zN3u_wARIjNEVWZ3iJmqu8zd7v8" };
        },
        async sign(_env, signingInput) {
          return cryptoSign("RSA-SHA256", Buffer.from(signingInput), {
            key: privateKey,
            padding: constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 32,
          });
        },
      },
    });
    await expect(
      manager.getToken({
        name: "cert",
        url: "https://org.crm.dynamics.com",
        tenantId: "tenant-id",
        authType: "clientCertificate",
        clientId: "client-id",
        certificateStore: "windowsCurrentUser",
        certificateStoreThumbprint: "11223344556677889900AABBCCDDEEFF00112233",
      }),
    ).resolves.toBe("store-certificate-token");

    const assertion = new URLSearchParams(tokenRequestBody).get("client_assertion") || "";
    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
    const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
    const signature = Buffer.from(encodedSignature, "base64url");

    expect(header).toMatchObject({
      alg: "PS256",
      typ: "JWT",
      "x5t#S256": "ABEiM0RVZneImaq7zN3u_wARIjNEVWZ3iJmqu8zd7v8",
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        {
          key: publicKey,
          padding: constants.RSA_PKCS1_PSS_PADDING,
          saltLength: 32,
        },
        signature,
      ),
    ).toBe(true);
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
