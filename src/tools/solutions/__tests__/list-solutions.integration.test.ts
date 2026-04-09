import { describe, expect, it } from "vitest";
import { registerListSolutions } from "../list-solutions.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_solutions tool", () => {
  it("lists solutions with display and unique names", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0.0",
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
        ],
      },
    });

    registerListSolutions(server as never, config, client);

    const response = await server.getHandler("list_solutions")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Solutions in 'dev'");
    expect(response.content[0].text).toContain("Core");
    expect(response.content[0].text).toContain("contoso_core");
    expect(response.structuredContent).toMatchObject({
      tool: "list_solutions",
      ok: true,
      data: {
        environment: "dev",
        limit: 50,
        cursor: null,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it("supports paging for solution lists", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0.0",
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
          {
            solutionid: "sol-2",
            friendlyname: "Extensions",
            uniquename: "contoso_ext",
            version: "1.1.0.0",
            ismanaged: false,
            modifiedon: "2026-03-02T12:00:00Z",
          },
          {
            solutionid: "sol-3",
            friendlyname: "Reports",
            uniquename: "contoso_reports",
            version: "1.2.0.0",
            ismanaged: true,
            modifiedon: "2026-03-03T12:00:00Z",
          },
        ],
      },
    });

    registerListSolutions(server as never, config, client);

    const firstPageResponse = await server.getHandler("list_solutions")({ limit: 2 });
    const firstPagePayload = firstPageResponse.structuredContent as {
      data: {
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ friendlyname: string }>;
      };
    };

    expect(firstPageResponse.content[0].text).toContain("Showing 2 of 3 solutions.");
    expect(firstPagePayload.data.returnedCount).toBe(2);
    expect(firstPagePayload.data.totalCount).toBe(3);
    expect(firstPagePayload.data.hasMore).toBe(true);
    expect(firstPagePayload.data.nextCursor).toBe("2");
    expect(firstPagePayload.data.items.map((item) => item.friendlyname)).toEqual([
      "Core",
      "Extensions",
    ]);

    const secondPageResponse = await server.getHandler("list_solutions")({
      limit: 2,
      cursor: "2",
    });
    const secondPagePayload = secondPageResponse.structuredContent as {
      data: {
        cursor: string | null;
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ friendlyname: string }>;
      };
    };

    expect(secondPagePayload.data.cursor).toBe("2");
    expect(secondPagePayload.data.returnedCount).toBe(1);
    expect(secondPagePayload.data.totalCount).toBe(3);
    expect(secondPagePayload.data.hasMore).toBe(false);
    expect(secondPagePayload.data.nextCursor).toBeNull();
    expect(secondPagePayload.data.items.map((item) => item.friendlyname)).toEqual(["Reports"]);
  });
});
