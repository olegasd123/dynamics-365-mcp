import type { AppConfig, EnvironmentConfig } from "../../config/types.js";

export const EXPECTED_TOOL_NAMES = [
  "analyze_impact",
  "analyze_update_triggers",
  "compare_custom_apis",
  "compare_environment_matrix",
  "compare_forms",
  "compare_plugin_assemblies",
  "compare_security_roles",
  "compare_solutions",
  "compare_table_schema",
  "compare_views",
  "compare_web_resources",
  "compare_workflows",
  "environment_health_report",
  "find_column_usage",
  "find_table_usage",
  "find_web_resource_usage",
  "get_custom_api_details",
  "get_flow_details",
  "get_form_details",
  "get_plugin_assembly_details",
  "get_plugin_details",
  "get_role_privileges",
  "get_solution_dependencies",
  "get_solution_details",
  "get_table_schema",
  "get_view_details",
  "get_view_fetchxml",
  "get_web_resource_content",
  "get_workflow_details",
  "list_actions",
  "list_cloud_flows",
  "list_custom_apis",
  "list_forms",
  "list_plugin_assemblies",
  "list_plugin_assembly_images",
  "list_plugin_assembly_steps",
  "list_plugin_steps",
  "list_plugins",
  "list_security_roles",
  "list_solutions",
  "list_table_columns",
  "list_table_relationships",
  "list_tables",
  "list_views",
  "list_web_resources",
  "list_workflows",
] as const;

export const REMOVED_LEGACY_TOOL_NAMES = [
  "compare_plugins",
  "list_plugin_images",
] as const;

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export class FakeServer {
  private readonly handlers = new Map<string, ToolHandler>();

  tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  getHandler(name: string): ToolHandler {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Tool '${name}' is not registered`);
    }
    return handler;
  }

  getToolNames(): string[] {
    return [...this.handlers.keys()].sort((left, right) => left.localeCompare(right));
  }
}

export function createTestConfig(environmentNames: string[]): AppConfig {
  return {
    environments: environmentNames.map((name) => ({
      name,
      url: `https://${name}.crm.dynamics.com`,
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
    })),
    defaultEnvironment: environmentNames[0],
  };
}

export function createRecordingClient(datasets: Record<string, Record<string, unknown>>) {
  const calls: Array<{ environment: string; entitySet: string; queryParams?: string }> = [];

  function getDatasetValue(envName: string, key: string): unknown {
    return (datasets[envName] || {})[key];
  }

  const client = {
    async query<T>(env: EnvironmentConfig, entitySet: string, queryParams?: string): Promise<T[]> {
      calls.push({
        environment: env.name,
        entitySet,
        queryParams,
      });
      const value = getDatasetValue(env.name, entitySet);
      return (Array.isArray(value) ? value : []) as T[];
    },
    async queryPath<T>(
      env: EnvironmentConfig,
      resourcePath: string,
      queryParams?: string,
    ): Promise<T[]> {
      calls.push({
        environment: env.name,
        entitySet: resourcePath,
        queryParams,
      });
      const value = getDatasetValue(env.name, resourcePath);
      return (Array.isArray(value) ? value : []) as T[];
    },
    async getPath<T>(
      env: EnvironmentConfig,
      resourcePath: string,
      queryParams?: string,
    ): Promise<T | null> {
      calls.push({
        environment: env.name,
        entitySet: resourcePath,
        queryParams,
      });
      const value = getDatasetValue(env.name, resourcePath);
      if (value === undefined) {
        return null;
      }
      if (Array.isArray(value)) {
        return ((value[0] ?? null) as T | null) ?? null;
      }
      return value as T;
    },
  };

  return { client: client as never, calls };
}
