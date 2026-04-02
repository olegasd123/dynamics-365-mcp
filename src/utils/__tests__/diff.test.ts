import { describe, expect, it } from "vitest";
import { diffCollections } from "../diff.js";

describe("diffCollections", () => {
  it("finds matching, missing, and changed items", () => {
    const source = [
      { name: "A", version: "1.0", enabled: true },
      { name: "B", version: "1.0", enabled: true },
      { name: "C", version: "1.0", enabled: false },
    ];
    const target = [
      { name: "A", version: "1.0", enabled: true },
      { name: "B", version: "2.0", enabled: true },
      { name: "D", version: "1.0", enabled: false },
    ];

    const result = diffCollections(source, target, (item) => item.name, ["version", "enabled"]);

    expect(result.matching).toBe(1);
    expect(result.onlyInSource).toEqual([{ name: "C", version: "1.0", enabled: false }]);
    expect(result.onlyInTarget).toEqual([{ name: "D", version: "1.0", enabled: false }]);
    expect(result.differences).toEqual([
      {
        key: "B",
        source: { name: "B", version: "1.0", enabled: true },
        target: { name: "B", version: "2.0", enabled: true },
        changedFields: [{ field: "version", sourceValue: "1.0", targetValue: "2.0" }],
      },
    ]);
  });

  it("compares nested values using JSON equality", () => {
    const source = [{ name: "A", metadata: { steps: ["create", "update"] } }];
    const target = [{ name: "A", metadata: { steps: ["create", "delete"] } }];

    const result = diffCollections(source, target, (item) => item.name, ["metadata"]);

    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].changedFields).toEqual([
      {
        field: "metadata",
        sourceValue: { steps: ["create", "update"] },
        targetValue: { steps: ["create", "delete"] },
      },
    ]);
  });
});
