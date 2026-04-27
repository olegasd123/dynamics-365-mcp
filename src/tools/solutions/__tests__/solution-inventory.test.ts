import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import {
  fetchSolutionComponentSets,
  fetchSolutionInventory,
  resolveSolution,
} from "../solution-inventory.js";

describe("solution inventory", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("resolves a solution by unique name and collects supported component ids", async () => {
    const { client, calls } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0.0",
            ismanaged: false,
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-table",
            objectid: "table-1",
            componenttype: 1,
          },
          {
            solutioncomponentid: "sc-column",
            objectid: "col-1",
            componenttype: 2,
          },
          {
            solutioncomponentid: "sc-role",
            objectid: "role-1",
            componenttype: 20,
          },
          {
            solutioncomponentid: "sc-1",
            objectid: "asm-1",
            componenttype: 91,
          },
          {
            solutioncomponentid: "sc-2",
            objectid: "form-1",
            componenttype: 24,
          },
          {
            solutioncomponentid: "sc-3",
            objectid: "view-1",
            componenttype: 26,
          },
          {
            solutioncomponentid: "sc-4",
            objectid: "wf-1",
            componenttype: 29,
          },
          {
            solutioncomponentid: "sc-template",
            objectid: "template-1",
            componenttype: 36,
          },
          {
            solutioncomponentid: "sc-5",
            objectid: "wr-1",
            componenttype: 61,
          },
          {
            solutioncomponentid: "sc-dashboard",
            objectid: "dash-1",
            componenttype: 60,
          },
          {
            solutioncomponentid: "sc-app",
            objectid: "app-1",
            componenttype: 80,
          },
          {
            solutioncomponentid: "sc-conn",
            objectid: "conn-1",
            componenttype: 371,
          },
          {
            solutioncomponentid: "sc-env-def",
            objectid: "env-def-1",
            componenttype: 380,
          },
          {
            solutioncomponentid: "sc-env-value",
            objectid: "env-val-1",
            componenttype: 381,
          },
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
            RequiredLevel: "None",
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
          },
          {
            formid: "dash-1",
            name: "Sales Dashboard",
            objecttypecode: "account",
            type: 0,
            ismanaged: false,
          },
        ],
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
          },
        ],
        templates: [
          {
            templateid: "template-1",
            title: "Welcome Contact",
            templatetypecode: "contact",
            ispersonal: false,
          },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
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
            modifiedon: "2026-03-04T12:00:00Z",
          },
        ],
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_saleshub",
            ismanaged: false,
            modifiedon: "2026-03-04T12:00:00Z",
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
            modifiedon: "2026-03-04T12:00:00Z",
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
            modifiedon: "2026-03-04T12:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://dev.example.test",
            ismanaged: false,
            modifiedon: "2026-03-04T12:00:00Z",
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
      },
    });

    const solution = await resolveSolution(env, client, "contoso_core");
    const componentSets = await fetchSolutionComponentSets(env, client, "Core");
    const inventory = await fetchSolutionInventory(env, client, "Core");

    expect(solution.friendlyname).toBe("Core");
    expect(componentSets.tableIds).toEqual(new Set(["table-1"]));
    expect(componentSets.columnIds).toEqual(new Set(["col-1"]));
    expect(componentSets.securityRoleIds).toEqual(new Set(["role-1"]));
    expect(componentSets.pluginAssemblyIds).toEqual(new Set(["asm-1"]));
    expect(componentSets.formIds).toEqual(new Set(["form-1"]));
    expect(componentSets.viewIds).toEqual(new Set(["view-1"]));
    expect(componentSets.workflowIds).toEqual(new Set(["wf-1"]));
    expect(componentSets.emailTemplateIds).toEqual(new Set(["template-1"]));
    expect(componentSets.dashboardIds).toEqual(new Set(["dash-1"]));
    expect(componentSets.webResourceIds).toEqual(new Set(["wr-1"]));
    expect(componentSets.appModuleIds).toEqual(new Set(["app-1"]));
    expect(componentSets.pluginStepIds).toEqual(new Set(["step-1"]));
    expect(componentSets.pluginImageIds).toEqual(new Set(["img-1"]));
    expect(componentSets.connectionReferenceIds).toEqual(new Set(["conn-1"]));
    expect(componentSets.environmentVariableDefinitionIds).toEqual(new Set(["env-def-1"]));
    expect(componentSets.environmentVariableValueIds).toEqual(new Set(["env-val-1"]));
    expect(componentSets.unsupportedRootComponents).toHaveLength(0);
    expect(componentSets.childComponents).toHaveLength(2);
    expect(inventory.tables).toHaveLength(1);
    expect(inventory.columns).toHaveLength(1);
    expect(inventory.securityRoles).toHaveLength(1);
    expect(inventory.forms).toHaveLength(1);
    expect(inventory.views).toHaveLength(1);
    expect(inventory.emailTemplates).toHaveLength(1);
    expect(inventory.dashboards).toHaveLength(1);
    expect(inventory.appModules).toHaveLength(1);
    expect(inventory.connectionReferences).toHaveLength(1);
    expect(inventory.environmentVariableDefinitions).toHaveLength(1);
    expect(inventory.environmentVariableValues).toHaveLength(1);
    expect(inventory.pluginSteps).toHaveLength(1);
    expect(inventory.pluginImages).toHaveLength(1);
    expect(calls.filter((call) => call.entitySet === "EntityDefinitions")).toHaveLength(1);
    expect(calls.find((call) => call.entitySet === "EntityDefinitions")?.queryParams).toContain(
      "MetadataId eq ",
    );
  });

  it("throws an ambiguous error when multiple solutions match the same display name", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          { solutionid: "sol-1", friendlyname: "Core", uniquename: "core_a" },
          { solutionid: "sol-2", friendlyname: "Core", uniquename: "core_b" },
        ],
      },
    });

    await expect(resolveSolution(env, client, "Core")).rejects.toThrow(
      "Solution 'Core' is ambiguous in 'dev'.",
    );
  });
});
