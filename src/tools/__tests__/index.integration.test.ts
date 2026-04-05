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
      "compare_forms",
      "compare_plugins",
      "compare_solutions",
      "compare_table_schema",
      "compare_views",
      "compare_web_resources",
      "compare_workflows",
      "get_form_details",
      "get_plugin_details",
      "get_solution_dependencies",
      "get_solution_details",
      "get_table_schema",
      "get_view_details",
      "get_view_fetchxml",
      "get_web_resource_content",
      "get_workflow_details",
      "list_actions",
      "list_forms",
      "list_plugin_images",
      "list_plugin_steps",
      "list_plugins",
      "list_solutions",
      "list_table_columns",
      "list_table_relationships",
      "list_tables",
      "list_views",
      "list_web_resources",
      "list_workflows",
    ]);
  });
});
