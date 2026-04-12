import { describe, expect, it } from "vitest";
import { registerListViews } from "../list-views.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_views tool", () => {
  it("supports paging for views", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Accounts",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
            ismanaged: true,
            statecode: 0,
            modifiedon: "2026-03-01T12:00:00Z",
            fetchxml: "<fetch />",
            layoutxml: "<grid />",
          },
          {
            savedqueryid: "view-2",
            name: "Contacts",
            returnedtypecode: "contact",
            querytype: 0,
            isdefault: false,
            isquickfindquery: false,
            ismanaged: true,
            statecode: 0,
            modifiedon: "2026-03-02T12:00:00Z",
            fetchxml: "<fetch />",
            layoutxml: "<grid />",
          },
          {
            savedqueryid: "view-3",
            name: "Leads",
            returnedtypecode: "lead",
            querytype: 0,
            isdefault: false,
            isquickfindquery: false,
            ismanaged: true,
            statecode: 0,
            modifiedon: "2026-03-03T12:00:00Z",
            fetchxml: "<fetch />",
            layoutxml: "<grid />",
          },
        ],
      },
    });

    registerListViews(server as never, config, client);

    const response = await server.getHandler("list_views")({ limit: 2 });
    const payload = response.structuredContent as {
      data: {
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ name: string }>;
      };
    };

    expect(response.content[0].text).toContain("Showing 2 of 3 views.");
    expect(payload.data.returnedCount).toBe(2);
    expect(payload.data.totalCount).toBe(3);
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data.nextCursor).toBe("2");
    expect(payload.data.items.map((item) => item.name)).toEqual(["Accounts", "Contacts"]);
  });
});
