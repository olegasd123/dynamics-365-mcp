import { describe, expect, it } from "vitest";
import { registerListSystemJobs } from "../list-system-jobs.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_system_jobs tool", () => {
  it("lists failed import jobs with server-side filters", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        asyncoperations: {
          "@odata.count": 1,
          value: [
            {
              asyncoperationid: "job-1",
              name: "Import accounts.csv",
              operationtype: 5,
              statecode: 3,
              statuscode: 31,
              createdon: "2026-04-20T08:10:00.000Z",
              startedon: "2026-04-20T08:12:00.000Z",
              completedon: "2026-04-20T08:13:00.000Z",
              messagename: "ImportRecordsImport",
              primaryentitytype: "account",
              friendlymessage: "Row 25 failed validation",
              correlationid: "00000000-0000-0000-0000-000000000001",
              errorcode: 9001,
              retrycount: 1,
            },
          ],
        },
      },
    });

    registerListSystemJobs(server as never, config, client);

    const response = await server.getHandler("list_system_jobs")({
      status: "failed",
      jobType: "import",
      correlationId: "00000000-0000-0000-0000-000000000001",
      createdAfter: "2026-04-20T08:00:00Z",
      createdBefore: "2026-04-20T09:00:00Z",
      failedOnly: true,
      limit: 10,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## System Jobs in 'dev'");
    expect(response.content[0].text).toContain("Import accounts.csv");
    expect(response.content[0].text).toContain("Row 25 failed validation");
    expect(response.structuredContent).toMatchObject({
      tool: "list_system_jobs",
      ok: true,
      data: {
        environment: "dev",
        filters: {
          status: "failed",
          jobType: "import",
          correlationId: "00000000-0000-0000-0000-000000000001",
          createdAfter: "2026-04-20T08:00:00.000Z",
          createdBefore: "2026-04-20T09:00:00.000Z",
          failedOnly: true,
        },
        limit: 10,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });

    expect(calls.map((call) => call.entitySet)).toEqual(["asyncoperations"]);
    expect(calls[0]?.queryParams).toContain("statuscode eq 31");
    expect(calls[0]?.queryParams).toContain(
      "correlationid eq 00000000-0000-0000-0000-000000000001",
    );
    expect(calls[0]?.queryParams).toContain("createdon ge 2026-04-20T08:00:00.000Z");
    expect(calls[0]?.queryParams).toContain("createdon le 2026-04-20T09:00:00.000Z");
    expect(calls[0]?.queryParams).toContain("operationtype eq 5");
  });
});
