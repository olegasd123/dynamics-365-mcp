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
          { solutioncomponentid: "sc-table", objectid: "table-1", componenttype: 1 },
          { solutioncomponentid: "sc-column", objectid: "col-1", componenttype: 2 },
          { solutioncomponentid: "sc-role", objectid: "role-1", componenttype: 20 },
          { solutioncomponentid: "sc-1", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-2", objectid: "form-1", componenttype: 24 },
          { solutioncomponentid: "sc-3", objectid: "view-1", componenttype: 26 },
          { solutioncomponentid: "sc-4", objectid: "wf-1", componenttype: 29 },
          { solutioncomponentid: "sc-5", objectid: "wr-1", componenttype: 61 },
          { solutioncomponentid: "sc-dashboard", objectid: "dash-1", componenttype: 60 },
          { solutioncomponentid: "sc-app", objectid: "app-1", componenttype: 80 },
          { solutioncomponentid: "sc-conn", objectid: "conn-1", componenttype: 371 },
          { solutioncomponentid: "sc-env-def", objectid: "env-def-1", componenttype: 380 },
          { solutioncomponentid: "sc-env-value", objectid: "env-val-1", componenttype: 381 },
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
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: "Account",
            DisplayCollectionName: "Accounts",
            Description: "Account table",
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: "UserOwned",
            IsCustomEntity: false,
            IsManaged: false,
            IsActivity: false,
            IsAuditEnabled: true,
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
        ],
        "EntityDefinitions(LogicalName='account')/Attributes": [
          {
            MetadataId: "col-1",
            LogicalName: "new_code",
            SchemaName: "new_Code",
            DisplayName: "Code",
            Description: "Code",
            AttributeType: "String",
            AttributeTypeName: "StringType",
            RequiredLevel: "ApplicationRequired",
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: true,
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: true,
            IsSecured: false,
            Targets: [],
            FormatName: "Text",
          },
        ],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.BooleanAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata":
          [],
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
          {
            formid: "dash-1",
            name: "Sales Dashboard",
            objecttypecode: "account",
            type: 0,
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
        roles: [
          {
            roleid: "role-1",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Main BU",
            _parentrootroleid_value: "role-root-1",
            _roletemplateid_value: "tmpl-1",
            ismanaged: false,
            modifiedon: "2026-03-02T12:00:00Z",
          },
        ],
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_saleshub",
            ismanaged: false,
            modifiedon: "2026-03-03T12:00:00Z",
            statecode: 0,
          },
        ],
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_sharedoffice365",
            displayname: "Shared Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "connection-1",
            ismanaged: false,
            modifiedon: "2026-03-03T12:00:00Z",
            statecode: 0,
          },
        ],
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://example.test",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2026-03-03T12:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://dev.example.test",
            ismanaged: false,
            modifiedon: "2026-03-03T12:00:00Z",
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
    expect(text).toContain("### Supported Coverage");
    expect(text).toContain("Tables");
    expect(text).toContain("Columns");
    expect(text).toContain("Security Roles");
    expect(text).toContain("App Modules");
    expect(text).toContain("Connection References");
    expect(text).toContain("Environment Variable Definitions");
    expect(text).toContain("### Plugin Assemblies");
    expect(text).toContain("Core.Plugins");
    expect(text).toContain("### Tables");
    expect(text).toContain("Account");
    expect(text).toContain("### Columns");
    expect(text).toContain("new_code");
    expect(text).toContain("### Security Roles");
    expect(text).toContain("Salesperson");
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
    expect(text).toContain("### Dashboards");
    expect(text).toContain("Sales Dashboard");
    expect(text).toContain("### Web Resources");
    expect(text).toContain("contoso_/scripts/app.js");
    expect(text).toContain("### App Modules");
    expect(text).toContain("Sales Hub");
    expect(text).toContain("### Connection References");
    expect(text).toContain("Shared Office 365");
    expect(text).toContain("### Environment Variable Definitions");
    expect(text).toContain("contoso_BaseUrl");
    expect(text).toContain("### Environment Variable Values");
    expect(text).toContain("https://dev.example.test");
    expect(text).not.toContain("### Other Root Components");
  });
});
