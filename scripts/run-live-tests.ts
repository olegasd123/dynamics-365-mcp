import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

interface LiveProgressState {
  totalCases: number | null;
  completedCases: number;
  failures: Array<{
    index: number;
    total: number;
    toolName: string;
    caseName: string;
  }>;
}

const vitestEntry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const liveTestFile = "src/tools/__tests__/live-tools.integration.test.ts";
const state: LiveProgressState = {
  totalCases: null,
  completedCases: 0,
  failures: [],
};

let interruptSummaryPrinted = false;
let interruptForwarded = false;

const child = spawn(process.execPath, [vitestEntry, "run", liveTestFile], {
  stdio: ["inherit", "pipe", "pipe"],
  env: {
    ...process.env,
    D365_MCP_ENABLE_LIVE: "1",
  },
});

child.stdout?.setEncoding("utf8");
child.stderr?.setEncoding("utf8");

attachStream(child.stdout, process.stdout);
attachStream(child.stderr, process.stderr);

process.on("SIGINT", () => {
  printInterruptSummary();

  if (!interruptForwarded && child.exitCode === null && !child.killed) {
    interruptForwarded = true;
    child.kill("SIGINT");
    return;
  }

  process.exit(130);
});

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal === "SIGINT") {
      resolve(130);
      return;
    }

    resolve(code ?? 1);
  });
});

process.exit(exitCode);

function attachStream(
  stream: NodeJS.ReadableStream | null | undefined,
  target: NodeJS.WriteStream,
): void {
  if (!stream) {
    return;
  }

  let buffer = "";

  stream.on("data", (chunk: string | Buffer) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    target.write(text);
    buffer += text;

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      updateProgressState(line);
    }
  });

  stream.on("end", () => {
    if (buffer) {
      updateProgressState(buffer);
    }
  });
}

function updateProgressState(line: string): void {
  const runMatch = line.match(
    /\[live\] running (\d+) runnable case\(s\) out of (\d+) configured case\(s\) with maxParallel=\d+/,
  );
  if (runMatch) {
    state.totalCases = Number.parseInt(runMatch[2] || "0", 10) || null;
    return;
  }

  const completedMatch = line.match(
    /\[live\] \[(\d+)\/(\d+)\] \[(OK|FAILED|SKIPPED)\] ([^/]+) \/ (.+?)(?: \(|$)/,
  );
  if (!completedMatch) {
    return;
  }

  const index = Number.parseInt(completedMatch[1] || "0", 10);
  const total = Number.parseInt(completedMatch[2] || "0", 10);
  const status = completedMatch[3] || "";
  const toolName = (completedMatch[4] || "").trim();
  const caseName = (completedMatch[5] || "").trim();

  state.totalCases = total || state.totalCases;
  state.completedCases = Math.max(state.completedCases, index);

  if (status !== "FAILED") {
    return;
  }

  const duplicate = state.failures.some(
    (failure) =>
      failure.index === index && failure.toolName === toolName && failure.caseName === caseName,
  );
  if (duplicate) {
    return;
  }

  state.failures.push({
    index,
    total,
    toolName,
    caseName,
  });
}

function printInterruptSummary(): void {
  if (interruptSummaryPrinted) {
    return;
  }

  interruptSummaryPrinted = true;

  const totalCases = state.totalCases ?? "?";
  process.stdout.write(
    `\n[live] Interrupted. Completed ${state.completedCases} of ${totalCases} case(s).\n`,
  );

  if (state.failures.length === 0) {
    process.stdout.write("[live] No completed failed case to report yet.\n");
    return;
  }

  process.stdout.write("[live] Failures so far\n");
  for (const failure of state.failures.sort((left, right) => left.index - right.index)) {
    process.stdout.write(
      `[live] [FAILED] ${failure.toolName} / ${failure.caseName} (${failure.index}/${failure.total})\n`,
    );
  }
}
