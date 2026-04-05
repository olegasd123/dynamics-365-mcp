import type { DiffResult } from "../../utils/diff.js";

export function formatNamedDiffSection<T extends Record<string, unknown>>(options: {
  title: string;
  result: DiffResult<T>;
  sourceLabel: string;
  targetLabel: string;
  nameField: string;
  emptyMessage?: string;
}): string {
  const { title, result, sourceLabel, targetLabel, nameField, emptyMessage } = options;
  const lines: string[] = [];

  lines.push(`### ${title}`);
  lines.push(
    `Matching: ${result.matching} | Differences: ${result.differences.length} | Only in ${sourceLabel}: ${result.onlyInSource.length} | Only in ${targetLabel}: ${result.onlyInTarget.length}`,
  );

  if (
    result.matching === 0 &&
    result.differences.length === 0 &&
    result.onlyInSource.length === 0 &&
    result.onlyInTarget.length === 0
  ) {
    lines.push("");
    lines.push(emptyMessage || "No items found.");
    return lines.join("\n");
  }

  if (result.onlyInSource.length > 0) {
    lines.push("");
    lines.push(`Only in ${sourceLabel}:`);
    for (const item of result.onlyInSource) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
  }

  if (result.onlyInTarget.length > 0) {
    lines.push("");
    lines.push(`Only in ${targetLabel}:`);
    for (const item of result.onlyInTarget) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
  }

  if (result.differences.length > 0) {
    lines.push("");
    lines.push("Differences:");
    for (const diff of result.differences) {
      lines.push(`- ${diff.key}`);
      for (const change of diff.changedFields) {
        lines.push(
          `  ${change.field}: \`${formatComparisonValue(change.sourceValue)}\` -> \`${formatComparisonValue(change.targetValue)}\``,
        );
      }
    }
  }

  return lines.join("\n");
}

export function formatComparisonValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(none)";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
