import { describe, expect, it } from "vitest";
import { registerGetPublisherDetails } from "../get-publisher-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_publisher_details", () => {
  it("returns one publisher with related solutions", async () => {
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
            description: "Contoso publisher",
            emailaddress: "d365@contoso.com",
            supportingwebsiteurl: "https://contoso.example",
            isreadonly: false,
            modifiedon: "2026-04-05T00:00:00Z",
            versionnumber: "12345",
          },
        ],
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0.0",
            ismanaged: false,
            publisherid: "pub-1",
            modifiedon: "2026-04-06T00:00:00Z",
          },
          {
            solutionid: "sol-2",
            friendlyname: "Sales",
            uniquename: "contoso_sales",
            version: "1.1.0.0",
            ismanaged: true,
            publisherid: "pub-1",
            modifiedon: "2026-04-07T00:00:00Z",
          },
        ],
      },
    });

    registerGetPublisherDetails(server as never, config, client);
    const response = await server.getHandler("get_publisher_details")({
      environment: "dev",
      publisher: "cts",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("## Publisher: Contoso");
    expect(response.content[0]?.text).toContain("Customization Prefix: cts");
    expect(response.content[0]?.text).toContain("Related Solutions: 2");
    expect(response.structuredContent?.data.publisher).toEqual(
      expect.objectContaining({
        publisherid: "pub-1",
        friendlyname: "Contoso",
        customizationprefix: "cts",
      }),
    );
    expect(response.structuredContent?.data.relatedSolutions).toEqual([
      expect.objectContaining({
        solutionid: "sol-1",
        friendlyname: "Core",
      }),
      expect.objectContaining({
        solutionid: "sol-2",
        friendlyname: "Sales",
      }),
    ]);
  });

  it("returns structured retry options when the publisher is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        publishers: [
          {
            publisherid: "pub-1",
            friendlyname: "Contoso",
            uniquename: "contoso_core",
            customizationprefix: "cts",
          },
          {
            publisherid: "pub-2",
            friendlyname: "Contoso",
            uniquename: "contoso_sales",
            customizationprefix: "cts2",
          },
        ],
      },
    });

    registerGetPublisherDetails(server as never, config, client);
    const response = await server.getHandler("get_publisher_details")({
      environment: "dev",
      publisher: "Contoso",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a publisher and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_publisher_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "publisher",
        options: [
          { value: "pub-1", label: "Contoso [contoso_core, prefix=cts]" },
          { value: "pub-2", label: "Contoso [contoso_sales, prefix=cts2]" },
        ],
        retryable: false,
      },
    });
  });
});
