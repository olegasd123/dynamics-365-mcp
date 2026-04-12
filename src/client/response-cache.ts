interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

interface ResponseCacheLoadOptions {
  bypass?: boolean;
  ttlMs: number;
}

interface ResponseCacheOptions {
  cloneValue?: <T>(value: T) => T;
  maxEntries?: number;
  now?: () => number;
}

const DEFAULT_MAX_CACHE_ENTRIES = 500;

export class ResponseCache {
  private readonly cloneValueFn: <T>(value: T) => T;
  private readonly entries = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly pendingRequests = new Map<string, Promise<unknown>>();

  constructor(options: ResponseCacheOptions = {}) {
    this.cloneValueFn = options.cloneValue ?? cloneValue;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  getHealthSnapshot(): {
    pendingRequestCount: number;
    responseCacheEntries: number;
  } {
    this.deleteExpiredEntries();
    return {
      responseCacheEntries: this.entries.size,
      pendingRequestCount: this.pendingRequests.size,
    };
  }

  async load<T>(
    key: string,
    loader: () => Promise<T>,
    options: ResponseCacheLoadOptions,
  ): Promise<T> {
    if (options.bypass || options.ttlMs <= 0) {
      return loader();
    }

    this.deleteExpiredEntries();

    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.touch(key, cached);
      return this.cloneValueFn(cached.value as T);
    }

    const pending = this.pendingRequests.get(key);
    if (pending) {
      return this.cloneValueFn((await pending) as T);
    }

    const request = loader()
      .then((result) => {
        this.setEntry(key, {
          expiresAt: this.now() + options.ttlMs,
          value: this.cloneValueFn(result),
        });
        return result;
      })
      .finally(() => {
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, request);
    return this.cloneValueFn(await request);
  }

  clear(prefix?: string): void {
    if (!prefix) {
      this.entries.clear();
      this.pendingRequests.clear();
      return;
    }

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
      }
    }

    for (const key of this.pendingRequests.keys()) {
      if (key.startsWith(prefix)) {
        this.pendingRequests.delete(key);
      }
    }
  }

  private deleteExpiredEntries(): void {
    const now = this.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private enforceLimit(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) {
        return;
      }

      this.entries.delete(oldestKey);
    }
  }

  private setEntry(key: string, entry: CacheEntry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.enforceLimit();
  }

  private touch(key: string, entry: CacheEntry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
