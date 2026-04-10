import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_MAX_PARALLEL,
  getLiveMaxParallel,
  getSelectedLiveCases,
  mapWithConcurrencyLimit,
  type LiveFixtures,
} from "./live-test-support.js";

describe("live test support", () => {
  it("defaults live parallelism to one", () => {
    const fixtures = {
      tools: {
        analyze_impact: [
          {
            arguments: {
              environment: "dev",
              componentType: "column",
              table: "account",
              name: "name",
            },
          },
        ],
      },
    } as LiveFixtures;

    expect(getLiveMaxParallel(fixtures)).toBe(DEFAULT_LIVE_MAX_PARALLEL);
  });

  it("reads live parallelism from execution config", () => {
    const fixtures = {
      execution: {
        maxParallel: 3,
      },
      tools: {
        analyze_impact: [
          {
            arguments: {
              environment: "dev",
              componentType: "column",
              table: "account",
              name: "name",
            },
          },
        ],
      },
    } as LiveFixtures;

    expect(getLiveMaxParallel(fixtures)).toBe(3);
  });

  it("keeps per-case timeout and disabled cases when building selected cases", () => {
    const fixtures = {
      execution: {
        maxParallel: 2,
      },
      tools: {
        analyze_impact: [
          {
            name: "main case",
            arguments: {
              environment: "dev",
              componentType: "column",
              table: "account",
              name: "name",
            },
            timeoutMs: 1200,
          },
          {
            name: "disabled case",
            enabled: false,
            arguments: {
              environment: "dev",
              componentType: "column",
              table: "account",
              name: "name",
            },
          },
        ],
      },
    } as LiveFixtures;

    const cases = getSelectedLiveCases(fixtures, ["analyze_impact"], (toolName, toolCase) => {
      expect(toolName).toBe("analyze_impact");
      return toolCase.timeoutMs ?? 0;
    });

    expect(cases).toEqual([
      {
        toolName: "analyze_impact",
        caseName: "main case",
        arguments: {
          environment: "dev",
          componentType: "column",
          table: "account",
          name: "name",
        },
        skipReason: null,
        timeoutMs: 1200,
      },
      {
        toolName: "analyze_impact",
        caseName: "disabled case",
        arguments: null,
        skipReason: "Disabled in live-fixtures.json.",
      },
    ]);
  });

  it("runs work with a concurrency limit", async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrencyLimit([0, 1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 2;
    });

    expect(results).toEqual([0, 2, 4, 6, 8]);
    expect(peak).toBe(2);
  });
});
