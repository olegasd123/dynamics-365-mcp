import { AsyncLocalStorage } from "node:async_hooks";

const cacheRefreshContext = new AsyncLocalStorage<boolean>();

export function withCacheRefresh<T>(refresh: boolean, callback: () => T): T {
  return cacheRefreshContext.run(refresh, callback);
}

export function isCacheRefreshRequested(): boolean {
  return cacheRefreshContext.getStore() === true;
}
