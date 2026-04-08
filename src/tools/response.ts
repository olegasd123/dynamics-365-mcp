import { requestLogger } from "../logging/request-logger.js";

interface ToolTextContent {
  type: "text";
  text: string;
}

export interface ToolSuccessPayload<TData extends Record<string, unknown>> {
  [key: string]: unknown;
  version: "1";
  tool: string;
  ok: true;
  summary: string;
  data: TData;
}

export interface ToolErrorPayload {
  [key: string]: unknown;
  version: "1";
  tool: string;
  ok: false;
  error: {
    name: string;
    message: string;
  };
}

export interface ToolResponse<TData extends Record<string, unknown> = Record<string, unknown>> {
  [key: string]: unknown;
  content: ToolTextContent[];
  structuredContent: ToolSuccessPayload<TData> | ToolErrorPayload;
  isError?: boolean;
}

export function createToolSuccessResponse<TData extends Record<string, unknown>>(
  tool: string,
  text: string,
  summary: string,
  data: TData,
): ToolResponse<TData> {
  const response: ToolResponse<TData> = {
    content: [{ type: "text", text }],
    structuredContent: {
      version: "1",
      tool,
      ok: true,
      summary,
      data,
    },
  };

  requestLogger.logToolResponse(tool, response);
  return response;
}

export function createToolErrorResponse(
  tool: string,
  error: unknown,
): ToolResponse<Record<string, unknown>> {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));

  const response: ToolResponse<Record<string, unknown>> = {
    content: [{ type: "text", text: `Error: ${normalizedError.message}` }],
    structuredContent: {
      version: "1",
      tool,
      ok: false,
      error: {
        name: normalizedError.name,
        message: normalizedError.message,
      },
    },
    isError: true,
  };

  requestLogger.logToolResponse(tool, response);
  requestLogger.logError(`tool-response:${tool}`, normalizedError);
  return response;
}
