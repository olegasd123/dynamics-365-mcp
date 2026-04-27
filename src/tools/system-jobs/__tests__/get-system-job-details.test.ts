import { describe, expect, it } from "vitest";
import { registerGetSystemJobDetails } from "../get-system-job-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_system_job_details tool", () => {
  it("renders bulk delete details for one system job", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        "asyncoperations(job-1)": {
          asyncoperationid: "job-1",
          name: "Bulk delete old logs",
          operationtype: 13,
          statecode: 3,
          statuscode: 31,
          createdon: "2026-04-20T08:00:00.000Z",
          startedon: "2026-04-20T08:05:00.000Z",
          completedon: "2026-04-20T08:10:00.000Z",
          modifiedon: "2026-04-20T08:10:00.000Z",
          friendlymessage: "Some records could not be deleted",
          message: "Delete failed for 3 records",
          correlationid: "corr-1",
          requestid: "req-1",
          errorcode: 12345,
          retrycount: 2,
          executiontimespan: 25,
          retainjobhistory: true,
        },
        bulkdeleteoperations: [
          {
            bulkdeleteoperationid: "bulk-1",
            name: "Bulk delete old logs",
            statecode: 3,
            statuscode: 31,
            successcount: 97,
            failurecount: 3,
            isrecurring: false,
            nextrun: "",
          },
        ],
      },
    });

    registerGetSystemJobDetails(server as never, config, client);

    const response = await server.getHandler("get_system_job_details")({
      systemJobId: "job-1",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## System Job: Bulk delete old logs");
    expect(response.content[0].text).toContain("### Bulk Delete Details");
    expect(response.content[0].text).toContain("Deleted: 97");
    expect(response.content[0].text).toContain("Failures: 3");
    expect(response.structuredContent).toMatchObject({
      tool: "get_system_job_details",
      ok: true,
      data: {
        environment: "dev",
        found: true,
        systemJob: {
          asyncOperationId: "job-1",
          category: "Bulk Delete",
          statusLabel: "Failed",
        },
        bulkDeleteOperations: [
          {
            bulkDeleteOperationId: "bulk-1",
            successCount: 97,
            failureCount: 3,
            statusLabel: "Failed",
          },
        ],
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual([
      "asyncoperations(job-1)",
      "bulkdeleteoperations",
    ]);
    expect(calls[1]?.queryParams).toContain("_asyncoperationid_value eq ");
  });

  it("loads the related plug-in step for a plug-in async job", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        "asyncoperations(job-2)": {
          asyncoperationid: "job-2",
          name: "Account plugin async run",
          operationtype: 54,
          statecode: 3,
          statuscode: 30,
          createdon: "2026-04-20T09:00:00.000Z",
          completedon: "2026-04-20T09:00:03.000Z",
          _owningextensionid_value: "step-1",
          message: "Completed",
        },
        "sdkmessageprocessingsteps(step-1)": {
          sdkmessageprocessingstepid: "step-1",
          name: "Account Update Async",
          stage: 40,
          mode: 1,
          asyncautodelete: true,
          sdkmessageid: {
            name: "Update",
          },
          sdkmessagefilterid: {
            primaryobjecttypecode: "account",
          },
        },
      },
    });

    registerGetSystemJobDetails(server as never, config, client);

    const response = await server.getHandler("get_system_job_details")({
      systemJobId: "job-2",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("### Related Plug-in Step");
    expect(response.content[0].text).toContain("Account Update Async");
    expect(response.content[0].text).toContain("Message: Update");
    expect(response.structuredContent).toMatchObject({
      tool: "get_system_job_details",
      ok: true,
      data: {
        relatedPluginStep: {
          sdkMessageProcessingStepId: "step-1",
          name: "Account Update Async",
          messageName: "Update",
          primaryEntity: "account",
          modeLabel: "Asynchronous",
        },
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual([
      "asyncoperations(job-2)",
      "sdkmessageprocessingsteps(step-1)",
    ]);
  });
});
