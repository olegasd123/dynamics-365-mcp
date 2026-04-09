import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LEGACY_TOOL_NAME_SUFFIX = "commentary";
const instrumentedServers = new WeakSet<object>();

type ToolRequestHandler = (request: unknown, extra: unknown) => Promise<unknown>;

interface InternalServerWithHandlers {
  _requestHandlers?: Map<string, ToolRequestHandler>;
}

interface InternalMcpServerTools {
  _registeredTools?: Record<string, unknown>;
}

export function installToolCallCompatibility(server: McpServer): void {
  if (instrumentedServers.has(server as object)) {
    return;
  }

  const internalServer = server.server as unknown as InternalServerWithHandlers;
  const requestHandlers = internalServer._requestHandlers;
  const originalHandler = requestHandlers?.get("tools/call");
  if (!requestHandlers || !originalHandler) {
    instrumentedServers.add(server as object);
    return;
  }

  requestHandlers.set("tools/call", async (request, extra) => {
    const requestedName = getRequestedToolName(request);
    if (!requestedName) {
      return await originalHandler(request, extra);
    }

    const canonicalName = resolveCanonicalToolName(server, requestedName);
    if (canonicalName === requestedName) {
      return await originalHandler(request, extra);
    }

    return await originalHandler(replaceRequestedToolName(request, canonicalName), extra);
  });

  instrumentedServers.add(server as object);
}

function getRequestedToolName(request: unknown): string | undefined {
  if (!request || typeof request !== "object") {
    return undefined;
  }

  const params = (request as { params?: unknown }).params;
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const name = (params as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function replaceRequestedToolName(request: unknown, toolName: string): unknown {
  if (!request || typeof request !== "object") {
    return request;
  }

  const params = (request as { params?: unknown }).params;
  if (!params || typeof params !== "object") {
    return request;
  }

  return {
    ...(request as Record<string, unknown>),
    params: {
      ...(params as Record<string, unknown>),
      name: toolName,
    },
  };
}

function resolveCanonicalToolName(server: McpServer, requestedName: string): string {
  if (
    !requestedName ||
    !requestedName.endsWith(LEGACY_TOOL_NAME_SUFFIX) ||
    requestedName === LEGACY_TOOL_NAME_SUFFIX
  ) {
    return requestedName;
  }

  const candidate = requestedName.slice(0, -LEGACY_TOOL_NAME_SUFFIX.length);
  if (!candidate) {
    return requestedName;
  }

  const registeredTools = (server as unknown as InternalMcpServerTools)._registeredTools || {};
  return candidate in registeredTools ? candidate : requestedName;
}
