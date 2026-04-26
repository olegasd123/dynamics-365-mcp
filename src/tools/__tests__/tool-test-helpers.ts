import type { AppConfig, EnvironmentConfig } from "../../config/types.js";
export { KNOWN_TOOL_NAMES, getExpectedToolNames } from "../manifest.js";

export const REMOVED_LEGACY_TOOL_NAMES = ["compare_plugins", "list_plugin_images"] as const;

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  extra?: Record<string, unknown>,
) => Promise<ToolResponse>;

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

export function createTestConfig(
  environmentNames: string[],
  options?: {
    advancedQueries?: AppConfig["advancedQueries"];
  },
): AppConfig {
  return {
    environments: environmentNames.map((name) => ({
      name,
      url: `https://${name}.crm.dynamics.com`,
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
    })),
    defaultEnvironment: environmentNames[0],
    advancedQueries: options?.advancedQueries,
  };
}

export function createRecordingClient(datasets: Record<string, Record<string, unknown>>) {
  const calls: Array<{ environment: string; entitySet: string; queryParams?: string }> = [];

  function getDatasetValue(envName: string, key: string): unknown {
    return (datasets[envName] || {})[key];
  }

  function getDatasetArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
      return value as T[];
    }

    if (
      value &&
      typeof value === "object" &&
      "value" in value &&
      Array.isArray((value as { value?: unknown }).value)
    ) {
      return (value as { value: T[] }).value;
    }

    return [];
  }

  function getDatasetPage<T>(value: unknown): {
    items: T[];
    totalCount: number | null;
    nextLink: string | null;
  } {
    if (
      value &&
      typeof value === "object" &&
      "value" in value &&
      Array.isArray((value as { value?: unknown }).value)
    ) {
      return {
        items: (value as { value: T[] }).value,
        totalCount:
          typeof (value as { "@odata.count"?: unknown })["@odata.count"] === "number"
            ? ((value as { "@odata.count": number })["@odata.count"] ?? null)
            : null,
        nextLink:
          typeof (value as { "@odata.nextLink"?: unknown })["@odata.nextLink"] === "string"
            ? ((value as { "@odata.nextLink": string })["@odata.nextLink"] ?? null)
            : null,
      };
    }

    return {
      items: getDatasetArray<T>(value),
      totalCount: null,
      nextLink: null,
    };
  }

  const client = {
    async query<T>(env: EnvironmentConfig, entitySet: string, queryParams?: string): Promise<T[]> {
      calls.push({
        environment: env.name,
        entitySet,
        queryParams,
      });
      const value = getDatasetValue(env.name, entitySet);
      return getDatasetArray<T>(value);
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
      return getDatasetArray<T>(value);
    },
    async queryPage<T>(
      env: EnvironmentConfig,
      entitySet: string,
      queryParams?: string,
      options?: { pageLink?: string },
    ): Promise<{ items: T[]; totalCount: number | null; nextLink: string | null }> {
      const datasetKey = options?.pageLink || entitySet;
      calls.push({
        environment: env.name,
        entitySet: datasetKey,
        queryParams,
      });
      return getDatasetPage<T>(getDatasetValue(env.name, datasetKey));
    },
    async queryPagePath<T>(
      env: EnvironmentConfig,
      resourcePath: string,
      queryParams?: string,
      options?: { pageLink?: string },
    ): Promise<{ items: T[]; totalCount: number | null; nextLink: string | null }> {
      const datasetKey = options?.pageLink || resourcePath;
      calls.push({
        environment: env.name,
        entitySet: datasetKey,
        queryParams,
      });
      return getDatasetPage<T>(getDatasetValue(env.name, datasetKey));
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
      if (
        value &&
        typeof value === "object" &&
        "value" in value &&
        Array.isArray((value as { value?: unknown }).value)
      ) {
        return (((value as { value: T[] }).value[0] ?? null) as T | null) ?? null;
      }
      return value as T;
    },
    async invokeAction<T>(
      env: EnvironmentConfig,
      actionPath: string,
      body?: Record<string, unknown>,
    ): Promise<T> {
      calls.push({
        environment: env.name,
        entitySet: actionPath,
        queryParams: body ? JSON.stringify(body) : undefined,
      });
      const value = getDatasetValue(env.name, actionPath);
      return (value || {}) as T;
    },
  };

  return { client: client as never, calls };
}
