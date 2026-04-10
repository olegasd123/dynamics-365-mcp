import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { EXPECTED_TOOL_NAMES } from "./tool-test-helpers.js";

export const DEFAULT_FIXTURES_PATH = "live-fixtures.json";
export const DEFAULT_LIVE_MAX_PARALLEL = 1;

export type ToolName = (typeof EXPECTED_TOOL_NAMES)[number];

const runnableLiveToolCaseSchema = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    arguments: z.record(z.string(), z.unknown()),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const skippedLiveToolCaseSchema = z
  .object({
    name: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    skipReason: z.string().min(1),
  })
  .strict();

const liveExecutionSchema = z
  .object({
    maxParallel: z.number().int().positive().optional(),
  })
  .strict();

const liveFixturesSchema = z
  .object({
    execution: liveExecutionSchema.optional(),
    tools: z.record(
      z.enum(EXPECTED_TOOL_NAMES),
      z.array(z.union([runnableLiveToolCaseSchema, skippedLiveToolCaseSchema])).min(1),
    ),
  })
  .strict();

type RunnableLiveToolCase = z.infer<typeof runnableLiveToolCaseSchema>;
type SkippedLiveToolCase = z.infer<typeof skippedLiveToolCaseSchema>;
type ConfiguredLiveToolCase = RunnableLiveToolCase | SkippedLiveToolCase;

export type LiveFixtures = z.infer<typeof liveFixturesSchema>;

export interface SelectedLiveToolCase {
  toolName: ToolName;
  caseName: string;
  arguments: Record<string, unknown> | null;
  skipReason: string | null;
  timeoutMs?: number;
}

export function loadLiveFixtures(fixturesPath?: string): LiveFixtures {
  const path = resolve(fixturesPath || process.env.D365_MCP_LIVE_FIXTURES || DEFAULT_FIXTURES_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `Live fixtures file not found: ${path}. Copy 'live-fixtures.example.json' to 'live-fixtures.json' or set D365_MCP_LIVE_FIXTURES.`,
    );
  }

  const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
  return liveFixturesSchema.parse(parsed);
}

export function getLiveMaxParallel(fixtures: LiveFixtures): number {
  return fixtures.execution?.maxParallel ?? DEFAULT_LIVE_MAX_PARALLEL;
}

export function getSelectedLiveTools(): ToolName[] {
  const raw = process.env.D365_MCP_LIVE_TOOLS?.trim();
  if (!raw) {
    return [...EXPECTED_TOOL_NAMES];
  }

  const requestedTools = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selectedTools = requestedTools.filter((toolName): toolName is ToolName =>
    EXPECTED_TOOL_NAMES.includes(toolName as ToolName),
  );

  if (selectedTools.length === 0) {
    throw new Error(
      `D365_MCP_LIVE_TOOLS did not match any known tool names. Requested: ${requestedTools.join(", ")}`,
    );
  }

  return selectedTools;
}

export function getSelectedLiveCases(
  fixtures: LiveFixtures,
  selectedTools: ToolName[],
  getToolTimeoutMs: (toolName: ToolName, toolCase: RunnableLiveToolCase) => number,
): SelectedLiveToolCase[] {
  return selectedTools.flatMap((toolName) => {
    const configuredCases = fixtures.tools[toolName];

    if (!configuredCases || configuredCases.length === 0) {
      throw new Error(
        `Missing live fixture cases for '${toolName}'. Add at least one case under tools.${toolName}.`,
      );
    }

    return configuredCases.map((toolCase, caseIndex) => {
      const caseName = getToolCaseLabel(toolName, toolCase, caseIndex);

      if (!isEnabledLiveToolCase(toolCase)) {
        return {
          toolName,
          caseName,
          arguments: null,
          skipReason: "Disabled in live-fixtures.json.",
        };
      }

      if (isSkippedLiveToolCase(toolCase)) {
        return {
          toolName,
          caseName,
          arguments: null,
          skipReason: toolCase.skipReason,
        };
      }

      return {
        toolName,
        caseName,
        arguments: toolCase.arguments,
        skipReason: null,
        timeoutMs: getToolTimeoutMs(toolName, toolCase),
      };
    });
  });
}

export async function mapWithConcurrencyLimit<TItem, TResult>(
  items: readonly TItem[],
  maxParallel: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TResult>(items.length);
  const workerCount = Math.max(1, Math.min(maxParallel, items.length));
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex] as TItem, currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function isSkippedLiveToolCase(toolCase: ConfiguredLiveToolCase): toolCase is SkippedLiveToolCase {
  return "skipReason" in toolCase;
}

function isEnabledLiveToolCase(toolCase: ConfiguredLiveToolCase): boolean {
  return toolCase.enabled !== false;
}

function getToolCaseLabel(
  toolName: ToolName,
  toolCase: ConfiguredLiveToolCase,
  caseIndex: number,
): string {
  return toolCase.name?.trim() || `${toolName} case ${caseIndex + 1}`;
}
