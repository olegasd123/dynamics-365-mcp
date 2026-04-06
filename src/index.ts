#!/usr/bin/env node

import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config/environments.js";
import { TokenManager } from "./auth/token-manager.js";
import { DynamicsClient } from "./client/dynamics-client.js";
import { instrumentServerToolLogging, requestLogger } from "./logging/request-logger.js";
import { registerAllTools } from "./tools/index.js";

type TransportMode = "stdio" | "http";

interface RuntimeOptions {
  transport: TransportMode;
  port: number;
  host: string;
  path: string;
}

interface HttpRequest extends IncomingMessage {
  body?: unknown;
}

interface HttpResponse extends ServerResponse {
  json(body: unknown): HttpResponse;
  status(code: number): HttpResponse;
}

export interface HttpHealthState {
  startedAt: string;
  requestCount: number;
  activeRequestCount: number;
  errorCount: number;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
}

function buildServer(config: ReturnType<typeof loadConfig>, client: DynamicsClient): McpServer {
  const server = new McpServer({
    name: "dynamics-365-mcp",
    version: "0.1.0",
  });

  instrumentServerToolLogging(server);
  registerAllTools(server, config, client);
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

export function createHttpHealthState(): HttpHealthState {
  return {
    startedAt: new Date().toISOString(),
    requestCount: 0,
    activeRequestCount: 0,
    errorCount: 0,
    lastErrorMessage: null,
    lastErrorAt: null,
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
    auth: tokenManager.getHealthSnapshot(),
    client: client.getHealthSnapshot(),
  };
}

function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    server.close((error) => {
      if (error) {
        console.error("Failed to stop HTTP server cleanly:", error);
        process.exit(1);
      }

      process.exit(0);
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

  app.get("/health", (_req: HttpRequest, res: HttpResponse) => {
    res.json(buildHealthPayload(config, options, tokenManager, client, healthState));
  });

  app.post(options.path, async (req: HttpRequest, res: HttpResponse) => {
    const server = buildServer(config, client);
    healthState.requestCount += 1;
    healthState.activeRequestCount += 1;

    const releaseRequest = () => {
      healthState.activeRequestCount = Math.max(healthState.activeRequestCount - 1, 0);
    };

    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on("close", () => {
        releaseRequest();
        void transport.close();
        void server.close();
      });
    } catch (error) {
      releaseRequest();
      healthState.errorCount += 1;
      healthState.lastErrorMessage = error instanceof Error ? error.message : String(error);
      healthState.lastErrorAt = new Date().toISOString();
      requestLogger.logError("http-request", error, { requestBody: req.body });

      console.error("Error handling MCP HTTP request:", error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      }

      void server.close();
    }
  });

  app.get(options.path, (_req: HttpRequest, res: HttpResponse) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  app.delete(options.path, (_req: HttpRequest, res: HttpResponse) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
  });

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(options.port, options.host, () => {
      console.error(
        `Dynamics 365 MCP server listening on http://${options.host}:${options.port}${options.path}`,
      );
      installShutdownHandlers(httpServer);
      resolve();
    });

    httpServer.on("error", reject);
  });
}

export async function main() {
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
