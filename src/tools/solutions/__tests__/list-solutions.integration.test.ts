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
  });
});
