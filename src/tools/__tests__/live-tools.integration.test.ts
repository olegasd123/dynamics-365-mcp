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

const liveFixturesSchema = z.object({
  environment: z.string().min(1),
  targetEnvironment: z.string().min(1),
  targetEnvironments: z.array(z.string().min(1)).min(1).optional(),
  solution: z.string().min(1),
  targetSolution: z.string().min(1).optional(),
  table: z.string().min(1),
  targetTable: z.string().min(1).optional(),
  column: z.string().min(1),
  pluginAssembly: z.string().min(1),
  pluginClass: z.string().min(1),
  workflowName: z.string().min(1),
  workflowUniqueName: z.string().min(1).optional(),
  formName: z.string().min(1),
  viewName: z.string().min(1),
  viewScope: z.enum(["system", "personal", "all"]).optional(),
  customApi: z.string().min(1),
  cloudFlow: z.string().min(1),
  securityRole: z.string().min(1),
  businessUnit: z.string().min(1).optional(),
  targetBusinessUnit: z.string().min(1).optional(),
  webResource: z.string().min(1),
  environmentVariable: z.string().min(1),
  connectionReference: z.string().min(1),
  appModule: z.string().min(1),
  dashboard: z.string().min(1),
});

type LiveFixtures = z.infer<typeof liveFixturesSchema>;
type ToolName = (typeof EXPECTED_TOOL_NAMES)[number];

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
  requestCount: number;
  requests: RecordedRequest[];
}

interface ToolRunFailure {
  toolName: ToolName;
  arguments: Record<string, unknown>;
  error: string;
  requests: RecordedRequest[];
}

interface LiveToolCase {
  buildArgs: (fixtures: LiveFixtures) => Record<string, unknown>;
}

const LIVE_TOOL_CASES = {
  analyze_create_triggers: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      providedAttributes: [fixtures.column],
    }),
  },
  analyze_impact: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      componentType: "column",
      table: fixtures.table,
      name: fixtures.column,
      maxDependencies: 20,
    }),
  },
  analyze_update_triggers: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      changedAttributes: [fixtures.column],
    }),
  },
  compare_custom_apis: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      apiName: fixtures.customApi,
    }),
  },
  compare_environment_matrix: {
    buildArgs: (fixtures) => ({
      baselineEnvironment: fixtures.environment,
      targetEnvironments: fixtures.targetEnvironments ?? [fixtures.targetEnvironment],
      componentType: "plugins",
      assemblyName: fixtures.pluginAssembly,
      maxRows: 10,
    }),
  },
  compare_forms: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      table: fixtures.table,
      formName: fixtures.formName,
      solution: fixtures.solution,
      targetSolution: fixtures.targetSolution ?? fixtures.solution,
    }),
  },
  compare_plugin_assemblies: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      assemblyName: fixtures.pluginAssembly,
    }),
  },
  compare_security_roles: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      roleName: fixtures.securityRole,
      ...(fixtures.businessUnit ? { sourceBusinessUnit: fixtures.businessUnit } : {}),
      ...(fixtures.targetBusinessUnit ? { targetBusinessUnit: fixtures.targetBusinessUnit } : {}),
    }),
  },
  compare_solutions: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      solution: fixtures.solution,
      targetSolution: fixtures.targetSolution ?? fixtures.solution,
    }),
  },
  compare_table_schema: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      table: fixtures.table,
      targetTable: fixtures.targetTable ?? fixtures.table,
    }),
  },
  compare_views: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      table: fixtures.table,
      scope: fixtures.viewScope ?? "system",
      viewName: fixtures.viewName,
      solution: fixtures.solution,
      targetSolution: fixtures.targetSolution ?? fixtures.solution,
    }),
  },
  compare_web_resources: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      nameFilter: fixtures.webResource,
    }),
  },
  compare_workflows: {
    buildArgs: (fixtures) => ({
      sourceEnvironment: fixtures.environment,
      targetEnvironment: fixtures.targetEnvironment,
      workflowName: fixtures.workflowName,
    }),
  },
  environment_health_report: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  find_column_usage: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      column: fixtures.column,
    }),
  },
  find_metadata: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      query: fixtures.table,
      limit: 10,
    }),
  },
  find_table_usage: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
    }),
  },
  find_web_resource_usage: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      name: fixtures.webResource,
    }),
  },
  get_app_module_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      appName: fixtures.appModule,
      solution: fixtures.solution,
    }),
  },
  get_connection_reference_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      referenceName: fixtures.connectionReference,
      solution: fixtures.solution,
    }),
  },
  get_custom_api_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      apiName: fixtures.customApi,
    }),
  },
  get_dashboard_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      dashboardName: fixtures.dashboard,
      solution: fixtures.solution,
    }),
  },
  get_environment_variable_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      variableName: fixtures.environmentVariable,
      solution: fixtures.solution,
    }),
  },
  get_flow_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      flowName: fixtures.cloudFlow,
      solution: fixtures.solution,
    }),
  },
  get_form_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      formName: fixtures.formName,
      table: fixtures.table,
      solution: fixtures.solution,
    }),
  },
  get_plugin_assembly_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      assemblyName: fixtures.pluginAssembly,
    }),
  },
  get_plugin_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      pluginName: fixtures.pluginClass,
      assemblyName: fixtures.pluginAssembly,
      solution: fixtures.solution,
    }),
  },
  get_role_privileges: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      roleName: fixtures.securityRole,
      ...(fixtures.businessUnit ? { businessUnit: fixtures.businessUnit } : {}),
    }),
  },
  get_solution_dependencies: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
      direction: "both",
      componentType: "web_resource",
      componentName: fixtures.webResource,
      maxRows: 20,
    }),
  },
  get_solution_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  get_table_schema: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      solution: fixtures.solution,
    }),
  },
  get_view_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      viewName: fixtures.viewName,
      table: fixtures.table,
      scope: fixtures.viewScope ?? "system",
      solution: fixtures.solution,
    }),
  },
  get_view_fetchxml: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      viewName: fixtures.viewName,
      table: fixtures.table,
      scope: fixtures.viewScope ?? "system",
      solution: fixtures.solution,
    }),
  },
  get_web_resource_content: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      name: fixtures.webResource,
    }),
  },
  get_workflow_details: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      ...(fixtures.workflowUniqueName
        ? { uniqueName: fixtures.workflowUniqueName }
        : { workflowName: fixtures.workflowName }),
    }),
  },
  list_actions: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  list_app_modules: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.appModule,
      solution: fixtures.solution,
    }),
  },
  list_cloud_flows: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.cloudFlow,
      solution: fixtures.solution,
    }),
  },
  list_connection_references: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.connectionReference,
      solution: fixtures.solution,
    }),
  },
  list_custom_apis: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.customApi,
    }),
  },
  list_dashboards: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.dashboard,
      solution: fixtures.solution,
    }),
  },
  list_environment_variables: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.environmentVariable,
      solution: fixtures.solution,
    }),
  },
  list_forms: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      solution: fixtures.solution,
      nameFilter: fixtures.formName,
    }),
  },
  list_plugin_assemblies: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  list_plugin_assembly_images: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      assemblyName: fixtures.pluginAssembly,
    }),
  },
  list_plugin_assembly_steps: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      assemblyName: fixtures.pluginAssembly,
    }),
  },
  list_plugin_steps: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      pluginName: fixtures.pluginClass,
      assemblyName: fixtures.pluginAssembly,
      solution: fixtures.solution,
    }),
  },
  list_plugins: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  list_security_roles: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.securityRole,
    }),
  },
  list_solutions: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.solution,
    }),
  },
  list_table_columns: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      solution: fixtures.solution,
    }),
  },
  list_table_relationships: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      solution: fixtures.solution,
    }),
  },
  list_tables: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.table,
      solution: fixtures.solution,
    }),
  },
  list_views: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      table: fixtures.table,
      scope: fixtures.viewScope ?? "system",
      nameFilter: fixtures.viewName,
      solution: fixtures.solution,
    }),
  },
  list_web_resources: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      nameFilter: fixtures.webResource,
      solution: fixtures.solution,
    }),
  },
  list_workflows: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
    }),
  },
  release_gate_report: {
    buildArgs: (fixtures) => ({
      environment: fixtures.environment,
      solution: fixtures.solution,
      targetEnvironment: fixtures.targetEnvironment,
    }),
  },
} satisfies Record<ToolName, LiveToolCase>;

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
    console.info(`[live] ${result.toolName}: ${result.requestCount} request(s)`);
  }
}

