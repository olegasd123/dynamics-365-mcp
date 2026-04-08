import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await delay(100);
  }

  throw new Error(`HTTP runtime did not become ready.\n${stderr.buffer}`);
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

      const healthResponse = await fetch(`${baseUrl}/health`);
      const healthPayload = (await healthResponse.json()) as Record<string, unknown>;
      const mcpGetResponse = await fetch(`${baseUrl}/mcp`);

      expect(healthResponse.status).toBe(200);
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
      });
      expect(mcpGetResponse.status).toBe(405);

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
        `HTTP runtime smoke test failed: ${error instanceof Error ? error.message : String(error)}\nSTDOUT:\n${stdout.buffer}\nSTDERR:\n${stderr.buffer}`,
      );
    } finally {
      await Promise.allSettled([client.close(), transport.close()]);
      await closeChildProcess(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
