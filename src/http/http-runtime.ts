import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface HttpRequest extends IncomingMessage {
  body?: unknown;
}

export interface HttpResponse extends ServerResponse {
  json(body: unknown): HttpResponse;
  status(code: number): HttpResponse;
}

export interface HttpHealthState {
  startedAt: string;
  requestCount: number;
  activeRequestCount: number;
  activeSessionCount: number;
  errorCount: number;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  shuttingDown: boolean;
}

interface HttpSessionContext {
  id: string | null;
  createdAt: string;
  lastSeenAt: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  disposePromise: Promise<void> | null;
}

export function createHttpHealthState(): HttpHealthState {
  return {
    startedAt: new Date().toISOString(),
    requestCount: 0,
    activeRequestCount: 0,
    activeSessionCount: 0,
    errorCount: 0,
    lastErrorMessage: null,
    lastErrorAt: null,
    shuttingDown: false,
  };
}

export class HttpRuntime {
  private readonly sessions = new Map<string, HttpSessionContext>();

  constructor(
    private readonly buildServer: () => McpServer,
    private readonly healthState: HttpHealthState,
    private readonly onError?: (error: unknown, context?: Record<string, unknown>) => void,
  ) {}

  async handleRequest(req: HttpRequest, res: HttpResponse): Promise<void> {
    if (this.healthState.shuttingDown) {
      this.writeJsonRpcError(res, 503, -32000, "Server is shutting down.");
      return;
    }

    this.healthState.requestCount += 1;
    this.healthState.activeRequestCount += 1;
    const releaseRequest = once(() => {
      this.healthState.activeRequestCount = Math.max(this.healthState.activeRequestCount - 1, 0);
    });
    res.once("finish", releaseRequest);
    res.once("close", releaseRequest);

    try {
      switch (req.method) {
        case "POST":
          await this.handlePost(req, res);
          return;
        case "GET":
        case "DELETE":
          await this.handleSessionRequest(req, res);
          return;
        default:
          this.writeJsonRpcError(res, 405, -32000, "Method not allowed.");
          return;
      }
    } catch (error) {
      this.recordError(error, { method: req.method, url: req.url || "", requestBody: req.body });
      if (!res.headersSent) {
        this.writeJsonRpcError(res, 500, -32603, "Internal server error");
      }
    }
  }

  async shutdown(server: Server): Promise<void> {
    if (this.healthState.shuttingDown) {
      return;
    }

    this.healthState.shuttingDown = true;
    await Promise.allSettled(
      [...this.sessions.values()].map((session) =>
        this.disposeSession(session, { closeTransport: true }),
      ),
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  private async handlePost(req: HttpRequest, res: HttpResponse): Promise<void> {
    const sessionId = readSessionId(req);
    if (sessionId) {
      await this.handleBoundSessionRequest(sessionId, req, res);
      return;
    }

    const session = await this.createSession();
    let registered = false;

    try {
      await session.transport.handleRequest(req, res, req.body);
      registered = session.id !== null;
    } catch (error) {
      await this.disposeSession(session, { closeTransport: true });
      throw error;
    }

    if (!registered) {
      await this.disposeSession(session, { closeTransport: true });
    }
  }

  private async handleSessionRequest(req: HttpRequest, res: HttpResponse): Promise<void> {
    const sessionId = readSessionId(req);
    if (!sessionId) {
      this.writeJsonRpcError(res, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
      return;
    }

    await this.handleBoundSessionRequest(sessionId, req, res);
  }

  private async handleBoundSessionRequest(
    sessionId: string,
    req: HttpRequest,
    res: HttpResponse,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.writeJsonRpcError(res, 404, -32001, "Session not found");
      return;
    }

    session.lastSeenAt = new Date().toISOString();
    await session.transport.handleRequest(req, res, req.body);
  }

  private async createSession(): Promise<HttpSessionContext> {
    const server = this.buildServer();
    const session: HttpSessionContext = {
      id: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      server,
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (sessionId) => {
          session.id = sessionId;
          session.lastSeenAt = new Date().toISOString();
          this.sessions.set(sessionId, session);
          this.healthState.activeSessionCount = this.sessions.size;
        },
        onsessionclosed: async (sessionId) => {
          const activeSession = this.sessions.get(sessionId);
          if (activeSession) {
            await this.disposeSession(activeSession, { closeTransport: false });
          }
        },
      }),
      disposePromise: null,
    };

    session.transport.onclose = () => {
      void this.disposeSession(session, { closeTransport: false });
    };
    session.transport.onerror = (error) => {
      this.recordError(error, { sessionId: session.id });
    };

    await server.connect(session.transport);
    return session;
  }

  private async disposeSession(
    session: HttpSessionContext,
    options: { closeTransport: boolean },
  ): Promise<void> {
    if (session.disposePromise) {
      await session.disposePromise;
      return;
    }

    session.disposePromise = (async () => {
      if (session.id && this.sessions.get(session.id) === session) {
        this.sessions.delete(session.id);
        this.healthState.activeSessionCount = this.sessions.size;
      }

      if (options.closeTransport) {
        await session.transport.close().catch(() => undefined);
      }

      await session.server.close().catch(() => undefined);
    })();

    await session.disposePromise;
  }

  private recordError(error: unknown, context?: Record<string, unknown>): void {
    this.healthState.errorCount += 1;
    this.healthState.lastErrorMessage = error instanceof Error ? error.message : String(error);
    this.healthState.lastErrorAt = new Date().toISOString();
    this.onError?.(error, context);
  }

  private writeJsonRpcError(
    res: HttpResponse,
    status: number,
    code: number,
    message: string,
  ): void {
    res.status(status).json({
      jsonrpc: "2.0",
      error: {
        code,
        message,
      },
      id: null,
    });
  }
}

function readSessionId(req: HttpRequest): string | undefined {
  const value = req.headers["mcp-session-id"];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value[0]?.trim()) {
    return value[0].trim();
  }

  return undefined;
}

function once(callback: () => void): () => void {
  let called = false;

  return () => {
    if (called) {
      return;
    }

    called = true;
    callback();
  };
}
