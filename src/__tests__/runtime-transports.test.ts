import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EXPECTED_TOOL_NAMES } from "../tools/__tests__/tool-test-helpers.js";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const entryPath = resolve(workspaceRoot, "src", "index.ts");

function getNodeEntrypointArgs(extraArgs: string[] = []): string[] {
  return ["--import=tsx", entryPath, ...extraArgs];
}

function createTempConfigPath(): { dir: string; configPath: string } {
  const dir = mkdtempSync(resolve(tmpdir(), "d365-mcp-runtime-test-"));
  const configPath = resolve(dir, "config.json");

  writeFileSync(
    configPath,
    JSON.stringify(
      {
        environments: [
          {
            name: "dev",
            url: "https://dev.crm.dynamics.com",
            tenantId: "tenant",
            authType: "clientSecret",
            clientId: "client",
            clientSecret: "secret",
          },
        ],
        defaultEnvironment: "dev",
      },
      null,
      2,
    ),
  );

  return { dir, configPath };
}

function createChildEnv(configPath: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    D365_MCP_CONFIG: configPath,
  };
}

function readStream(
  stream: { on(event: "data", listener: (chunk: unknown) => void): unknown } | null,
): { buffer: string } {
  const state = { buffer: "" };

  stream?.on("data", (chunk) => {
    state.buffer += String(chunk);
  });

  return state;
}

async function closeChildProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  const timedOut = await Promise.race([
    once(child, "exit").then(() => false),
    delay(2_000).then(() => true),
  ]);

  if (timedOut && child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a free TCP port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(address.port);
      });
    });
  });
}

async function waitForHttpServer(baseUrl: string, stderr: { buffer: string }): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await requestJson(new URL(`${baseUrl}/health`));
      if (response.statusCode === 200) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await delay(100);
  }

  throw new Error(`HTTP runtime did not become ready.\n${stderr.buffer}`);
}

