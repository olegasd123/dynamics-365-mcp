import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TokenManager } from "../../auth/token-manager.js";
import { DynamicsClient } from "../../client/dynamics-client.js";
import { loadConfig } from "../../config/environments.js";
import { registerAllTools } from "../index.js";
import { EXPECTED_TOOL_NAMES } from "./tool-test-helpers.js";
import { installToolCallCompatibility } from "../../tool-call-compatibility.js";

const LIVE_FLAG = process.env.D365_MCP_ENABLE_LIVE === "1";
const DEFAULT_FIXTURES_PATH = "live-fixtures.json";
const DEFAULT_TOOL_TIMEOUT_MS = 90_000;
const RELEASE_GATE_TIMEOUT_MS = 5 * 60 * 1000;

type ToolName = (typeof EXPECTED_TOOL_NAMES)[number];

const runnableLiveToolCaseSchema = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    arguments: z.record(z.string(), z.unknown()),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const skippedLiveToolCaseSchema = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    skipReason: z.string().min(1),
  })
  .strict();

const liveFixturesSchema = z
  .object({
    tools: z.record(
      z.enum(EXPECTED_TOOL_NAMES),
      z.array(z.union([runnableLiveToolCaseSchema, skippedLiveToolCaseSchema])).min(1),
    ),
  })
  .strict();

type LiveFixtures = z.infer<typeof liveFixturesSchema>;
type RunnableLiveToolCase = z.infer<typeof runnableLiveToolCaseSchema>;
type SkippedLiveToolCase = z.infer<typeof skippedLiveToolCaseSchema>;
type ConfiguredLiveToolCase = RunnableLiveToolCase | SkippedLiveToolCase;

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface RecordedRequest {
  method: "query" | "queryPath" | "getPath";
  environment: string;
  resourcePath: string;
  queryParams?: string;
}

interface ToolRunSummary {
  toolName: ToolName;
  caseName: string;
  requestCount: number;
  requests: RecordedRequest[];
}

interface ToolRunFailure {
  toolName: ToolName;
  caseName: string;
  arguments: Record<string, unknown>;
  error: string;
  requests: RecordedRequest[];
}

interface ToolRunSkip {
  toolName: ToolName;
  caseName: string;
  reason: string;
}

interface SelectedLiveToolCase {
  toolName: ToolName;
  caseName: string;
  arguments: Record<string, unknown> | null;
  skipReason: string | null;
  timeoutMs?: number;
}

function isSkippedLiveToolCase(toolCase: ConfiguredLiveToolCase): toolCase is SkippedLiveToolCase {
  return "skipReason" in toolCase;
}

function isEnabledLiveToolCase(toolCase: ConfiguredLiveToolCase): boolean {
  return toolCase.enabled !== false;
}

function loadLiveFixtures(): LiveFixtures {
  const path = resolve(process.env.D365_MCP_LIVE_FIXTURES || DEFAULT_FIXTURES_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `Live fixtures file not found: ${path}. Copy 'live-fixtures.example.json' to 'live-fixtures.json' or set D365_MCP_LIVE_FIXTURES.`,
    );
  }

  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return liveFixturesSchema.parse(parsed);
}

async function createConnectedLiveClient(client: DynamicsClient) {
  const server = new McpServer({
    name: "live-tool-test-server",
    version: "1.0.0",
  });
  const config = loadConfig();
  registerAllTools(server, config, client);
  installToolCallCompatibility(server);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({
    name: "live-tool-test-client",
    version: "1.0.0",
  });

  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  return {
    client: mcpClient,
    async close() {
      await Promise.allSettled([mcpClient.close(), server.close()]);
    },
  };
}

function getLiveToolTimeoutMs(): number {
  const raw = process.env.D365_MCP_LIVE_TOOL_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TOOL_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TOOL_TIMEOUT_MS;
}

function getSelectedLiveTools(): ToolName[] {
  const raw = process.env.D365_MCP_LIVE_TOOLS?.trim();
  if (!raw) {
    return [...EXPECTED_TOOL_NAMES];
  }

  const requestedTools = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedTools = requestedTools.filter((toolName): toolName is ToolName =>
    EXPECTED_TOOL_NAMES.includes(toolName as ToolName),
  );

  if (selectedTools.length === 0) {
    throw new Error(
      `D365_MCP_LIVE_TOOLS did not match any known tool names. Requested: ${requestedTools.join(", ")}`,
    );
  }

  return selectedTools;
}

