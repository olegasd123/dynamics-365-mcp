import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  README_TOOL_DOCS_END,
  README_TOOL_DOCS_START,
  buildReadmeToolDocsSection,
} from "../readme-docs.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "../../..");
const README_PATH = resolve(REPO_ROOT, "README.md");

function extractGeneratedSection(content: string): string {
  const startIndex = content.indexOf(README_TOOL_DOCS_START);
  const endIndex = content.indexOf(README_TOOL_DOCS_END);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error("README tool doc markers are missing or out of order.");
  }

  return content.slice(startIndex + README_TOOL_DOCS_START.length, endIndex).trim();
}

function findRelativeMarkdownLinks(content: string): string[] {
  const matches = [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];

  return matches
    .map((match) => match[1] ?? "")
    .filter((target) => target.length > 0)
    .filter((target) => !target.startsWith("#"))
    .filter((target) => !target.startsWith("http://"))
    .filter((target) => !target.startsWith("https://"))
    .filter((target) => !target.startsWith("mailto:"));
}

describe("README docs", () => {
  it("keeps generated tool docs in sync with the manifest", () => {
    const readme = readFileSync(README_PATH, "utf-8");

    expect(extractGeneratedSection(readme)).toBe(buildReadmeToolDocsSection());
  });

  it("uses only relative markdown links that exist in the repo", () => {
    const readme = readFileSync(README_PATH, "utf-8");
    const missingTargets = findRelativeMarkdownLinks(readme).filter(
      (target) => !existsSync(resolve(REPO_ROOT, target)),
    );

    expect(missingTargets).toEqual([]);
  });
});
