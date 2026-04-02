import { describe, expect, it } from "vitest";
import { buildMatrixReport, formatMatrixStatus } from "../matrix-helpers.js";

describe("buildMatrixReport", () => {
  it("builds drift rows and summaries for many environments", () => {
    const report = buildMatrixReport(
      [
        {
          environment: "dev",
          sourceItems: [{ name: "A" }, { name: "B" }, { name: "C" }],
          targetItems: [{ name: "A" }, { name: "B" }, { name: "D" }],
          result: {
            matching: 1,
            onlyInSource: [{ name: "C" }],
            onlyInTarget: [{ name: "D" }],
            differences: [
              {
                key: "B",
                source: { name: "B", version: "1.0" },
                target: { name: "B", version: "2.0" },
                changedFields: [{ field: "version", sourceValue: "1.0", targetValue: "2.0" }],
              },
            ],
          },
        },
        {
          environment: "test",
          sourceItems: [{ name: "A" }, { name: "B" }, { name: "C" }],
          targetItems: [{ name: "A" }, { name: "C" }, { name: "E" }],
          result: {
            matching: 2,
            onlyInSource: [{ name: "B" }],
            onlyInTarget: [{ name: "E" }],
            differences: [],
          },
        },
      ],
      (item) => item.name,
      10,
    );

    expect(report.summaries).toEqual([
      {
        environment: "dev",
        matching: 1,
        differences: 1,
        onlyInBaseline: 1,
        onlyInTarget: 1,
      },
      {
        environment: "test",
        matching: 2,
        differences: 0,
        onlyInBaseline: 1,
        onlyInTarget: 1,
      },
    ]);

    expect(report.rows).toEqual([
      {
        key: "B",
        statuses: { dev: "different", test: "only_in_baseline" },
      },
      {
        key: "C",
        statuses: { dev: "only_in_baseline", test: "same" },
      },
      {
        key: "D",
        statuses: { dev: "only_in_target", test: "absent" },
      },
      {
        key: "E",
        statuses: { dev: "absent", test: "only_in_target" },
      },
    ]);

    expect(report.differenceDetails).toEqual([
      {
        key: "B",
        fieldsByEnvironment: {
          dev: ["version"],
        },
      },
    ]);
  });

  it("limits the number of drift rows", () => {
    const report = buildMatrixReport(
      [
        {
          environment: "dev",
          sourceItems: [{ name: "A" }, { name: "B" }],
          targetItems: [{ name: "B" }, { name: "C" }],
          result: {
            matching: 1,
            onlyInSource: [{ name: "A" }],
            onlyInTarget: [{ name: "C" }],
            differences: [],
          },
        },
      ],
      (item) => item.name,
      1,
    );

    expect(report.rows).toHaveLength(1);
    expect(report.totalDriftRows).toBe(2);
    expect(report.omittedRowCount).toBe(1);
  });
});

describe("formatMatrixStatus", () => {
  it("uses short status labels for the table", () => {
    expect(formatMatrixStatus("same")).toBe("same");
    expect(formatMatrixStatus("different")).toBe("diff");
    expect(formatMatrixStatus("only_in_baseline")).toBe("missing");
    expect(formatMatrixStatus("only_in_target")).toBe("extra");
    expect(formatMatrixStatus("absent")).toBe("-");
  });
});
