import { describe, expect, it } from "vitest";
import { registerGetSolutionDetails } from "../get-solution-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_solution_details tool", () => {
  it("renders supported solution components", async () => {
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
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "form-1", componenttype: 24 },
          { solutioncomponentid: "sc-3", objectid: "view-1", componenttype: 26 },
          { solutioncomponentid: "sc-4", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-5", objectid: "wr-1", componenttype: 61 },
          {
            solutioncomponentid: "sc-6",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
          {
            solutioncomponentid: "sc-7",
            objectid: "img-1",
            componenttype: 93,
            rootsolutioncomponentid: "sc-1",
          },
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            isdefault: true,
            ismanaged: false,
            modifiedon: "2026-03-02T12:00:00Z",
          },
        ],
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
            modifiedon: "2026-03-02T12:00:00Z",
          },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.2.3",
            isolationmode: 2,
            ismanaged: false,
            modifiedon: "2026-03-02T12:00:00Z",
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
            primaryentity: "account",
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            displayname: "App Script",
            webresourcetype: 3,
            ismanaged: false,
            modifiedon: "2026-03-03T12:00:00Z",
          },
        ],
      },
    });

    registerGetSolutionDetails(server as never, config, client);

    const response = await server.getHandler("get_solution_details")({
      solution: "Core",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Solution: Core");
    expect(text).toContain(
      "**Supported Root Components**: Plugins 1 | Forms 1 | Views 1 | Workflows 1 | Web Resources 1",
    );
    expect(text).toContain("**Supported Child Components**: Plugin Steps 1 | Plugin Images 1");
    expect(text).toContain("### Plugin Assemblies");
    expect(text).toContain("Core.Plugins");
    expect(text).toContain("### Forms");
    expect(text).toContain("Account Main");
    expect(text).toContain("### Views");
    expect(text).toContain("Active Accounts");
    expect(text).toContain("### Plugin Steps");
    expect(text).toContain("Account Create");
    expect(text).toContain("### Plugin Images");
    expect(text).toContain("PreImage");
    expect(text).toContain("### Workflows");
    expect(text).toContain("Account Sync");
    expect(text).toContain("### Web Resources");
    expect(text).toContain("contoso_/scripts/app.js");
    expect(text).not.toContain("### Other Root Components");
  });
});
