import { describe, expect, it } from "vitest";
import { registerGetWebResourceContent } from "../get-web-resource-content.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_web_resource_content tool", () => {
  it("supports web resource ids as stable lookup values", async () => {
    const webResourceId = "11111111-1111-1111-1111-111111111111";
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        webresourceset: [
          {
            webresourceid: webResourceId,
            name: "new_/scripts/main.js",
            displayname: "Main Script",
            webresourcetype: 3,
            content: Buffer.from("console.log('hello');", "utf8").toString("base64"),
          },
        ],
      },
    });

    registerGetWebResourceContent(server as never, config, client);

    const response = await server.getHandler("get_web_resource_content")({
      name: webResourceId,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("console.log('hello');");
    expect(calls[0]?.queryParams).toContain(`webresourceid eq ${webResourceId}`);
  });

  it("does not compare the id column with a web resource name", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        webresourceset: [
          {
            webresourceid: "11111111-1111-1111-1111-111111111111",
            name: "mso_/facturation/form.js",
            displayname: "Facturation Form",
            webresourcetype: 3,
            content: Buffer.from("console.log('facturation');", "utf8").toString("base64"),
          },
        ],
      },
    });

    registerGetWebResourceContent(server as never, config, client);

    const response = await server.getHandler("get_web_resource_content")({
      name: "mso_/facturation/form.js",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("console.log('facturation');");
    expect(calls[0]?.queryParams).toContain("name eq 'mso_/facturation/form.js'");
    expect(calls[0]?.queryParams).not.toContain("or webresourceid");
  });

  it("returns structured retry options when the web resource name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "new_/scripts/main.js",
            displayname: "Main Script",
            webresourcetype: 3,
            content: Buffer.from("console.log('one');", "utf8").toString("base64"),
          },
          {
            webresourceid: "wr-2",
            name: "new_/scripts/main.js",
            displayname: "Main Script Copy",
            webresourcetype: 3,
            content: Buffer.from("console.log('two');", "utf8").toString("base64"),
          },
        ],
      },
    });

    registerGetWebResourceContent(server as never, config, client);

    const response = await server.getHandler("get_web_resource_content")({
      name: "new_/scripts/main.js",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Choose a web resource and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_web_resource_content",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "name",
        options: [
          {
            value: "wr-1",
            label: "new_/scripts/main.js - Main Script (wr-1)",
          },
          {
            value: "wr-2",
            label: "new_/scripts/main.js - Main Script Copy (wr-2)",
          },
        ],
        retryable: false,
      },
    });
  });
});
