import type { AppConfig, EnvironmentConfig } from "../../config/types.js";

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
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
  datasets: Record<string, Record<string, Record<string, unknown>[]>>,
) {
  const calls: Array<{ environment: string; entitySet: string; queryParams?: string }> = [];

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
      return ((datasets[env.name] || {})[entitySet] || []) as T[];
    },
  };

  return { client: client as never, calls };
}
