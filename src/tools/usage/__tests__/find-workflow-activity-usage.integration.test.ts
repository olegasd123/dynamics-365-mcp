import { describe, expect, it } from "vitest";
import { registerFindWorkflowActivityUsage } from "../find-workflow-activity-usage.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("find_workflow_activity_usage tool", () => {
  it("finds workflow category processes that reference a namespaced CodeActivity tag", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Set Integration Key On Account",
            uniquename: "contoso_SetIntegrationKeyAccount",
            category: 0,
            statecode: 1,
            mode: 0,
            primaryentity: "account",
            xaml: `
              <Activity
                xmlns:mx="clr-namespace:Masao.Workflows.CommonSteps;assembly=Masao.Workflows">
                <mx:SetIntegrationKey />
              </Activity>
            `,
            clientdata: "{}",
          },
          {
            workflowid: "wf-2",
            name: "Action Also Uses Activity",
            uniquename: "contoso_ActionSetIntegrationKey",
            category: 3,
            statecode: 1,
            mode: 0,
            primaryentity: "account",
            xaml: `
              <Activity
                xmlns:mx="clr-namespace:Masao.Workflows.CommonSteps;assembly=Masao.Workflows">
                <mx:SetIntegrationKey />
              </Activity>
            `,
            clientdata: "{}",
          },
        ],
      },
    });

    registerFindWorkflowActivityUsage(server as never, config, client);

    const response = await server.getHandler("find_workflow_activity_usage")({
      className: "Masao.Workflows.CommonSteps.SetIntegrationKey",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Workflow Activity Usage");
    expect(response.content[0].text).toContain("Set Integration Key On Account");
    expect(response.content[0].text).not.toContain("Action Also Uses Activity");
    expect(response.content[0].text).toContain("XAML activity tag");
    expect(response.structuredContent).toMatchObject({
      tool: "find_workflow_activity_usage",
      ok: true,
      data: {
        environment: "dev",
        className: "Masao.Workflows.CommonSteps.SetIntegrationKey",
        category: "workflow",
        totalMatches: 1,
        items: [
          {
            name: "Set Integration Key On Account",
            uniqueName: "contoso_SetIntegrationKeyAccount",
            primaryEntity: "account",
          },
        ],
      },
    });
  });

  it("supports narrowing matches to one solution", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Workflow In Solution",
            uniquename: "contoso_WorkflowInSolution",
            category: 0,
            statecode: 1,
            mode: 0,
            primaryentity: "account",
            xaml: `
              <Activity
                xmlns:mx="clr-namespace:Masao.Workflows.CommonSteps;assembly=Masao.Workflows">
                <mx:SetIntegrationKey />
              </Activity>
            `,
            clientdata: "{}",
          },
          {
            workflowid: "wf-2",
            name: "Workflow Outside Solution",
            uniquename: "contoso_WorkflowOutsideSolution",
            category: 0,
            statecode: 1,
            mode: 0,
            primaryentity: "contact",
            xaml: `
              <Activity
                xmlns:mx="clr-namespace:Masao.Workflows.CommonSteps;assembly=Masao.Workflows">
                <mx:SetIntegrationKey />
              </Activity>
            `,
            clientdata: "{}",
          },
        ],
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Synergie Core",
            uniquename: "synergie_core",
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-1",
            objectid: "wf-1",
            componenttype: 29,
          },
        ],
      },
    });

    registerFindWorkflowActivityUsage(server as never, config, client);

    const response = await server.getHandler("find_workflow_activity_usage")({
      className: "Masao.Workflows.CommonSteps.SetIntegrationKey",
      solution: "Synergie Core",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Workflow In Solution");
    expect(response.content[0].text).not.toContain("Workflow Outside Solution");
    expect(response.structuredContent).toMatchObject({
      tool: "find_workflow_activity_usage",
      ok: true,
      data: {
        solution: "Synergie Core",
        totalMatches: 1,
      },
    });
  });
});
