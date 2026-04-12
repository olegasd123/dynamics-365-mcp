import { describe, expect, it } from "vitest";
import { registerCompareWebResources } from "../compare-web-resources.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_web_resources", () => {
  it("shows content hash drift when compareContent is enabled", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "new_/scripts/main.js",
            webresourcetype: 3,
            ismanaged: false,
            content: "console.log('prod');",
          },
        ],
      },
      dev: {
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "new_/scripts/main.js",
            webresourcetype: 3,
            ismanaged: false,
            content: "console.log('dev');",
          },
        ],
      },
    });

    registerCompareWebResources(server as never, config, client);
    const response = await server.getHandler("compare_web_resources")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      compareContent: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("contentHash");
    expect(response.structuredContent).toMatchObject({
      data: {
        filters: {
          compareContent: true,
        },
      },
    });
  });
});
