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
  pendingSessionCount: number;
  errorCount: number;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
  evictedSessionCount: number;
  expiredSessionCount: number;
  rejectedSessionCount: number;
  oldestSessionAgeMs: number | null;
  longestIdleSessionMs: number | null;
  lastExpiredAt: string | null;
  shuttingDown: boolean;
}

export interface HttpRuntimeOptions {
  sessionIdleTimeoutMs: number;
  maxActiveSessions: number;
  sessionCleanupIntervalMs: number;
}

interface HttpSessionContext {
  id: string | null;
  createdAtMs: number;
  lastSeenAtMs: number;
  activeNonGetRequestCount: number;
  pending: boolean;
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
    pendingSessionCount: 0,
    errorCount: 0,
    lastErrorMessage: null,
    lastErrorAt: null,
    evictedSessionCount: 0,
    expiredSessionCount: 0,
    rejectedSessionCount: 0,
    oldestSessionAgeMs: null,
    longestIdleSessionMs: null,
    lastExpiredAt: null,
    shuttingDown: false,
  };
}

export class HttpRuntime {
  private readonly sessions = new Map<string, HttpSessionContext>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private pendingSessionCount = 0;

  constructor(
    private readonly buildServer: () => McpServer,
    private readonly healthState: HttpHealthState,
    private readonly options: HttpRuntimeOptions,
    private readonly onError?: (error: unknown, context?: Record<string, unknown>) => void,
  ) {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredSessions();
    }, this.options.sessionCleanupIntervalMs);
    this.cleanupTimer.unref?.();
    this.refreshSessionHealthState();
  }

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
      await this.cleanupExpiredSessions();

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
    clearInterval(this.cleanupTimer);
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

    if (!this.reservePendingSessionSlot()) {
      this.healthState.rejectedSessionCount += 1;
      this.writeJsonRpcError(
        res,
        429,
        -32002,
        `Too many active sessions. Limit is ${this.options.maxActiveSessions}.`,
      );
      return;
    }

    let session: HttpSessionContext | null = null;
    try {
      session = await this.createSession();
    } catch (error) {
      this.releasePendingSessionSlot();
      throw error;
    }

    let registered = false;

    try {
      await this.handleTransportRequest(session, req, res);
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

    await this.handleTransportRequest(session, req, res);
  }

  private async createSession(): Promise<HttpSessionContext> {
    const server = this.buildServer();
    const now = Date.now();
    const session: HttpSessionContext = {
      id: null,
      createdAtMs: now,
      lastSeenAtMs: now,
      activeNonGetRequestCount: 0,
      pending: true,
      server,
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (sessionId) => {
          session.id = sessionId;
          session.pending = false;
          session.lastSeenAtMs = Date.now();
          this.releasePendingSessionSlot();
          this.sessions.set(sessionId, session);
          this.refreshSessionHealthState();
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
      if (session.pending) {
        session.pending = false;
        this.releasePendingSessionSlot();
      }

      if (session.id && this.sessions.get(session.id) === session) {
        this.sessions.delete(session.id);
      }

      if (options.closeTransport) {
        await session.transport.close().catch(() => undefined);
      }

      await session.server.close().catch(() => undefined);
      this.refreshSessionHealthState();
    })();

    await session.disposePromise;
  }

  private async handleTransportRequest(
    session: HttpSessionContext,
    req: HttpRequest,
    res: HttpResponse,
  ): Promise<void> {
    const countsAsActiveWork = req.method !== "GET";
    if (countsAsActiveWork) {
      session.activeNonGetRequestCount += 1;
    }
    session.lastSeenAtMs = Date.now();
    this.refreshSessionHealthState(session.lastSeenAtMs);

    try {
      await session.transport.handleRequest(req, res, req.body);
    } finally {
      if (countsAsActiveWork) {
        session.activeNonGetRequestCount = Math.max(session.activeNonGetRequestCount - 1, 0);
      }
      session.lastSeenAtMs = Date.now();
      this.refreshSessionHealthState(session.lastSeenAtMs);
    }
  }

  private reservePendingSessionSlot(): boolean {
    if (this.sessions.size + this.pendingSessionCount >= this.options.maxActiveSessions) {
      this.refreshSessionHealthState();
      return false;
    }

    this.pendingSessionCount += 1;
    this.refreshSessionHealthState();
    return true;
  }

  private releasePendingSessionSlot(): void {
    this.pendingSessionCount = Math.max(this.pendingSessionCount - 1, 0);
    this.refreshSessionHealthState();
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions = [...this.sessions.values()].filter((session) =>
      this.isSessionExpired(session, now),
    );

    if (expiredSessions.length === 0) {
      this.refreshSessionHealthState(now);
      return;
    }

    this.healthState.expiredSessionCount += expiredSessions.length;
    this.healthState.evictedSessionCount += expiredSessions.length;
    this.healthState.lastExpiredAt = new Date(now).toISOString();

    await Promise.allSettled(
      expiredSessions.map((session) => this.disposeSession(session, { closeTransport: true })),
    );
    this.refreshSessionHealthState(now);
  }

  private isSessionExpired(session: HttpSessionContext, now: number): boolean {
    return (
      session.activeNonGetRequestCount === 0 &&
      now - session.lastSeenAtMs >= this.options.sessionIdleTimeoutMs
    );
  }

  private refreshSessionHealthState(now = Date.now()): void {
    this.healthState.activeSessionCount = this.sessions.size;
    this.healthState.pendingSessionCount = this.pendingSessionCount;

    if (this.sessions.size === 0) {
      this.healthState.oldestSessionAgeMs = null;
      this.healthState.longestIdleSessionMs = null;
      return;
    }

    let oldestSessionAgeMs = 0;
    let longestIdleSessionMs = 0;

    for (const session of this.sessions.values()) {
      oldestSessionAgeMs = Math.max(oldestSessionAgeMs, now - session.createdAtMs);
      longestIdleSessionMs = Math.max(longestIdleSessionMs, now - session.lastSeenAtMs);
    }

    this.healthState.oldestSessionAgeMs = oldestSessionAgeMs;
    this.healthState.longestIdleSessionMs = longestIdleSessionMs;
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
