import { describe, expect, it } from "vitest";
import { registerCompareSolutions } from "../compare-solutions.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_solutions tool", () => {
  it("compares solution components across two environments", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev", "prod"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          { solutionid: "sol-dev", friendlyname: "Core", uniquename: "contoso_core" },
        ],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-3", objectid: "wr-1", componenttype: 61 },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
          },
        ],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 0,
            statecode: 1,
            statuscode: 2,
            mode: 0,
            ismanaged: false,
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            ismanaged: false,
          },
        ],
      },
      prod: {
        solutions: [
          { solutionid: "sol-prod", friendlyname: "Core", uniquename: "contoso_core" },
        ],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "wf-1", componenttype: 29 },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "2.0.0",
            isolationmode: 2,
            ismanaged: false,
          },
        ],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 0,
            statecode: 1,
            statuscode: 2,
            mode: 0,
            ismanaged: false,
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            ismanaged: false,
          },
        ],
      },
    });

    registerCompareSolutions(server as never, config, client);

    const response = await server.getHandler("compare_solutions")({
      sourceEnvironment: "dev",
      targetEnvironment: "prod",
      solution: "Core",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Solution Comparison");
    expect(text).toContain("### Plugin Assemblies");
    expect(text).toContain("Core.Plugins");
    expect(text).toContain("version: `1.0.0` -> `2.0.0`");
    expect(text).toContain("### Web Resources");
    expect(text).toContain("Only in dev:");
  });
});
