import type { AppConfig, EnvironmentConfig } from "../../config/types.js";

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

export class FakeServer {
  private readonly handlers = new Map<string, ToolHandler>();

  tool(
    name: string,
    _description: string,
    _schema: unknown,
    handler: ToolHandler,
  ): void {
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

export function createRecordingClient(
  datasets: Record<string, Record<string, unknown>>,
) {
  const calls: Array<{ environment: string; entitySet: string; queryParams?: string }> = [];

  function getDatasetValue(envName: string, key: string): unknown {
    return (datasets[envName] || {})[key];
  }

  const client = {
    async query<T>(
      env: EnvironmentConfig,
      entitySet: string,
      queryParams?: string,
    ): Promise<T[]> {
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
