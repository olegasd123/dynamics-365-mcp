import { describe, expect, it } from "vitest";
import { registerSummarizeSystemJobs } from "../summarize-system-jobs.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("summarize_system_jobs tool", () => {
  it("summarizes system jobs with status, runtime, groups, and queue buckets", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        asyncoperations: {
          "@odata.count": 4,
          value: [
            {
              asyncoperationid: "job-1",
              name: "Workflow A",
              operationtype: 10,
              statecode: 3,
              statuscode: 30,
              createdon: "2026-04-20T08:05:00.000Z",
              startedon: "2026-04-20T08:06:00.000Z",
              completedon: "2026-04-20T08:16:00.000Z",
              _workflowactivationid_value: "workflow-1",
            },
            {
              asyncoperationid: "job-2",
              name: "Workflow A",
              operationtype: 10,
              statecode: 3,
              statuscode: 31,
              createdon: "2026-04-20T08:10:00.000Z",
              startedon: "2026-04-20T08:12:00.000Z",
              completedon: "2026-04-20T08:17:00.000Z",
              friendlymessage: "Workflow failed on account 25\n   at Step.Execute()",
              _workflowactivationid_value: "workflow-1",
            },
            {
              asyncoperationid: "job-3",
              name: "Bulk Cleanup",
              operationtype: 13,
              statecode: 3,
              statuscode: 30,
              createdon: "2026-04-20T08:35:00.000Z",
              startedon: "2026-04-20T08:40:00.000Z",
              completedon: "2026-04-20T08:55:00.000Z",
            },
            {
              asyncoperationid: "job-4",
              name: "Async Waiting",
              operationtype: 54,
              statecode: 0,
              statuscode: 10,
              createdon: "2026-04-20T08:50:00.000Z",
            },
          ],
        },
      },
    });

    registerSummarizeSystemJobs(server as never, config, client);

    const response = await server.getHandler("summarize_system_jobs")({
      createdAfter: "2026-04-20T08:00:00Z",
      createdBefore: "2026-04-20T09:00:00Z",
      groupBy: "name",
      bucketMinutes: 30,
      maxRecords: 10,
      topMessages: 3,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## System Job Summary in 'dev'");
    expect(response.content[0].text).toContain("Workflow A");
    expect(response.content[0].text).toContain("Estimated Queue Buckets");
    expect(response.structuredContent).toMatchObject({
      tool: "summarize_system_jobs",
      ok: true,
      data: {
        environment: "dev",
        groupBy: "name",
        bucketMinutes: 30,
        scannedCount: 4,
        totalCount: 4,
        hasMore: false,
        statusCounts: {
          waiting: 1,
          inProgress: 0,
          succeeded: 2,
          failed: 1,
          canceled: 0,
          suspended: 0,
        },
        failureRatePercent: 25,
        runtime: {
          sampleCount: 3,
          averageMs: 600000,
          p50Ms: 600000,
          p95Ms: 900000,
          maxMs: 900000,
        },
        topMessages: [
          {
            message: "Workflow failed on account 25",
            count: 1,
          },
        ],
        topSlowestJobs: [
          {
            asyncOperationId: "job-3",
            name: "Bulk Cleanup",
            runtimeMs: 900000,
            runtimeSeconds: 900,
          },
          {
            asyncOperationId: "job-1",
            name: "Workflow A",
            runtimeMs: 600000,
            runtimeSeconds: 600,
          },
          {
            asyncOperationId: "job-2",
            name: "Workflow A",
            runtimeMs: 300000,
            runtimeSeconds: 300,
          },
        ],
        groups: expect.arrayContaining([
          expect.objectContaining({
            label: "Workflow A",
            count: 2,
            statusCounts: expect.objectContaining({
              succeeded: 1,
              failed: 1,
            }),
            failureRatePercent: 50,
            runtime: expect.objectContaining({
              sampleCount: 2,
              averageMs: 450000,
              p50Ms: 300000,
              p95Ms: 600000,
            }),
          }),
        ]),
        queueBuckets: [
          {
            start: "2026-04-20T08:00:00.000Z",
            end: "2026-04-20T08:30:00.000Z",
            createdCount: 2,
            completedCount: 2,
            failedCount: 1,
            estimatedOpenCount: 0,
          },
          {
            start: "2026-04-20T08:30:00.000Z",
            end: "2026-04-20T09:00:00.000Z",
            createdCount: 2,
            completedCount: 1,
            estimatedOpenCount: 1,
          },
        ],
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual(["asyncoperations"]);
    expect(calls[0]?.queryParams).toContain("createdon ge 2026-04-20T08:00:00.000Z");
    expect(calls[0]?.queryParams).toContain("createdon le 2026-04-20T09:00:00.000Z");
    expect(calls[0]?.queryParams).toContain("$top=10");
    expect(calls[0]?.queryParams).toContain("$orderby=createdon asc");
  });
});
