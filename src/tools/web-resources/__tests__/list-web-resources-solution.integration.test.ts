import { describe, expect, it } from "vitest";
import { registerListWebResources } from "../list-web-resources.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_web_resources solution filter", () => {
  it("filters web resources by solution", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "wr-1", componenttype: 61 }],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            displayname: "App Script",
            webresourcetype: 3,
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
          {
            webresourceid: "wr-2",
            name: "contoso_/scripts/admin.js",
            displayname: "Admin Script",
            webresourcetype: 3,
            ismanaged: false,
            modifiedon: "2026-03-01T12:00:00Z",
          },
        ],
      },
    });

    registerListWebResources(server as never, config, client);

    const response = await server.getHandler("list_web_resources")({
      solution: "Core",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("contoso_/scripts/app.js");
    expect(text).not.toContain("contoso_/scripts/admin.js");
  });
});