function logFailureSummary(failures: ToolRunFailure[]) {
  if (failures.length === 0) {
    return;
  }

  console.info("");
  console.info("[live] Failures");

  for (const failure of failures) {
    console.info(`[live] ${failure.toolName}`);
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
  it("defines one live case for every published tool", () => {
    expect(Object.keys(LIVE_TOOL_CASES).sort((left, right) => left.localeCompare(right))).toEqual(
      EXPECTED_TOOL_NAMES,
    );
  });

  it(
    "calls every tool with real CRM data and records request coverage",
    async () => {
      const fixtures = loadLiveFixtures();
      const tokenManager = new TokenManager();
      const toolTimeoutMs = getLiveToolTimeoutMs();
      const selectedTools = getSelectedLiveTools();
      const results: ToolRunSummary[] = [];
      const failures: ToolRunFailure[] = [];

      for (const [index, toolName] of selectedTools.entries()) {
        const client = new DynamicsClient(tokenManager);
        const recorder = installRequestRecorder(client);
        const harness = await createConnectedLiveClient(client);
        const args = LIVE_TOOL_CASES[toolName].buildArgs(fixtures);

        console.info(`[live] [${index + 1}/${selectedTools.length}] starting ${toolName}`);

        try {
          const response = (await withTimeout(
            harness.client.callTool({
              name: toolName,
              arguments: args,
            }) as Promise<ToolResponse>,
            toolTimeoutMs,
            `Tool '${toolName}'`,
          )) as ToolResponse;
          const requests = recorder.getAll();
          const error = getToolResponseError(response);

          if (error) {
            failures.push({
              toolName,
              arguments: args,
              error,
              requests,
            });
            console.info(`[live] [${index + 1}/${selectedTools.length}] ${toolName} failed`);
            continue;
          }

          if (requests.length === 0) {
            failures.push({
              toolName,
              arguments: args,
              error: "Tool completed without any recorded CRM request.",
              requests,
            });
            console.info(`[live] [${index + 1}/${selectedTools.length}] ${toolName} failed`);
            continue;
          }

          results.push({
            toolName,
            requestCount: requests.length,
            requests,
          });

          console.info(
            `[live] [${index + 1}/${selectedTools.length}] ${toolName} ok (${requests.length} request(s))`,
          );
        } catch (error) {
          const requests = recorder.getAll();
          failures.push({
            toolName,
            arguments: args,
            error: error instanceof Error ? error.message : String(error),
            requests,
          });
          console.info(`[live] [${index + 1}/${selectedTools.length}] ${toolName} failed`);
        } finally {
          await Promise.race([
            harness.close(),
            new Promise((resolve) => setTimeout(resolve, 1000)),
          ]);
        }
      }

      logCoverageSummary(results);
      logFailureSummary(failures);

      expect(
        failures.length,
        failures
          .map((failure) =>
            [
              `Tool '${failure.toolName}' failed.`,
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
