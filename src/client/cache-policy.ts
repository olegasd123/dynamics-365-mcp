export const CACHE_TIERS = {
  VOLATILE: "volatile",
  METADATA: "metadata",
  SCHEMA: "schema",
  NONE: "none",
} as const;

export type CacheTier = (typeof CACHE_TIERS)[keyof typeof CACHE_TIERS];

export interface CacheRequestOptions {
  bypassCache?: boolean;
  cacheTier?: CacheTier;
  cacheTtlMs?: number;
}

interface ResolvedCachePolicy {
  bypass: boolean;
  ttlMs: number;
}

const DEFAULT_CACHE_TTL_MS = 15_000;

const CACHE_TTL_BY_TIER: Record<Exclude<CacheTier, "none">, number> = {
  volatile: 15_000,
  metadata: 5 * 60_000,
  schema: 30 * 60_000,
};

const SCHEMA_ROOTS = new Set(["entitydefinitions", "savedqueries", "systemforms", "userqueries"]);

const METADATA_ROOTS = new Set([
  "appmodules",
  "businessunits",
  "customapirequestparameters",
  "customapiresponseproperties",
  "customapis",
  "pluginassemblies",
  "plugintypes",
  "privileges",
  "roleprivileges",
  "roles",
  "sdkmessageprocessingstepimages",
  "sdkmessageprocessingsteps",
  "solutioncomponents",
  "solutions",
  "webresourceset",
]);

const VOLATILE_ROOTS = new Set(["connectionreferences", "environmentvariablevalues", "workflows"]);

export function resolveCachePolicy(
  resourcePath: string,
  options?: CacheRequestOptions,
): ResolvedCachePolicy {
  if (options?.bypassCache || options?.cacheTier === CACHE_TIERS.NONE) {
    return { bypass: true, ttlMs: 0 };
  }

  if (typeof options?.cacheTtlMs === "number") {
    return {
      bypass: options.cacheTtlMs <= 0,
      ttlMs: options.cacheTtlMs,
    };
  }

  const tier = options?.cacheTier ?? inferCacheTier(resourcePath);
  if (!tier) {
    return { bypass: false, ttlMs: DEFAULT_CACHE_TTL_MS };
  }

  return {
    bypass: false,
    ttlMs: CACHE_TTL_BY_TIER[tier],
  };
}

function inferCacheTier(resourcePath: string): Exclude<CacheTier, "none"> | undefined {
  const root = getResourceRoot(resourcePath);
  if (!root) {
    return undefined;
  }

  if (SCHEMA_ROOTS.has(root)) {
    return CACHE_TIERS.SCHEMA;
  }

  if (METADATA_ROOTS.has(root)) {
    return CACHE_TIERS.METADATA;
  }

  if (VOLATILE_ROOTS.has(root)) {
    return CACHE_TIERS.VOLATILE;
  }

  return undefined;
}

function getResourceRoot(resourcePath: string): string {
  return resourcePath.trim().replace(/^\/+/, "").split(/[(/]/, 1)[0]?.toLowerCase() ?? "";
}
