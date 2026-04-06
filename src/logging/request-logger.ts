import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Notification, Request } from "@modelcontextprotocol/sdk/types.js";

interface LoggerConfig {
  enabled: boolean;
  logsDir: string;
  maxBodyChars: number;
}

interface RequestLogContext {
  createdAt: string;
  filePath: string;
  initialized: boolean;
  requestId: string;
  sessionId?: string;
  toolName: string;
  crmCallCount: number;
}

interface HttpCallStart {
  body?: unknown;
  headers?: Record<string, unknown>;
  method: string;
  timeoutMs?: number;
  type: "auth" | "crm";
  url: string;
}

interface HttpCallResponse {
  body?: unknown;
  durationMs?: number;
  headers?: Record<string, unknown>;
  status: number;
  statusText?: string;
}

type ToolHandlerExtra = RequestHandlerExtra<Request, Notification> | undefined;

const DEFAULT_LOG_DIR = resolve(homedir(), ".dynamics-365-mcp", "logs");
const DEFAULT_MAX_BODY_CHARS = 0;
const SENSITIVE_KEY_PATTERN = /(authorization|clientsecret|client_secret|token|secret|password|cookie)/i;
const instrumentedServers = new WeakSet<object>();

export class RequestLogger {
  private config: LoggerConfig = {
    enabled: false,
    logsDir: DEFAULT_LOG_DIR,
    maxBodyChars: DEFAULT_MAX_BODY_CHARS,
  };

  private readonly storage = new AsyncLocalStorage<RequestLogContext>();

  configureFromEnv(env: NodeJS.ProcessEnv, cwd = process.cwd()): void {
    const logsDir = env.D365_MCP_LOG_DIR
      ? resolve(cwd, env.D365_MCP_LOG_DIR)
      : DEFAULT_LOG_DIR;
    this.config = {
      enabled: parseBoolean(env.D365_MCP_LOG_ENABLED),
      logsDir,
      maxBodyChars: parseNumber(env.D365_MCP_LOG_MAX_BODY_CHARS, DEFAULT_MAX_BODY_CHARS),
    };
  }

  runWithToolContext<T>(
    toolName: string,
    toolArgs: unknown,
    extra: ToolHandlerExtra,
    callback: () => Promise<T>,
  ): Promise<T> {
    if (!this.config.enabled) {
      return callback();
    }

    const existing = this.storage.getStore();
    if (existing && existing.requestId === stringifyValue(extra?.requestId)) {
      this.ensureContextInitialized(existing, toolArgs, extra);
      return callback();
    }

    const context = this.createContext(toolName, toolArgs, extra);
    return this.storage.run(context, async () => {
      this.ensureContextInitialized(context, toolArgs, extra);
      return callback();
    });
  }

  beginHttpCall(details: HttpCallStart): number | undefined {
    const context = this.storage.getStore();
    if (!this.config.enabled || !context) {
      return undefined;
    }

    context.crmCallCount += 1;
    const callId = context.crmCallCount;
    this.appendEntry(context.filePath, `${details.type.toUpperCase()} REQUEST #${callId}`, details);
    return callId;
  }

  logHttpResponse(callId: number | undefined, details: HttpCallResponse): void {
    const context = this.storage.getStore();
    if (!this.config.enabled || !context || !callId) {
      return;
    }

    this.appendEntry(context.filePath, `HTTP RESPONSE #${callId}`, details);
  }

  logToolResponse(tool: string, response: unknown): void {
    const context = this.storage.getStore();
    if (!this.config.enabled || !context) {
      return;
    }

    this.appendEntry(context.filePath, `TOOL RESPONSE ${tool}`, response);
  }

  logError(scope: string, error: unknown, details?: unknown): void {
    if (!this.config.enabled) {
      return;
    }

    const context = this.storage.getStore();
    if (context) {
      this.appendEntry(context.filePath, `ERROR ${scope}`, {
        error: normalizeError(error),
        details,
      });
      return;
    }

    const standalonePath = this.createStandaloneErrorPath(scope);
    this.appendEntry(standalonePath, `ERROR ${scope}`, {
      error: normalizeError(error),
      details,
    });
  }

  private createContext(
    toolName: string,
    toolArgs: unknown,
    extra: ToolHandlerExtra,
  ): RequestLogContext {
    const now = new Date();
    const dateFolder = formatDateFolder(now);
    const timePart = formatTimePart(now);
    const requestId = stringifyValue(extra?.requestId) || "no-request-id";
    const label = buildFileLabel(toolName, toolArgs, requestId);
    const filePath = resolve(this.config.logsDir, dateFolder, `${timePart}-${label}.txt`);

    return {
      createdAt: now.toISOString(),
      filePath,
      initialized: false,
      requestId,
      sessionId: stringifyValue(extra?.sessionId) || undefined,
      toolName,
      crmCallCount: 0,
    };
  }

