import { describe, expect, it } from "vitest";
import { registerAllTools } from "../index.js";
import {
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

    expect(server.getToolNames()).toEqual([
      "compare_environment_matrix",
      "compare_plugins",
      "compare_solutions",
      "compare_web_resources",
      "compare_workflows",
      "get_plugin_details",
      "get_solution_dependencies",
      "get_solution_details",
      "get_web_resource_content",
      "get_workflow_details",
      "list_actions",
      "list_plugin_images",
      "list_plugin_steps",
      "list_plugins",
      "list_solutions",
      "list_web_resources",
      "list_workflows",
    ]);
  });
});
