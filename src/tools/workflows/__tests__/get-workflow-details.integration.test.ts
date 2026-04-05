import { describe, expect, it } from "vitest";
import { registerGetWorkflowDetails } from "../get-workflow-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_workflow_details tool", () => {
  it("renders workflow details with triggers and parsed clientdata", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 3,
            statecode: 1,
            statuscode: 2,
            mode: 1,
            scope: 4,
            primaryentity: "account",
            ismanaged: false,
            description: "Sync account data",
            clientdata: JSON.stringify({ steps: ["validate", "sync"] }),
            triggeroncreate: true,
            triggerondelete: false,
            triggeronupdateattributelist: "name,revenue",
            inputparameters: '{"Target":"account"}',
            createdon: "2026-01-01T12:00:00Z",
            modifiedon: "2026-02-01T12:00:00Z",
          },
        ],
      },
    });

    registerGetWorkflowDetails(server as never, config, client);

    const response = await server.getHandler("get_workflow_details")({
      workflowName: "Account Sync",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Workflow: Account Sync");
    expect(text).toContain("- **Unique Name**: contoso_AccountSync");
    expect(text).toContain("- **Category**: Action");
    expect(text).toContain("- **Status**: Activated");
    expect(text).toContain("- **Mode**: Real-time");
    expect(text).toContain("- **Scope**: Organization");
    expect(text).toContain("Create, Update (name,revenue)");
    expect(text).toContain("### Input Parameters");
    expect(text).toContain('"Target":"account"');
    expect(text).toContain("### Definition (clientdata)");
    expect(text).toContain('"steps": [');
    expect(response.structuredContent).toMatchObject({
      tool: "get_workflow_details",
      ok: true,
      data: {
        environment: "dev",
        found: true,
        workflow: {
          name: "Account Sync",
          uniqueName: "contoso_AccountSync",
          categoryLabel: "Action",
          stateLabel: "Activated",
          modeLabel: "Real-time",
          scopeLabel: "Organization",
        },
      },
    });

    const payload = response.structuredContent as {
      data: { workflow: { triggers: string[]; inputParameters: { Target: string } } };
    };
    expect(payload.data.workflow.triggers).toEqual(["Create", "Update (name,revenue)"]);
    expect(payload.data.workflow.inputParameters.Target).toBe("account");
  });

  it("returns an error when no identity is provided", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({ dev: {} });

    registerGetWorkflowDetails(server as never, config, client);

    const response = await server.getHandler("get_workflow_details")({});

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Please provide either workflowName or uniqueName.");
    expect(response.structuredContent).toMatchObject({
      tool: "get_workflow_details",
      ok: false,
      error: {
        message: "Please provide either workflowName or uniqueName.",
      },
    });
  });

  it("returns a not found message when the workflow does not exist", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [],
      },
    });

    registerGetWorkflowDetails(server as never, config, client);

    const response = await server.getHandler("get_workflow_details")({
      uniqueName: "missing_workflow",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Workflow 'missing_workflow' not found in 'dev'.");
    expect(response.structuredContent).toMatchObject({
      tool: "get_workflow_details",
      ok: true,
      data: {
        environment: "dev",
        found: false,
        uniqueName: "missing_workflow",
      },
    });
  });

  it("returns an error when the client query fails", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const client = {
      async query(): Promise<never[]> {
        throw new Error("Dynamics API error [dev] (500): Workflow details failed");
      },
    } as never;

    registerGetWorkflowDetails(server as never, config, client);

    const response = await server.getHandler("get_workflow_details")({
      uniqueName: "contoso_Workflow",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Dynamics API error [dev] (500): Workflow details failed",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "get_workflow_details",
      ok: false,
      error: {
        message: "Dynamics API error [dev] (500): Workflow details failed",
      },
    });
  });
});