  private createStandaloneErrorPath(scope: string): string {
    const now = new Date();
    const dateFolder = formatDateFolder(now);
    const timePart = formatTimePart(now);
    const fileName = `${timePart}-${sanitizeSegment(scope || "runtime-error")}.txt`;
    return resolve(this.config.logsDir, dateFolder, fileName);
  }

  private ensureContextInitialized(
    context: RequestLogContext,
    toolArgs: unknown,
    extra: ToolHandlerExtra,
  ): void {
    if (context.initialized) {
      return;
    }

    this.appendEntry(context.filePath, "REQUEST START", {
      startedAt: context.createdAt,
      requestId: context.requestId,
      sessionId: context.sessionId || null,
      tool: context.toolName,
      args: toolArgs,
      meta: extra?._meta,
      requestInfo: extra?.requestInfo,
    });
    context.initialized = true;
  }

  private appendEntry(filePath: string, title: string, payload: unknown): void {
    try {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(
        filePath,
        `\n[${new Date().toISOString()}] ${title}\n${this.stringifyPayload(payload)}\n`,
        "utf8",
      );
    } catch (error) {
      console.error("Failed to write request log:", error);
    }
  }

  private stringifyPayload(payload: unknown): string {
    const sanitized = sanitizeValue(payload);
    const text =
      typeof sanitized === "string"
        ? sanitized
        : JSON.stringify(sanitized, null, 2) || JSON.stringify(String(sanitized));

    if (this.config.maxBodyChars > 0 && text.length > this.config.maxBodyChars) {
      return `${text.slice(0, this.config.maxBodyChars)}\n... [truncated ${text.length - this.config.maxBodyChars} chars]`;
    }

    return text;
  }
}

export const requestLogger = new RequestLogger();

export function instrumentServerToolLogging(server: McpServer): void {
  if (instrumentedServers.has(server as object)) {
    return;
  }

  const originalTool = server.tool.bind(server) as (...args: unknown[]) => unknown;
  (server as unknown as { tool: typeof server.tool }).tool = ((name: string, ...args: unknown[]) => {
    const handlerIndex = args.length - 1;
    const originalHandler = args[handlerIndex];
    if (typeof originalHandler !== "function") {
      return originalTool(name, ...args);
    }

    const wrappedHandler = async (...handlerArgs: unknown[]) => {
      const toolArgs = handlerArgs.length > 1 ? handlerArgs[0] : undefined;
      const extra = (handlerArgs.length > 1 ? handlerArgs[1] : handlerArgs[0]) as ToolHandlerExtra;

      return requestLogger.runWithToolContext(name, toolArgs, extra, async () => {
        try {
          return await (originalHandler as (...values: unknown[]) => Promise<unknown>)(...handlerArgs);
        } catch (error) {
          requestLogger.logError(`tool:${name}`, error, {
            args: toolArgs,
            requestId: stringifyValue(extra?.requestId) || null,
          });
          throw error;
        }
      });
    };

    const wrappedArgs = [...args];
    wrappedArgs[handlerIndex] = wrappedHandler;
    return originalTool(name, ...wrappedArgs);
  }) as typeof server.tool;

  instrumentedServers.add(server as object);
}

function buildFileLabel(toolName: string, toolArgs: unknown, requestId: string): string {
  const argHints =
    typeof toolArgs === "object" && toolArgs
      ? Object.entries(toolArgs as Record<string, unknown>)
          .filter(([, value]) => isSimpleValue(value))
          .slice(0, 3)
          .map(([key, value]) => `${key}-${sanitizeSegment(String(value))}`)
      : [];

  const parts = [sanitizeSegment(toolName), ...argHints, `req-${sanitizeSegment(requestId)}`].filter(
    Boolean,
  );

  return parts.join("-").slice(0, 120) || "request";
}

function formatDateFolder(date: Date): string {
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${date.getFullYear()}`;
}

function formatTimePart(date: Date): string {
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${padMilliseconds(date.getMilliseconds())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function padMilliseconds(value: number): string {
  return String(value).padStart(3, "0");
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toLowerCase();
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value, key);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        SENSITIVE_KEY_PATTERN.test(entryKey)
          ? "[REDACTED]"
          : sanitizeValue(entryValue, entryKey),
      ]),
    );
  }

  return String(value);
}

function sanitizeString(value: string, key?: string): string {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (/^Bearer\s+/i.test(value)) {
    return "Bearer [REDACTED]";
  }

  return value
    .replace(/(client_secret=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(refresh_token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(access_token=)[^&\s]+/gi, "$1[REDACTED]");
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : String(error),
  };
}

function isSimpleValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
