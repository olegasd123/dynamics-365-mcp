import { describe, expect, it } from "vitest";
import { retrieveRequiredComponentsPath } from "../../../queries/dependency-queries.js";
import { registerReleaseGateReport } from "../release-gate-report.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("release_gate_report", () => {
  it("reports blockers, external dependency risk, and target drift", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev", "prod"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0",
            ismanaged: false,
          },
        ],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "form-1", componenttype: 24 },
          { solutioncomponentid: "sc-3", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-4", objectid: "flow-1", componenttype: 29 },
          { solutioncomponentid: "sc-5", objectid: "app-1", componenttype: 80 },
          { solutioncomponentid: "sc-6", objectid: "conn-1", componenttype: 371 },
          { solutioncomponentid: "sc-7", objectid: "env-def-1", componenttype: 380 },
          {
            solutioncomponentid: "sc-8",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
        ],
        [retrieveRequiredComponentsPath("sc-1", 91)]: [
          {
            dependencyid: "dep-1",
            dependencytype: 2,
            requiredcomponentobjectid: "wr-ext-1",
            requiredcomponenttype: 61,
            dependentcomponentobjectid: "asm-1",
            dependentcomponenttype: 91,
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
            name: "Disabled Step",
            statecode: 1,
            stage: 20,
            mode: 0,
            rank: 1,
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
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
            statuscode: 1,
            mode: 0,
            ismanaged: false,
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Draft Flow",
            uniquename: "contoso_DraftFlow",
            category: 5,
            statecode: 0,
            statuscode: 1,
            type: 1,
            clientdata: "{}",
            connectionreferences: "",
            ismanaged: false,
          },
        ],
        systemforms: [],
        savedqueries: [],
        webresourceset: [
          {
            webresourceid: "wr-ext-1",
            name: "contoso_/scripts/shared.js",
            webresourcetype: 3,
            ismanaged: true,
          },
        ],
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
        customapis: [],
      },
      prod: {
        solutions: [
          {
            solutionid: "sol-2",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "2.0.0",
            ismanaged: true,
          },
        ],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-3", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-4", objectid: "flow-1", componenttype: 29 },
          {
            solutioncomponentid: "sc-8",
            objectid: "step-1",
            componenttype: 92,
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
            name: "Disabled Step",
            statecode: 1,
            stage: 20,
            mode: 0,
            rank: 1,
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
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
            statuscode: 1,
            mode: 0,
            ismanaged: false,
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Draft Flow",
            uniquename: "contoso_DraftFlow",
            category: 5,
            statecode: 0,
            statuscode: 1,
            type: 1,
            clientdata: "{}",
            connectionreferences: "",
            ismanaged: false,
          },
        ],
        systemforms: [],
        savedqueries: [],
        webresourceset: [],
        appmodules: [],
        connectionreferences: [],
        environmentvariabledefinitions: [],
        environmentvariablevalues: [],
        customapis: [],
      },
    });

    registerReleaseGateReport(server as never, config, client);

    const response = await server.getHandler("release_gate_report")({
      environment: "dev",
      solution: "Core",
      targetEnvironment: "prod",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Release Gate Report");
    expect(response.content[0].text).toContain("Verdict: Stop");
    expect(response.content[0].text).toContain("External Dependency Samples");
    expect(response.content[0].text).toContain("Target Drift");
    expect(response.content[0].text).toContain("Disabled Plugin Steps");
    expect(response.structuredContent).toMatchObject({
      tool: "release_gate_report",
      ok: true,
      data: {
        verdict: "stop",
        riskLevel: "High",
        dependencyRisk: {
          counts: {
            external: 1,
            externalRequired: 1,
          },
        },
        drift: {
          targetEnvironment: "prod",
          totalChanges: 1,
        },
      },
    });
  });

  it("promotes unmanaged assets to blockers in strict mode", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0",
            ismanaged: false,
          },
        ],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 }],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
          },
        ],
        plugintypes: [],
        sdkmessageprocessingsteps: [],
        sdkmessageprocessingstepimages: [],
        workflows: [],
        systemforms: [],
        savedqueries: [],
        webresourceset: [],
        appmodules: [],
        connectionreferences: [],
        environmentvariabledefinitions: [],
        environmentvariablevalues: [],
        customapis: [],
      },
    });

    registerReleaseGateReport(server as never, config, client);

    const response = await server.getHandler("release_gate_report")({
      environment: "dev",
      solution: "Core",
      strict: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Strict Mode: Yes");
    expect(response.content[0].text).toContain("Verdict: Stop");
    expect(response.structuredContent).toMatchObject({
      tool: "release_gate_report",
      ok: true,
      data: {
        strict: true,
        verdict: "stop",
        blockers: expect.arrayContaining([
          expect.objectContaining({
            area: "Unmanaged Assets",
          }),
        ]),
      },
    });
  });
});
