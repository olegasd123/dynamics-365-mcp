import { describe, expect, it } from "vitest";
import { registerListPublishers } from "../list-publishers.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_publishers", () => {
  it("lists publishers with prefix metadata", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        publishers: [
          {
            publisherid: "pub-1",
            friendlyname: "Contoso",
            uniquename: "contoso",
            customizationprefix: "cts",
            customizationoptionvalueprefix: 72700,
            isreadonly: false,
            modifiedon: "2026-04-05T00:00:00Z",
            versionnumber: "12345",
          },
        ],
      },
    });

    registerListPublishers(server as never, config, client);

    const response = await server.getHandler("list_publishers")({
      environment: "dev",
      nameFilter: "Contoso",
      prefixFilter: "cts",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain(
      "## Publishers in 'dev' (name='Contoso', prefix='cts')",
    );
    expect(response.content[0]?.text).toContain("Contoso");
    expect(response.content[0]?.text).toContain("72700");
    expect(response.structuredContent).toMatchObject({
      tool: "list_publishers",
      ok: true,
      data: {
        environment: "dev",
        limit: 50,
        cursor: null,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
        filters: {
          nameFilter: "Contoso",
          prefixFilter: "cts",
        },
      },
    });
  });

  it("supports paging for publisher lists", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        publishers: [
          {
            publisherid: "pub-1",
            friendlyname: "Alpha",
            uniquename: "alpha",
            customizationprefix: "alp",
            customizationoptionvalueprefix: 10000,
            modifiedon: "2026-04-01T00:00:00Z",
          },
          {
            publisherid: "pub-2",
            friendlyname: "Bravo",
            uniquename: "bravo",
            customizationprefix: "brv",
            customizationoptionvalueprefix: 20000,
            modifiedon: "2026-04-02T00:00:00Z",
          },
          {
            publisherid: "pub-3",
            friendlyname: "Charlie",
            uniquename: "charlie",
            customizationprefix: "chr",
            customizationoptionvalueprefix: 30000,
            modifiedon: "2026-04-03T00:00:00Z",
          },
        ],
      },
    });

    registerListPublishers(server as never, config, client);

    const firstPageResponse = await server.getHandler("list_publishers")({ limit: 2 });
    const firstPagePayload = firstPageResponse.structuredContent as {
      data: {
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ friendlyname: string }>;
      };
    };

    expect(firstPageResponse.content[0]?.text).toContain("Showing 2 of 3 publishers.");
    expect(firstPagePayload.data.returnedCount).toBe(2);
    expect(firstPagePayload.data.totalCount).toBe(3);
    expect(firstPagePayload.data.hasMore).toBe(true);
    expect(firstPagePayload.data.nextCursor).toBe("2");
    expect(firstPagePayload.data.items.map((item) => item.friendlyname)).toEqual([
      "Alpha",
      "Bravo",
    ]);

    const secondPageResponse = await server.getHandler("list_publishers")({
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
    expect(secondPagePayload.data.items.map((item) => item.friendlyname)).toEqual(["Charlie"]);
  });
});
