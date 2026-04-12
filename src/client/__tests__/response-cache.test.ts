import { describe, expect, it, vi } from "vitest";
import { ResponseCache } from "../response-cache.js";

describe("ResponseCache", () => {
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
