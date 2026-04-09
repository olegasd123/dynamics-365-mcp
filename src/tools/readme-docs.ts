import {
  TOOL_GROUPS,
  getToolEntriesByGroup,
  getToolEntriesByReadmeSection,
  type ToolManifestEntry,
} from "./manifest.js";

export const README_TOOL_DOCS_START = "<!-- TOOL_DOCS_START -->";
export const README_TOOL_DOCS_END = "<!-- TOOL_DOCS_END -->";

function formatParams(params: readonly string[]): string {
  return params.map((param) => `\`${param}\``).join(", ");
}

function formatTable(entries: ToolManifestEntry[]): string {
  const rows = [
    ["Tool", "Description", "Key Parameters"],
    ...entries.map((entry) => [
      `\`${entry.name}\``,
      entry.description,
      formatParams(entry.mainParams),
    ]),
  ];
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index]?.length ?? 0)));
  const header = `| ${rows[0].map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  const dataRows = rows
    .slice(1)
    .map((row) => `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`);

  return [header, separator, ...dataRows].join("\n");
}

export function buildReadmeToolDocsSection(): string {
  return [
    "### Metadata Query Tools",
    "",
    formatTable(getToolEntriesByReadmeSection("metadata")),
    "",
    "### Cross-Environment Comparison Tools",
    "",
    formatTable(getToolEntriesByReadmeSection("comparison")),
  ].join("\n");
}

export function replaceReadmeToolDocs(content: string): string {
  const startIndex = content.indexOf(README_TOOL_DOCS_START);
  const endIndex = content.indexOf(README_TOOL_DOCS_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README tool doc markers are missing or out of order.");
  }

  const generated = buildReadmeToolDocsSection();
  const before = content.slice(0, startIndex + README_TOOL_DOCS_START.length);
  const after = content.slice(endIndex);

  return `${before}\n${generated}\n${after}`;
}

export function buildToolGroupsResourceSection(): string {
  const sections = TOOL_GROUPS.map((group) => {
    const entries = getToolEntriesByGroup(group.id);
    const lines = entries.map((entry) => `- \`${entry.name}\`: ${entry.description}`);

    return [`## ${group.title}`, "", ...lines].join("\n");
  });

  return ["# Tool Groups", "", ...sections].join("\n");
}
