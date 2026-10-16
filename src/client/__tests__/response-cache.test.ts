import { describe, expect, it, vi } from "vitest";
import { ResponseCache } from "../response-cache.js";
import { withCacheRefresh } from "../cache-context.js";

describe("ResponseCache", () => {
  it("replaces cached data on refresh and keeps other concurrent calls cached", async () => {
    const cache = new ResponseCache();
    const options = { ttlMs: 60_000 };
    await cache.load("dev|forms", async () => "old", options);
    await cache.load("prod|forms", async () => "prod-old", options);

    let resume!: () => void;
    const paused = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const refreshed = withCacheRefresh(true, async () => {
      await paused;
      return cache.load("dev|forms", async () => "new", options);
    });

    expect(await cache.load("dev|forms", async () => "unexpected", options)).toBe("old");
    resume();
    await expect(refreshed).resolves.toBe("new");
    expect(await cache.load("dev|forms", async () => "unexpected", options)).toBe("new");
    expect(await cache.load("prod|forms", async () => "unexpected", options)).toBe("prod-old");
  });

  it.each([true, false])(
    "does not let an older pending read replace a refresh (old completes first: %s)",
    async (oldCompletesFirst) => {
      const cache = new ResponseCache();
      const options = { ttlMs: 60_000 };
      let resolveOld!: (value: string) => void;
      let resolveNew!: (value: string) => void;
      const old = cache.load(
        "forms",
        () =>
          new Promise<string>((resolve) => {
            resolveOld = resolve;
          }),
        options,
      );
      const fresh = withCacheRefresh(true, () =>
        cache.load(
          "forms",
          () =>
            new Promise<string>((resolve) => {
              resolveNew = resolve;
            }),
          options,
        ),
      );

      if (oldCompletesFirst) {
        resolveOld("old");
        await old;
        expect(cache.getHealthSnapshot().pendingRequestCount).toBe(1);
      }
      resolveNew("new");
      await expect(fresh).resolves.toBe("new");
      if (!oldCompletesFirst) {
        resolveOld("old");
        await old;
      }
      expect(await cache.load("forms", async () => "unexpected", options)).toBe("new");
    },
  );

  it("retries after a failed refresh instead of returning the old entry", async () => {
    const cache = new ResponseCache();
    const options = { ttlMs: 60_000 };
    await cache.load("forms", async () => "old", options);
    await expect(
      withCacheRefresh(true, () =>
        cache.load(
          "forms",
          async () => {
            throw new Error("unavailable");
          },
          options,
        ),
      ),
    ).rejects.toThrow("unavailable");
    expect(await cache.load("forms", async () => "new", options)).toBe("new");
  });

  it("returns cloned cached values", async () => {
    const cache = new ResponseCache();
    const loader = vi.fn().mockResolvedValue([{ id: "1" }]);

    const first = await cache.load("dev|accounts", loader, { ttlMs: 1_000 });
    const second = await cache.load("dev|accounts", loader, { ttlMs: 1_000 });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("deduplicates concurrent loads for the same key", async () => {
    let resolveValue: ((value: string[]) => void) | undefined;
    const loader = vi.fn().mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveValue = resolve;
        }),
    );
    const cache = new ResponseCache();

    const first = cache.load("dev|accounts", loader, { ttlMs: 1_000 });
    const second = cache.load("dev|accounts", loader, { ttlMs: 1_000 });

    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);

    resolveValue?.(["a"]);

    await expect(Promise.all([first, second])).resolves.toEqual([["a"], ["a"]]);
  });

  it("evicts the least recently used entry when the cache is full", async () => {
    let now = 0;
    const cache = new ResponseCache({
      maxEntries: 2,
      now: () => now,
    });

    await cache.load("first", async () => "first", { ttlMs: 10 });
    await cache.load("second", async () => "second", { ttlMs: 10 });
    await cache.load("first", async () => "first-new", { ttlMs: 10 });
    await cache.load("third", async () => "third", { ttlMs: 10 });

    now += 1;

    const first = await cache.load("first", async () => "first-new", { ttlMs: 10 });
    const second = await cache.load("second", async () => "second-new", { ttlMs: 10 });

    expect(first).toBe("first");
    expect(second).toBe("second-new");
  });
});
