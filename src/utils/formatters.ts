import type { DiffResult } from "./diff.js";

export function formatTable(
  headers: string[],
  rows: string[][]
): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );

  const headerLine = headers
    .map((h, i) => h.padEnd(colWidths[i]))
    .join(" | ");
  const separator = colWidths.map((w) => "-".repeat(w)).join("-|-");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell || "").padEnd(colWidths[i])).join(" | ")
  );

  return [headerLine, separator, ...dataLines].join("\n");
}

export function formatDiffResult<T extends Record<string, unknown>>(
  result: DiffResult<T>,
  sourceEnv: string,
  targetEnv: string,
  nameField: string
): string {
  const lines: string[] = [];

  lines.push(`## Comparison: ${sourceEnv} vs ${targetEnv}`);
  lines.push(`Matching: ${result.matching} | Differences: ${result.differences.length} | Only in ${sourceEnv}: ${result.onlyInSource.length} | Only in ${targetEnv}: ${result.onlyInTarget.length}`);
  lines.push("");

  if (result.onlyInSource.length > 0) {
    lines.push(`### Only in ${sourceEnv}`);
    for (const item of result.onlyInSource) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
    lines.push("");
  }

  if (result.onlyInTarget.length > 0) {
    lines.push(`### Only in ${targetEnv}`);
    for (const item of result.onlyInTarget) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
    lines.push("");
  }

  if (result.differences.length > 0) {
    lines.push("### Differences");
    for (const diff of result.differences) {
      lines.push(`\n**${diff.key}**`);
      for (const change of diff.changedFields) {
        lines.push(`  - ${change.field}: \`${formatValue(change.sourceValue)}\` → \`${formatValue(change.targetValue)}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
