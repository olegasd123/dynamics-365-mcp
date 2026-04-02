import { describe, expect, it } from "vitest";
import { formatDiffResult, formatTable } from "../formatters.js";

describe("formatTable", () => {
  it("renders a simple text table", () => {
    expect(
      formatTable(
        ["Name", "Status"],
        [
          ["Plugin A", "Active"],
          ["B", "Draft"],
        ],
      ),
    ).toBe(
      ["Name     | Status", "---------|-------", "Plugin A | Active", "B        | Draft "].join(
        "\n",
      ),
    );
  });
});

describe("formatDiffResult", () => {
  it("renders summary, missing items, and field differences", () => {
    const text = formatDiffResult(
      {
        matching: 1,
        onlyInSource: [{ name: "Only Source" }],
        onlyInTarget: [{ name: "Only Target" }],
        differences: [
          {
            key: "Changed Item",
            source: { name: "Changed Item", version: "1.0" },
            target: { name: "Changed Item", version: "2.0" },
            changedFields: [{ field: "version", sourceValue: "1.0", targetValue: "2.0" }],
          },
        ],
      },
      "dev",
      "prod",
      "name",
    );

    expect(text).toContain("## Comparison: dev vs prod");
    expect(text).toContain("Only in dev");
    expect(text).toContain("Only Source");
    expect(text).toContain("Only in prod");
    expect(text).toContain("Only Target");
    expect(text).toContain("Changed Item");
    expect(text).toContain("version: `1.0` → `2.0`");
  });
});
