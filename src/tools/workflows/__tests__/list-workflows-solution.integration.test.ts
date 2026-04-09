import { describe, expect, it } from "vitest";
import { registerListWorkflows } from "../list-workflows.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_workflows solution filter", () => {
  it("filters workflows by solution", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "wf-1", componenttype: 29 }],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 0,
            statecode: 1,
            primaryentity: "account",
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
          {
            workflowid: "wf-2",
            name: "Contact Sync",
            uniquename: "contoso_ContactSync",
            category: 0,
            statecode: 1,
            primaryentity: "contact",
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
        ],
      },
    });

    registerListWorkflows(server as never, config, client);

    const response = await server.getHandler("list_workflows")({
      solution: "Core",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("Account Sync");
    expect(text).not.toContain("Contact Sync");
    expect(response.structuredContent).toMatchObject({
      tool: "list_workflows",
      ok: true,
      data: {
        environment: "dev",
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it("adds continuation guidance for paged solution results", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const workflows = Array.from({ length: 3 }, (_, index) => ({
      workflowid: `wf-${index + 1}`,
      name: `Workflow ${index + 1}`,
      uniquename: `contoso_Workflow${index + 1}`,
      category: 0,
      statecode: 1,
      primaryentity: "account",
      ismanaged: false,
      modifiedon: "2026-03-01T12:00:00Z",
    }));
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: workflows.map((workflow, index) => ({
          solutioncomponentid: `sc-${index + 1}`,
          objectid: workflow.workflowid,
          componenttype: 29,
        })),
        workflows,
      },
    });

    registerListWorkflows(server as never, config, client);

    const response = await server.getHandler("list_workflows")({
      solution: "Core",
      limit: 2,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "Recommended next step: ask for the next page with cursor='2' and the same filters.",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "list_workflows",
      ok: true,
      data: {
        environment: "dev",
        limit: 2,
        returnedCount: 2,
        totalCount: 3,
        hasMore: true,
        nextCursor: "2",
      },
    });
  });
});
