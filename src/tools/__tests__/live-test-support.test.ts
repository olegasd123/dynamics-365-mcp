import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  countConfiguredLiveCases,
  countRunnableLiveCases,
  DEFAULT_LIVE_MAX_PARALLEL,
  DEFAULT_MAX_LOGGED_REQUEST_CHARS,
  DEFAULT_MAX_LOGGED_REQUESTS,
  getLiveMaxParallel,
  loadLiveFixtures,
  getMaxLoggedRequestChars,
  getMaxLoggedRequests,
  getSelectedLiveCases,
  mapWithConcurrencyLimit,
  type LiveFixtures,
} from "./live-test-support.js";
import { formatFailuresAssertionMessage } from "./live-test-reporting.js";
import { createTestConfig, getExpectedToolNames } from "./tool-test-helpers.js";

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
    expect(getMaxLoggedRequests(fixtures)).toBe(DEFAULT_MAX_LOGGED_REQUESTS);
    expect(getMaxLoggedRequestChars(fixtures)).toBe(DEFAULT_MAX_LOGGED_REQUEST_CHARS);
  });

  it("reads live parallelism from execution config", () => {
    const fixtures = {
      execution: {
        maxParallel: 3,
        maxLoggedRequests: 5,
        maxLoggedRequestChars: 120,
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
    expect(getMaxLoggedRequests(fixtures)).toBe(5);
    expect(getMaxLoggedRequestChars(fixtures)).toBe(120);
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

    expect(countConfiguredLiveCases(fixtures, ["analyze_impact"])).toBe(2);
    expect(countRunnableLiveCases(cases)).toBe(1);
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

  it("loads the tracked example fixtures for every tool, including ribbons", () => {
    const fixtures = loadLiveFixtures(
      fileURLToPath(new URL("../../../live-fixtures.example.json", import.meta.url)),
    );
    const expectedToolNames = getExpectedToolNames(createTestConfig(["dev"]));

    expect(() => getSelectedLiveCases(fixtures, expectedToolNames as never, () => 0)).not.toThrow();
    expect(fixtures.tools.list_table_ribbons).toHaveLength(1);
    expect(fixtures.tools.get_ribbon_button_details).toHaveLength(1);
  });

  it("limits request details in live failure messages", () => {
    const message = formatFailuresAssertionMessage(
      [
        {
          toolName: "analyze_impact",
          caseName: "big request log",
          arguments: { environment: "dev" },
          error: "expected 1 to be +0",
          requests: [
            {
              method: "queryPath",
              environment: "synergie-dev",
              resourcePath: "EntityDefinitions(LogicalName='account')/Attributes",
              queryParams: "$select=LogicalName&$orderby=LogicalName asc",
            },
            {
              method: "queryPath",
              environment: "synergie-dev",
              resourcePath: "EntityDefinitions(LogicalName='contact')/Attributes",
              queryParams: "$select=LogicalName&$orderby=LogicalName asc",
            },
          ],
        },
      ],
      {
        maxLoggedRequests: 1,
        maxLoggedRequestChars: 40,
      },
    );

    expect(message).toContain("requests: 2 recorded, showing 1");
    expect(message).toContain("requests: 1 more not shown");
    expect(message).toContain("request: queryPath synergie-dev EntityDefiniti...");
    expect(message).not.toContain("contact");
  });
});
