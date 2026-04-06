import { describe, expect, it } from "vitest";
import { registerAllTools } from "../index.js";
import {
  EXPECTED_TOOL_NAMES,
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "./tool-test-helpers.js";

describe("registerAllTools", () => {
  it("registers the full expected tool set", () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev", "prod"]);
    const { client } = createRecordingClient({ dev: {}, prod: {} });

    registerAllTools(server as never, config, client);

    expect(server.getToolNames()).toEqual(EXPECTED_TOOL_NAMES);
  });
});
