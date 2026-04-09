import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const vitestEntry = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(
  process.execPath,
  [vitestEntry, "run", "src/tools/__tests__/live-tools.integration.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      D365_MCP_ENABLE_LIVE: "1",
    },
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
