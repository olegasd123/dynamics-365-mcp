import { describe, expect, it } from "vitest";
import { registerEnvironmentHealthReport } from "../environment-health-report.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("environment_health_report", () => {
  it("reports release risks and missing solution components", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "form-1", componenttype: 24 },
          { solutioncomponentid: "sc-3", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-4", objectid: "app-1", componenttype: 80 },
          { solutioncomponentid: "sc-5", objectid: "conn-1", componenttype: 371 },
          { solutioncomponentid: "sc-6", objectid: "env-def-1", componenttype: 380 },
        ],
        EntityDefinitions: [],
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins", ismanaged: false }],
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
            name: "Disabled Step",
            statecode: 1,
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Draft Workflow",
            uniquename: "contoso_DraftWorkflow",
            category: 0,
            statecode: 0,
            ismanaged: false,
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Draft Flow",
            uniquename: "contoso_DraftFlow",
            category: 5,
            statecode: 0,
            type: 1,
            clientdata: "{}",
            connectionreferences: "",
            ismanaged: false,
          },
        ],
        systemforms: [],
        savedqueries: [],
        webresourceset: [],
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_saleshub",
            statecode: 1,
            ismanaged: false,
          },
        ],
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_sharedoffice365",
            displayname: "Shared Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "",
            statecode: 0,
            ismanaged: false,
          },
        ],
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://example.test",
            ismanaged: false,
          },
        ],
        environmentvariablevalues: [],
        customapis: [
          {
            customapiid: "api-1",
            name: "Inactive API",
            uniquename: "contoso_InactiveApi",
            statecode: 1,
            ismanaged: false,
          },
        ],
      },
    });

    registerEnvironmentHealthReport(server as never, config, client);
    const response = await server.getHandler("environment_health_report")({
      solution: "Core",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Risk Level: High Risk");
    expect(response.content[0].text).toContain("Disabled Plugin Steps");
    expect(response.content[0].text).toContain("Draft Workflow");
    expect(response.content[0].text).toContain("Inactive App Modules");
    expect(response.content[0].text).toContain("Risky Connection References");
    expect(response.content[0].text).toContain("Missing Environment Variable Values");
    expect(response.content[0].text).toContain("Missing Components");
    expect(response.content[0].text).toContain("Forms");
  });
});