async function requestJson(url: URL): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolvePromise, reject) => {
    const req = httpRequest(
      url,
      {
        method: "GET",
        agent: false,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => {
          resolvePromise({
            statusCode: res.statusCode || 0,
            body,
          });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function waitForExit(child: ChildProcess, timeoutMs = 2_000): Promise<boolean> {
  if (child.exitCode !== null) {
    return true;
  }

  const timedOut = await Promise.race([
    once(child, "exit").then(() => false),
    delay(timeoutMs).then(() => true),
  ]);

  return !timedOut;
}

async function fetchHealth(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await requestJson(new URL(`${baseUrl}/health`));
  expect(response.statusCode).toBe(200);
  return JSON.parse(response.body) as Record<string, unknown>;
}

async function waitForHealthValue<T>(
  baseUrl: string,
  selector: (payload: Record<string, unknown>) => T,
  predicate: (value: T) => boolean,
): Promise<Record<string, unknown>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const payload = await fetchHealth(baseUrl);
      if (predicate(selector(payload))) {
        return payload;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Health endpoint did not reach the expected state for ${baseUrl}.${reason}`);
}

describe("runtime transports", () => {
  it("starts in stdio mode and serves MCP tool metadata", async () => {
    const { dir, configPath } = createTempConfigPath();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: getNodeEntrypointArgs(),
      cwd: workspaceRoot,
      env: createChildEnv(configPath),
      stderr: "pipe",
    });
    const stderr = readStream(transport.stderr);
    const client = new Client({
      name: "runtime-stdio-test-client",
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
      const result = await client.listTools();
      const toolNames = result.tools
        .map((tool) => tool.name)
        .sort((left, right) => left.localeCompare(right));
      const canonicalToolNames = toolNames.filter((name) => !name.endsWith("commentary"));

      expect(canonicalToolNames).toEqual(EXPECTED_TOOL_NAMES);
      expect(toolNames).toContain("list_tablescommentary");
      expect(toolNames).toContain("analyze_update_triggerscommentary");
    } catch (error) {
      throw new Error(
        `Stdio runtime smoke test failed: ${error instanceof Error ? error.message : String(error)}\n${stderr.buffer}`,
      );
    } finally {
      await Promise.allSettled([client.close(), transport.close()]);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it("starts in HTTP mode and serves health and MCP endpoints", async () => {
    const { dir, configPath } = createTempConfigPath();
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      getNodeEntrypointArgs(["--transport=http", "--host=127.0.0.1", `--port=${port}`]),
      {
        cwd: workspaceRoot,
        env: createChildEnv(configPath),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout = readStream(child.stdout);
    const stderr = readStream(child.stderr);
    const baseUrl = `http://127.0.0.1:${port}`;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const client = new Client({
      name: "runtime-http-test-client",
      version: "1.0.0",
    });

    try {
      await waitForHttpServer(baseUrl, stderr);

      const healthPayload = await fetchHealth(baseUrl);
      const mcpGetResponse = await fetch(`${baseUrl}/mcp`);

      expect(healthPayload).toMatchObject({
        status: "ok",
        service: {
          name: "dynamics-365-mcp",
          transport: "http",
          host: "127.0.0.1",
          port,
          path: "/mcp",
        },
        configuration: {
          defaultEnvironment: "dev",
          environmentNames: ["dev"],
          environmentCount: 1,
        },
        sessions: {
          active: 0,
          shuttingDown: false,
        },
      });
      expect(mcpGetResponse.status).toBe(400);

      await client.connect(transport);
      const result = await client.listTools();
      const toolNames = result.tools
        .map((tool) => tool.name)
        .sort((left, right) => left.localeCompare(right));
      const canonicalToolNames = toolNames.filter((name) => !name.endsWith("commentary"));

      expect(canonicalToolNames).toEqual(EXPECTED_TOOL_NAMES);
      expect(toolNames).toContain("list_tablescommentary");
      expect(toolNames).toContain("analyze_update_triggerscommentary");

      const connectedHealth = await waitForHealthValue(
        baseUrl,
        (payload) => (payload.sessions as Record<string, unknown>).active,
        (active) => active === 1,
      );
      expect(
        Number((connectedHealth.requests as Record<string, unknown>).active || 0),
      ).toBeGreaterThanOrEqual(1);

      await transport.terminateSession();
      const terminatedHealth = await waitForHealthValue(
        baseUrl,
        (payload) => (payload.sessions as Record<string, unknown>).active,
        (active) => active === 0,
      );
      expect((terminatedHealth.requests as Record<string, unknown>).active).toBe(0);
    } catch (error) {
      throw new Error(
        `HTTP runtime smoke test failed: ${error instanceof Error ? error.message : String(error)}\nSTDOUT:\n${stdout.buffer}\nSTDERR:\n${stderr.buffer}`,
      );
    } finally {
      await Promise.allSettled([client.close(), transport.close()]);
      await closeChildProcess(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it("keeps sessions stable across repeated and concurrent HTTP requests", async () => {
    const { dir, configPath } = createTempConfigPath();
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      getNodeEntrypointArgs(["--transport=http", "--host=127.0.0.1", `--port=${port}`]),
      {
        cwd: workspaceRoot,
        env: createChildEnv(configPath),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stderr = readStream(child.stderr);
    const baseUrl = `http://127.0.0.1:${port}`;
    const transportA = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const transportB = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const clientA = new Client({
      name: "runtime-http-session-client-a",
      version: "1.0.0",
    });
    const clientB = new Client({
      name: "runtime-http-session-client-b",
      version: "1.0.0",
    });

    try {
      await waitForHttpServer(baseUrl, stderr);

      await Promise.all([clientA.connect(transportA), clientB.connect(transportB)]);
      expect(transportA.sessionId).toBeTruthy();
      expect(transportB.sessionId).toBeTruthy();
      expect(transportA.sessionId).not.toBe(transportB.sessionId);

      await Promise.all([clientA.listTools(), clientA.listTools(), clientB.listTools()]);

      const healthPayload = await waitForHealthValue(
        baseUrl,
        (payload) => (payload.sessions as Record<string, unknown>).active,
        (active) => active === 2,
      );
      expect(
        Number((healthPayload.requests as Record<string, unknown>).active || 0),
      ).toBeGreaterThanOrEqual(2);
      expect(
        Number((healthPayload.requests as Record<string, unknown>).total || 0),
      ).toBeGreaterThanOrEqual(5);

      await transportA.terminateSession();
      await transportB.terminateSession();
    } finally {
      await Promise.allSettled([
        clientA.close(),
        clientB.close(),
        transportA.close(),
        transportB.close(),
      ]);
      await closeChildProcess(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it("releases active request tracking when an HTTP client disconnects", async () => {
    const { dir, configPath } = createTempConfigPath();
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      getNodeEntrypointArgs(["--transport=http", "--host=127.0.0.1", `--port=${port}`]),
      {
        cwd: workspaceRoot,
        env: createChildEnv(configPath),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stderr = readStream(child.stderr);
    const baseUrl = `http://127.0.0.1:${port}`;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const client = new Client({
      name: "runtime-http-disconnect-client",
      version: "1.0.0",
    });

    try {
      await waitForHttpServer(baseUrl, stderr);
      await client.connect(transport);
      await client.listTools();
      const sessionId = String(transport.sessionId || "");

      const connectedHealth = await waitForHealthValue(
        baseUrl,
        (payload) => (payload.requests as Record<string, unknown>).active,
        (active) => active === 1,
      );
      expect((connectedHealth.sessions as Record<string, unknown>).active).toBe(1);

      await transport.close();
      await client.close();

      const healthAfterDisconnect = await waitForHealthValue(
        baseUrl,
        (payload) => (payload.requests as Record<string, unknown>).active,
        (active) => active === 0,
      );
      expect((healthAfterDisconnect.sessions as Record<string, unknown>).active).toBe(1);

      const deleteResponse = await fetch(`${baseUrl}/mcp`, {
        method: "DELETE",
        headers: {
          "mcp-session-id": sessionId,
        },
      });
      expect(deleteResponse.status).toBe(200);
    } finally {
      await Promise.allSettled([client.close(), transport.close()]);
      await closeChildProcess(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);

  it("shuts down cleanly with active HTTP sessions", async () => {
    const { dir, configPath } = createTempConfigPath();
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      getNodeEntrypointArgs(["--transport=http", "--host=127.0.0.1", `--port=${port}`]),
      {
        cwd: workspaceRoot,
        env: createChildEnv(configPath),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stderr = readStream(child.stderr);
    const baseUrl = `http://127.0.0.1:${port}`;
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    const client = new Client({
      name: "runtime-http-shutdown-client",
      version: "1.0.0",
    });

    try {
      await waitForHttpServer(baseUrl, stderr);
      await client.connect(transport);
      await client.listTools();

      child.kill("SIGTERM");
      const exited = await waitForExit(child, 3_000);

      expect(exited).toBe(true);
    } finally {
      await Promise.allSettled([client.close(), transport.close()]);
      await closeChildProcess(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