function getToolCaseLabel(
  toolName: ToolName,
  toolCase: ConfiguredLiveToolCase,
  caseIndex: number,
): string {
  return toolCase.name?.trim() || `${toolName} case ${caseIndex + 1}`;
}

function getToolTimeoutMs(toolName: ToolName, toolCase: RunnableLiveToolCase): number {
  const configuredTimeoutMs = toolCase.timeoutMs ?? 0;
  const toolTimeoutMs = toolName === "release_gate_report" ? RELEASE_GATE_TIMEOUT_MS : 0;

  return Math.max(configuredTimeoutMs, toolTimeoutMs);
}

function getSelectedLiveCases(
  fixtures: LiveFixtures,
  selectedTools: ToolName[],
): SelectedLiveToolCase[] {
  return selectedTools.flatMap((toolName) => {
    const configuredCases = fixtures.tools[toolName];

    if (!configuredCases || configuredCases.length === 0) {
      throw new Error(
        `Missing live fixture cases for '${toolName}'. Add at least one case under tools.${toolName}.`,
      );
    }

    return configuredCases.map((toolCase, caseIndex) => {
      const caseName = getToolCaseLabel(toolName, toolCase, caseIndex);

      if (!isEnabledLiveToolCase(toolCase)) {
        return {
          toolName,
          caseName,
          arguments: null,
          skipReason: "Disabled in live-fixtures.json.",
        };
      }

      if (isSkippedLiveToolCase(toolCase)) {
        return {
          toolName,
          caseName,
          arguments: null,
          skipReason: toolCase.skipReason,
        };
      }

      return {
        toolName,
        caseName,
        arguments: toolCase.arguments,
        skipReason: null,
        timeoutMs: getToolTimeoutMs(toolName, toolCase),
      };
    });
  });
}

function installRequestRecorder(client: DynamicsClient) {
  const recordedRequests: RecordedRequest[] = [];

  const originalQuery = client.query.bind(client);
  const originalQueryPath = client.queryPath.bind(client);
  const originalGetPath = client.getPath.bind(client);

  client.query = (async (env, entitySet, queryParams, options) => {
    recordedRequests.push({
      method: "query",
      environment: env.name,
      resourcePath: entitySet,
      queryParams,
    });
    return originalQuery(env, entitySet, queryParams, options);
  }) as DynamicsClient["query"];

  client.queryPath = (async (env, resourcePath, queryParams, options) => {
    recordedRequests.push({
      method: "queryPath",
      environment: env.name,
      resourcePath,
      queryParams,
    });
    return originalQueryPath(env, resourcePath, queryParams, options);
  }) as DynamicsClient["queryPath"];

  client.getPath = (async (env, resourcePath, queryParams) => {
    recordedRequests.push({
      method: "getPath",
      environment: env.name,
      resourcePath,
      queryParams,
    });
    return originalGetPath(env, resourcePath, queryParams);
  }) as DynamicsClient["getPath"];

  return {
    reset() {
      recordedRequests.length = 0;
    },
    getAll(): RecordedRequest[] {
      return [...recordedRequests];
    },
  };
}

function getToolResponseError(response: ToolResponse): string | null {
  if (response.isError) {
    return String(response.content[0]?.text || "Unknown tool error");
  }

  const structured = response.structuredContent;
  if (structured && structured.ok === false) {
    const error = structured.error;
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return String(response.content[0]?.text || "Unknown structured error");
  }

  return null;
}

function formatRecordedRequest(request: RecordedRequest): string {
  return `${request.method} ${request.environment} ${request.resourcePath}${
    request.queryParams ? `?${request.queryParams}` : ""
  }`;
}

function logCoverageSummary(results: ToolRunSummary[]) {
  console.info("");
  console.info("[live] CRM request coverage");

  for (const result of results) {
    console.info(
      `[live] ${result.toolName} / ${result.caseName}: ${result.requestCount} request(s)`,
    );
  }
}

function logFailureSummary(failures: ToolRunFailure[]) {
  if (failures.length === 0) {
    return;
  }

  console.info("");
  console.info("[live] Failures");

  for (const failure of failures) {
    console.info(`[live] ${failure.toolName} / ${failure.caseName}`);
    console.info(`[live]   arguments: ${JSON.stringify(failure.arguments)}`);
    console.info(`[live]   error: ${failure.error}`);
    if (failure.requests.length === 0) {
      console.info("[live]   requests: none");
      continue;
    }
    for (const request of failure.requests) {
      console.info(`[live]   request: ${formatRecordedRequest(request)}`);
    }
  }
}

