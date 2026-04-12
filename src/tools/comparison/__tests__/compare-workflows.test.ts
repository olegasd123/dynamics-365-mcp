import { describe, expect, it } from "vitest";
import { registerCompareWorkflows } from "../compare-workflows.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_workflows", () => {
  it("formats workflow labels after comparison", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        workflows: [
          {
            workflowid: "workflow-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 0,
            mode: 0,
            statecode: 1,
            statuscode: 2,
            ismanaged: false,
          },
        ],
      },
      dev: {
        workflows: [
          {
            workflowid: "workflow-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 5,
            mode: 0,
            statecode: 2,
            statuscode: 2,
            ismanaged: false,
          },
        ],
      },
    });

    registerCompareWorkflows(server as never, config, client);
    const response = await server.getHandler("compare_workflows")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      workflowName: "Account Sync",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Activated");
    expect(response.content[0].text).toContain("Modern Flow");
    expect(response.structuredContent).toMatchObject({
      data: {
        workflowName: "Account Sync",
      },
    });
  });
});
