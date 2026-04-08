#!/usr/bin/env node

import type { Server } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/environments.js";
import { loadEnvFiles } from "./config/runtime-env.js";
import { TokenManager } from "./auth/token-manager.js";
import { DynamicsClient } from "./client/dynamics-client.js";
import { instrumentServerToolLogging, requestLogger } from "./logging/request-logger.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllResources } from "./resources/index.js";
import {
  createHttpHealthState,
  HttpRuntime,
  type HttpHealthState,
  type HttpRequest,
  type HttpResponse,
} from "./http/http-runtime.js";

export { createHttpHealthState };
export type { HttpHealthState };

type TransportMode = "stdio" | "http";

interface RuntimeOptions {
  transport: TransportMode;
  port: number;
  host: string;
  path: string;
}

function buildServer(config: ReturnType<typeof loadConfig>, client: DynamicsClient): McpServer {
  const server = new McpServer({
    name: "dynamics-365-mcp",
    version: "0.1.0",
  });

  instrumentServerToolLogging(server);
  registerAllTools(server, config, client);
  registerAllPrompts(server, config);
  registerAllResources(server, config);
  return server;
}

export function parseRuntimeOptions(argv: string[], env: NodeJS.ProcessEnv): RuntimeOptions {
  const args = new Map<string, string>();

  for (const rawArg of argv) {
    if (!rawArg.startsWith("--")) {
      continue;
    }

    const [key, value] = rawArg.slice(2).split("=", 2);
    if (key && value) {
      args.set(key, value);
    }
  }

  const transportValue = (args.get("transport") || env.MCP_TRANSPORT || "stdio").toLowerCase();
  if (transportValue !== "stdio" && transportValue !== "http") {
    throw new Error(`Unsupported transport '${transportValue}'. Use 'stdio' or 'http'.`);
  }

  const rawPort = args.get("port") || env.MCP_PORT || env.PORT || "3003";
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port '${rawPort}'. Use an integer from 1 to 65535.`);
  }

  const host = args.get("host") || env.MCP_HOST || "127.0.0.1";
  const rawPath = args.get("path") || env.MCP_PATH || "/mcp";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  return {
    transport: transportValue,
    port,
    host,
    path,
  };
}

export function buildHealthPayload(
  config: ReturnType<typeof loadConfig>,
  options: RuntimeOptions,
  tokenManager: TokenManager,
  client: DynamicsClient,
  healthState: HttpHealthState,
) {
  return {
    status: "ok",
    service: {
      name: "dynamics-365-mcp",
      version: "0.1.0",
      transport: "http",
      host: options.host,
      port: options.port,
      path: options.path,
      pid: process.pid,
      startedAt: healthState.startedAt,
      uptimeSeconds: Math.floor((Date.now() - Date.parse(healthState.startedAt)) / 1000),
      nodeVersion: process.version,
    },
    configuration: {
      defaultEnvironment: config.defaultEnvironment,
      environmentNames: config.environments.map((environment) => environment.name),
      environmentCount: config.environments.length,
    },
    requests: {
      total: healthState.requestCount,
      active: healthState.activeRequestCount,
      errors: healthState.errorCount,
      lastErrorMessage: healthState.lastErrorMessage,
      lastErrorAt: healthState.lastErrorAt,
    },
    sessions: {
      active: healthState.activeSessionCount,
      shuttingDown: healthState.shuttingDown,
    },
    auth: tokenManager.getHealthSnapshot(),
    client: client.getHealthSnapshot(),
  };
}

function installShutdownHandlers(server: Server, runtime: HttpRuntime): void {
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    void runtime
      .shutdown(server)
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error("Failed to stop HTTP server cleanly:", error);
        process.exit(1);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function startHttpServer(
  config: ReturnType<typeof loadConfig>,
  tokenManager: TokenManager,
  client: DynamicsClient,
  options: RuntimeOptions,
): Promise<void> {
  const app = createMcpExpressApp({ host: options.host });
  const healthState = createHttpHealthState();
  const runtime = new HttpRuntime(
    () => buildServer(config, client),
    healthState,
    (error, context) => {
      requestLogger.logError("http-request", error, context);
    },
  );

  app.get("/health", (_req: HttpRequest, res: HttpResponse) => {
    res.json(buildHealthPayload(config, options, tokenManager, client, healthState));
  });

  app.post(options.path, async (req: HttpRequest, res: HttpResponse) => {
    await runtime.handleRequest(req, res);
  });

  app.get(options.path, async (req: HttpRequest, res: HttpResponse) => {
    await runtime.handleRequest(req, res);
  });

  app.delete(options.path, async (req: HttpRequest, res: HttpResponse) => {
    await runtime.handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(options.port, options.host, () => {
      console.error(
        `Dynamics 365 MCP server listening on http://${options.host}:${options.port}${options.path}`,
      );
      installShutdownHandlers(httpServer, runtime);
      resolve();
    });

    httpServer.on("error", reject);
  });
}

export async function main() {
  loadRuntimeEnv(process.env, process.cwd());
  requestLogger.configureFromEnv(process.env, process.cwd());
  const config = loadConfig();
  const options = parseRuntimeOptions(process.argv.slice(2), process.env);

  const tokenManager = new TokenManager();
  const client = new DynamicsClient(tokenManager);

  if (options.transport === "http") {
    await startHttpServer(config, tokenManager, client, options);
    return;
  }

  const server = buildServer(config, client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function loadRuntimeEnv(env: NodeJS.ProcessEnv, cwd: string): string[] {
  const repoEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
  const cwdEnvPath = resolve(cwd, ".env");
  return loadEnvFiles(env, [cwdEnvPath, repoEnvPath]);
}

function isEntrypoint(): boolean {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  main().catch((error) => {
    requestLogger.logError("startup", error);
    console.error("Failed to start Dynamics 365 MCP server:", error);
    process.exit(1);
  });
}