function logSkipSummary(skips: ToolRunSkip[]) {
  if (skips.length === 0) {
    return;
  }

  console.info("");
  console.info("[live] Skipped");

  for (const skip of skips) {
    console.info(`[live] ${skip.toolName} / ${skip.caseName}: ${skip.reason}`);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs} ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

const describeLive = LIVE_FLAG ? describe : describe.skip;

describeLive("live tool smoke tests", () => {
  it(
    "calls every tool with real CRM data and records request coverage",
    async () => {
      const fixtures = loadLiveFixtures();
      const tokenManager = new TokenManager();
      const selectedCases = getSelectedLiveCases(fixtures, getSelectedLiveTools());
      const defaultToolTimeoutMs = getLiveToolTimeoutMs();
      const results: ToolRunSummary[] = [];
      const failures: ToolRunFailure[] = [];
      const skips: ToolRunSkip[] = [];

      for (const [index, selectedCase] of selectedCases.entries()) {
        const { toolName, caseName, arguments: args, skipReason } = selectedCase;

        if (skipReason) {
          skips.push({ toolName, caseName, reason: skipReason });
          console.info(
            `[live] [${index + 1}/${selectedCases.length}] ${toolName} / ${caseName} skipped (${skipReason})`,
          );
          continue;
        }

        const client = new DynamicsClient(tokenManager);
        const recorder = installRequestRecorder(client);
        const harness = await createConnectedLiveClient(client);
        const effectiveToolTimeoutMs = Math.max(defaultToolTimeoutMs, selectedCase.timeoutMs ?? 0);

        console.info(
          `[live] [${index + 1}/${selectedCases.length}] starting ${toolName} / ${caseName}`,
        );

        try {
          const response = (await withTimeout(
            harness.client.callTool(
              {
                name: toolName,
                arguments: args ?? {},
              },
              undefined,
              {
                timeout: effectiveToolTimeoutMs,
                maxTotalTimeout: effectiveToolTimeoutMs,
              },
            ) as Promise<ToolResponse>,
            effectiveToolTimeoutMs,
            `Tool '${toolName}'`,
          )) as ToolResponse;
          const requests = recorder.getAll();
          const error = getToolResponseError(response);

          if (error) {
            failures.push({
              toolName,
              caseName,
              arguments: args ?? {},
              error,
              requests,
            });
            console.info(
              `[live] [${index + 1}/${selectedCases.length}] ${toolName} / ${caseName} failed`,
            );
            continue;
          }

          if (requests.length === 0) {
            failures.push({
              toolName,
              caseName,
              arguments: args ?? {},
              error: "Tool completed without any recorded CRM request.",
              requests,
            });
            console.info(
              `[live] [${index + 1}/${selectedCases.length}] ${toolName} / ${caseName} failed`,
            );
            continue;
          }

          results.push({
            toolName,
            caseName,
            requestCount: requests.length,
            requests,
          });

          console.info(
            `[live] [${index + 1}/${selectedCases.length}] ${toolName} / ${caseName} ok (${requests.length} request(s))`,
          );
        } catch (error) {
          const requests = recorder.getAll();
          failures.push({
            toolName,
            caseName,
            arguments: args ?? {},
            error: error instanceof Error ? error.message : String(error),
            requests,
          });
          console.info(
            `[live] [${index + 1}/${selectedCases.length}] ${toolName} / ${caseName} failed`,
          );
        } finally {
          await Promise.race([
            harness.close(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        }
      }

      logCoverageSummary(results);
      logSkipSummary(skips);
      logFailureSummary(failures);

      expect(
        failures.length,
        failures
          .map((failure) =>
            [
              `Tool '${failure.toolName}' case '${failure.caseName}' failed.`,
              `Arguments: ${JSON.stringify(failure.arguments)}`,
              `Error: ${failure.error}`,
              "Recorded CRM requests:",
              ...(failure.requests.length === 0
                ? ["- none"]
                : failure.requests.map((request) => `- ${formatRecordedRequest(request)}`)),
            ].join("\n"),
          )
          .join("\n\n"),
      ).toBe(0);
    },
    20 * 60 * 1000,
  );
});
