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

const FIXTURE_ID_PATTERN =
  /^(account|action|alm|api|app|asm|assembly|bpf|bu|chart|col|column|comp|condition|conn|contact|dash|dashboard|def|dep|dev|duplicate|email|entity|env|field|flow|form|image|img|job|key|layer|metadata|msg|opp|priv|process|prod|profile|pub|publisher|rel|relationship|role|root|rp|rule|sc|sitemap|sol|solution|stage|step|table|template|trace|type|user|value|view|webresource|wf|workflow|wr)(?:[-_][a-z0-9]+)+$/i;
const fixtureIdsByGuid = new Map<string, string>();

export function fixtureGuid(value: string): string {
  let hash = 0;

  for (const char of value.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  const suffix = hash.toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${suffix}`;
}

function isFixtureId(value: string): boolean {
  return FIXTURE_ID_PATTERN.test(value);
}

function isIdField(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  return (
    normalizedKey === "id" ||
    normalizedKey === "objectid" ||
    normalizedKey === "appmoduleidunique" ||
    normalizedKey === "_appmoduleidunique_value" ||
    normalizedKey.endsWith("id") ||
    normalizedKey.endsWith("_value") ||
    normalizedKey.includes("id_value") ||
    key === "MetadataId" ||
    key === "ObjectId"
  );
}

function normalizeFixtureString(value: string): string {
  if (!isFixtureId(value)) {
    return value;
  }

  const guid = fixtureGuid(value);
  fixtureIdsByGuid.set(guid, value);
  return guid;
}

function normalizeFixturePath(value: string): string {
  return value.replace(/[a-z][a-z0-9]*(?:[-_][a-z0-9]+)+/gi, (match) =>
    isFixtureId(match) ? normalizeFixtureString(match) : match,
  );
}

function denormalizeFixtureString(value: string): string {
  let result = value;

  for (const [guid, fixtureId] of fixtureIdsByGuid) {
    result = result.replaceAll(guid, fixtureId);
  }

  return result;
}

export function denormalizeFixtureIds<T>(value: T): T {
  if (typeof value === "string") {
    return denormalizeFixtureString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => denormalizeFixtureIds(item)) as T;
  }

  if (value instanceof Set) {
    return new Set([...value].map((item) => denormalizeFixtureIds(item))) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      denormalizeFixtureString(key),
      denormalizeFixtureIds(item),
    ]),
  ) as T;
}

function normalizeFixtureIds(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") {
    return parentKey && isIdField(parentKey) ? normalizeFixtureString(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFixtureIds(item, parentKey));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      normalizeFixturePath(key),
      normalizeFixtureIds(item, key),
    ]),
  );
}

function normalizeFixtureArgs(value: unknown, parentKey?: string): unknown {
  if (typeof value === "string") {
    if (parentKey === "componentType") {
      return value;
    }
    return normalizeFixtureString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFixtureArgs(item, parentKey));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeFixtureArgs(item, key)]),
  );
}

export class FakeServer {
  private readonly handlers = new Map<string, ToolHandler>();

  tool(name: string, _description: string, _schema: unknown, handler: ToolHandler): void {
    this.handlers.set(name, async (args, extra) =>
      denormalizeFixtureIds(await handler(normalizeFixtureArgs(args) as never, extra)),
    );
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
  const normalizedDatasets = normalizeFixtureIds(datasets) as Record<
    string,
    Record<string, unknown>
  >;
  const calls: Array<{ environment: string; entitySet: string; queryParams?: string }> = [];

  function getDatasetValue(envName: string, key: string): unknown {
    return (normalizedDatasets[envName] || {})[normalizeFixturePath(key)];
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
        entitySet: denormalizeFixtureString(entitySet),
        queryParams: queryParams ? denormalizeFixtureString(queryParams) : undefined,
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
        entitySet: denormalizeFixtureString(resourcePath),
        queryParams: queryParams ? denormalizeFixtureString(queryParams) : undefined,
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
        entitySet: denormalizeFixtureString(datasetKey),
        queryParams: queryParams ? denormalizeFixtureString(queryParams) : undefined,
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
        entitySet: denormalizeFixtureString(datasetKey),
        queryParams: queryParams ? denormalizeFixtureString(queryParams) : undefined,
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
        entitySet: denormalizeFixtureString(resourcePath),
        queryParams: queryParams ? denormalizeFixtureString(queryParams) : undefined,
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
        entitySet: denormalizeFixtureString(actionPath),
        queryParams: body ? denormalizeFixtureString(JSON.stringify(body)) : undefined,
      });
      const value = getDatasetValue(env.name, actionPath);
      return (value || {}) as T;
    },
  };

  return { client: client as never, calls };
}
