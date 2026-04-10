import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TokenManager } from "../../auth/token-manager.js";
import { DynamicsClient } from "../../client/dynamics-client.js";
import { loadConfig } from "../../config/environments.js";
import { registerAllTools } from "../index.js";
import type { ToolResponse } from "./tool-test-helpers.js";
import { installToolCallCompatibility } from "../../tool-call-compatibility.js";
import {
  countConfiguredLiveCases,
  countRunnableLiveCases,
  getMaxLoggedRequestChars,
  getMaxLoggedRequests,
  getLiveMaxParallel,
  getSelectedLiveCases,
  getSelectedLiveTools,
  loadLiveFixtures,
  mapWithConcurrencyLimit,
  type SelectedLiveToolCase,
  type ToolName,
} from "./live-test-support.js";

const LIVE_FLAG = process.env.D365_MCP_ENABLE_LIVE === "1";
const DEFAULT_TOOL_TIMEOUT_MS = 90_000;
const RELEASE_GATE_TIMEOUT_MS = 5 * 60 * 1000;

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

function getToolTimeoutMs(toolName: ToolName, toolCase: { timeoutMs?: number }): number {
  const configuredTimeoutMs = toolCase.timeoutMs ?? 0;
  const toolTimeoutMs = toolName === "release_gate_report" ? RELEASE_GATE_TIMEOUT_MS : 0;

  return Math.max(configuredTimeoutMs, toolTimeoutMs);
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

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function logCoverageSummary(results: ToolRunSummary[]) {
  console.info("");
  console.info("[live] CRM request coverage");

  for (const result of results) {
    console.info(
      `[live] [OK] ${result.toolName} / ${result.caseName}: ${result.requestCount} request(s)`,
    );
  }
}

function logFailureSummary(
  failures: ToolRunFailure[],
  requestLogOptions: { maxLoggedRequests: number; maxLoggedRequestChars: number },
) {
  if (failures.length === 0) {
    return;
  }

  console.info("");
  console.info("[live] Failures");

  for (const failure of failures) {
    console.info(`[live] [FAILED] ${failure.toolName} / ${failure.caseName}`);
    console.info(`[live]   arguments: ${JSON.stringify(failure.arguments)}`);
    console.info(`[live]   error: ${failure.error}`);
    logRequestSample(failure.requests, requestLogOptions);
  }
}

function logFailureDetails(
  failure: ToolRunFailure,
  requestLogOptions: { maxLoggedRequests: number; maxLoggedRequestChars: number },
): void {
  console.info(`[live]   error: ${failure.error}`);
  logRequestSample(failure.requests, requestLogOptions);
}

function logRequestSample(
  requests: RecordedRequest[],
  requestLogOptions: { maxLoggedRequests: number; maxLoggedRequestChars: number },
): void {
  if (requests.length === 0) {
    console.info("[live]   requests: none");
    return;
  }

  const shownRequests = requests.slice(0, requestLogOptions.maxLoggedRequests);
  console.info(`[live]   requests: ${requests.length} recorded, showing ${shownRequests.length}`);
  for (const request of shownRequests) {
    console.info(
      `[live]   request: ${truncateText(formatRecordedRequest(request), requestLogOptions.maxLoggedRequestChars)}`,
    );
  }
  if (requests.length > shownRequests.length) {
    console.info(`[live]   requests: ${requests.length - shownRequests.length} more not shown`);
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

type ToolRunOutcome =
  | { kind: "success"; summary: ToolRunSummary }
  | { kind: "failure"; failure: ToolRunFailure }
  | { kind: "skip"; skip: ToolRunSkip };

function getOrderedRunBuckets(
  completedOutcomes: Array<{ index: number; outcome: ToolRunOutcome }>,
): {
  results: ToolRunSummary[];
  failures: ToolRunFailure[];
  skips: ToolRunSkip[];
} {
  const orderedOutcomes = [...completedOutcomes].sort((left, right) => left.index - right.index);
  const results: ToolRunSummary[] = [];
  const failures: ToolRunFailure[] = [];
  const skips: ToolRunSkip[] = [];

  for (const { outcome } of orderedOutcomes) {
    if (outcome.kind === "success") {
      results.push(outcome.summary);
      continue;
    }

    if (outcome.kind === "failure") {
      failures.push(outcome.failure);
      continue;
    }

    skips.push(outcome.skip);
  }

  return { results, failures, skips };
}

async function runLiveToolCase(
  selectedCase: SelectedLiveToolCase,
  index: number,
  totalCases: number,
  tokenManager: TokenManager,
  defaultToolTimeoutMs: number,
  requestLogOptions: { maxLoggedRequests: number; maxLoggedRequestChars: number },
): Promise<ToolRunOutcome> {
  const { toolName, caseName, arguments: args, skipReason } = selectedCase;

  if (skipReason) {
    console.info(
      `[live] [${index + 1}/${totalCases}] [SKIPPED] ${toolName} / ${caseName} (${skipReason})`,
    );
    return {
      kind: "skip",
      skip: { toolName, caseName, reason: skipReason },
    };
  }

  const client = new DynamicsClient(tokenManager);
  const recorder = installRequestRecorder(client);
  const harness = await createConnectedLiveClient(client);
  const effectiveToolTimeoutMs = Math.max(defaultToolTimeoutMs, selectedCase.timeoutMs ?? 0);

  console.info(`[live] [${index + 1}/${totalCases}] starting ${toolName} / ${caseName}`);

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
      const failure: ToolRunFailure = {
        toolName,
        caseName,
        arguments: args ?? {},
        error,
        requests,
      };
      console.info(`[live] [${index + 1}/${totalCases}] [FAILED] ${toolName} / ${caseName}`);
      logFailureDetails(failure, requestLogOptions);
      return {
        kind: "failure",
        failure,
      };
    }

    if (requests.length === 0) {
      const failure: ToolRunFailure = {
        toolName,
        caseName,
        arguments: args ?? {},
        error: "Tool completed without any recorded CRM request.",
        requests,
      };
      console.info(`[live] [${index + 1}/${totalCases}] [FAILED] ${toolName} / ${caseName}`);
      logFailureDetails(failure, requestLogOptions);
      return {
        kind: "failure",
        failure,
      };
    }

    console.info(
      `[live] [${index + 1}/${totalCases}] [OK] ${toolName} / ${caseName} (${requests.length} request(s))`,
    );
    return {
      kind: "success",
      summary: {
        toolName,
        caseName,
        requestCount: requests.length,
        requests,
      },
    };
  } catch (error) {
    const requests = recorder.getAll();
    const failure: ToolRunFailure = {
      toolName,
      caseName,
      arguments: args ?? {},
      error: error instanceof Error ? error.message : String(error),
      requests,
    };
    console.info(`[live] [${index + 1}/${totalCases}] [FAILED] ${toolName} / ${caseName}`);
    logFailureDetails(failure, requestLogOptions);
    return {
      kind: "failure",
      failure,
    };
  } finally {
    await Promise.race([harness.close(), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
}

const describeLive = LIVE_FLAG ? describe : describe.skip;

describeLive("live tool smoke tests", () => {
  it(
    "calls every tool with real CRM data and records request coverage",
    async () => {
      const fixtures = loadLiveFixtures();
      const tokenManager = new TokenManager();
      const selectedTools = getSelectedLiveTools();
      const selectedCases = getSelectedLiveCases(fixtures, selectedTools, getToolTimeoutMs);
      const configuredCaseCount = countConfiguredLiveCases(fixtures, selectedTools);
      const runnableCaseCount = countRunnableLiveCases(selectedCases);
      const maxParallel = getLiveMaxParallel(fixtures);
      const requestLogOptions = {
        maxLoggedRequests: getMaxLoggedRequests(fixtures),
        maxLoggedRequestChars: getMaxLoggedRequestChars(fixtures),
      };
      const defaultToolTimeoutMs = getLiveToolTimeoutMs();
      const completedOutcomes: Array<{ index: number; outcome: ToolRunOutcome }> = [];

      console.info(
        `[live] running ${runnableCaseCount} runnable case(s) out of ${configuredCaseCount} configured case(s) with maxParallel=${maxParallel}`,
      );

      await mapWithConcurrencyLimit(selectedCases, maxParallel, async (selectedCase, index) => {
        const outcome = await runLiveToolCase(
          selectedCase,
          index,
          selectedCases.length,
          tokenManager,
          defaultToolTimeoutMs,
          requestLogOptions,
        );
        completedOutcomes.push({ index, outcome });
        return outcome;
      });

      const { results, failures, skips } = getOrderedRunBuckets(completedOutcomes);
      logCoverageSummary(results);
      logSkipSummary(skips);
      logFailureSummary(failures, requestLogOptions);

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
