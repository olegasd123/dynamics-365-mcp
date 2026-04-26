import { describe, expect, it } from "vitest";
import { registerAllTools } from "../index.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
  getExpectedToolNames,
} from "./tool-test-helpers.js";

describe("registerAllTools", () => {
  it("registers the full expected tool set", () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev", "prod"]);
    const { client } = createRecordingClient({ dev: {}, prod: {} });

    registerAllTools(server as never, config, client);

    expect(server.getToolNames()).toEqual(getExpectedToolNames(config));
  });

  it("registers gated tools only when the feature flag is enabled", () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
        },
      },
    });
    const { client } = createRecordingClient({ dev: {} });

    registerAllTools(server as never, config, client);

    expect(server.getToolNames()).toContain("run_fetchxml");
  });
});
