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
          {
            solutioncomponentid: "sc-4",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
          {
            solutioncomponentid: "sc-5",
            objectid: "img-1",
            componenttype: 93,
            rootsolutioncomponentid: "sc-1",
          },
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
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Create",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "img-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name",
            messagepropertyname: "Target",
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
          {
            solutioncomponentid: "sc-4",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
          {
            solutioncomponentid: "sc-5",
            objectid: "img-1",
            componenttype: 93,
            rootsolutioncomponentid: "sc-1",
          },
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
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Create",
            stage: 40,
            mode: 0,
            rank: 1,
            statecode: 0,
            filteringattributes: "name,address1_city",
            supporteddeployment: 0,
            asyncautodelete: false,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "img-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name,address1_city",
            messagepropertyname: "Target",
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
    expect(text).toContain("### Plugin Steps");
    expect(text).toContain("Account Create");
    expect(text).toContain("stage: `20` -> `40`");
    expect(text).toContain("### Plugin Images");
    expect(text).toContain("attributes: `name` -> `name,address1_city`");
    expect(text).toContain("### Web Resources");
    expect(text).toContain("Only in dev:");
  });
});
