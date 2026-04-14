import { describe, expect, it } from "vitest";
import { registerAnalyzeImpact } from "../analyze-impact.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";
import {
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../../../queries/dependency-queries.js";

describe("analyze_impact tool", () => {
  it("analyzes table and column impact with usage sections", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const accountFlowClientData = JSON.stringify({
      properties: {
        definition: {
          triggers: { manual: {} },
          actions: { Update_row: { entityName: "account", columnName: "name" } },
        },
      },
    });

    const { client } = createRecordingClient({
      dev: {
        solutioncomponents: [
          { solutioncomponentid: "sc-table", objectid: "table-1", componenttype: 1 },
          { solutioncomponentid: "sc-column", objectid: "col-1", componenttype: 2 },
        ],
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
          },
        ],
        "EntityDefinitions(LogicalName='account')/Attributes": [
          {
            MetadataId: "col-1",
            LogicalName: "name",
            SchemaName: "Name",
            DisplayName: { UserLocalizedLabel: { Label: "Account Name" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "ApplicationRequired" },
            IsPrimaryId: false,
            IsPrimaryName: true,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
            MaxLength: 160,
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
        "EntityDefinitions(LogicalName='account')/ManyToOneRelationships": [
          {
            MetadataId: "rel-1",
            SchemaName: "contact_customer_accounts",
            ReferencedEntity: "contact",
            ReferencedAttribute: "contactid",
            ReferencingEntity: "account",
            ReferencingAttribute: "primarycontactid",
          },
        ],
        "EntityDefinitions(LogicalName='account')/OneToManyRelationships": [],
        "EntityDefinitions(LogicalName='account')/ManyToManyRelationships": [],
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }],
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
            name: "Account Update",
            statecode: 0,
            filteringattributes: "name",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "img-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            attributes: "name",
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
            triggeronupdateattributelist: "name",
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Account Flow",
            uniquename: "contoso_AccountFlow",
            category: 5,
            statecode: 1,
            type: 1,
            clientdata: accountFlowClientData,
            connectionreferences: "",
          },
          {
            workflowid: "wf-2",
            name: "Account Consumer",
            uniquename: "contoso_AccountConsumer",
            category: 0,
            statecode: 1,
          },
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            uniquename: "contoso_account_main",
            formxml:
              "<form><tabs><tab name='general'><columns><column><sections><section name='summary'><rows><row><cell><control id='name' datafieldname='name' /></cell></row></rows></section></sections></column></columns></tab></tabs></form>",
          },
        ],
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
            querytype: 0,
            fetchxml: "<fetch><entity name='account'><attribute name='name' /></entity></fetch>",
            layoutxml: "<grid><row id='accountid'><cell name='name' /></row></grid>",
          },
        ],
        customapis: [
          {
            customapiid: "api-1",
            name: "Do Thing",
            uniquename: "contoso_DoThing",
            boundentitylogicalname: "account",
            bindingtype: 1,
            allowedcustomprocessingsteptype: 0,
            statecode: 0,
          },
        ],
        customapirequestparameters: [],
        customapiresponseproperties: [],
        [retrieveDependentComponentsPath("sc-table", 1)]: [
          {
            dependencyid: "dep-table-1",
            dependencytype: 2,
            requiredcomponentobjectid: "table-1",
            requiredcomponenttype: 1,
            dependentcomponentobjectid: "wf-2",
            dependentcomponenttype: 29,
          },
        ],
      },
    });

    registerAnalyzeImpact(server as never, config, client);

    const tableResponse = await server.getHandler("analyze_impact")({
      componentType: "table",
      name: "account",
    });
    const columnResponse = await server.getHandler("analyze_impact")({
      componentType: "column",
      name: "name",
      table: "account",
    });

    expect(tableResponse.isError).toBeUndefined();
    expect(tableResponse.content[0].text).toContain("Impact Analysis: Table");
    expect(tableResponse.content[0].text).toContain("### Forms");
    expect(tableResponse.content[0].text).toContain("Account Main");
    expect(tableResponse.content[0].text).toContain("### Dependencies");
    expect(tableResponse.content[0].text).toContain("Account Consumer");
    expect(tableResponse.structuredContent).toMatchObject({
      data: {
        analysis: {
          componentType: "table",
          dependencyCountTotal: 1,
        },
      },
    });

    expect(columnResponse.isError).toBeUndefined();
    expect(columnResponse.content[0].text).toContain("Impact Analysis: Column account.name");
    expect(columnResponse.content[0].text).toContain("### Plugin Steps");
    expect(columnResponse.content[0].text).toContain("### Views");
    expect(columnResponse.content[0].text).toContain("Active Accounts");
    expect(columnResponse.structuredContent).toMatchObject({
      data: {
        analysis: {
          componentType: "column",
          target: {
            name: "account.name",
          },
        },
      },
    });
  });

  it("analyzes plugin impact with step and dependency sections", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutioncomponents: [
          { solutioncomponentid: "sc-asm", objectid: "asm-1", componenttype: 91 },
          { solutioncomponentid: "sc-step", objectid: "step-1", componenttype: 92 },
          { solutioncomponentid: "sc-img", objectid: "img-1", componenttype: 93 },
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
            workflowid: "wf-2",
            name: "External Flow",
            uniquename: "contoso_ExternalFlow",
            category: 0,
            statecode: 1,
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-2",
            name: "contoso_/scripts/shared.js",
            webresourcetype: 3,
          },
        ],
        [retrieveRequiredComponentsPath("sc-step", 92)]: [
          {
            dependencyid: "dep-1",
            dependencytype: 2,
            requiredcomponentobjectid: "wr-2",
            requiredcomponenttype: 61,
            dependentcomponentobjectid: "step-1",
            dependentcomponenttype: 92,
          },
        ],
        [retrieveDependentComponentsPath("sc-step", 92)]: [
          {
            dependencyid: "dep-2",
            dependencytype: 2,
            requiredcomponentobjectid: "step-1",
            requiredcomponenttype: 92,
            dependentcomponentobjectid: "wf-2",
            dependentcomponenttype: 29,
          },
        ],
      },
    });

    registerAnalyzeImpact(server as never, config, client);

    const response = await server.getHandler("analyze_impact")({
      componentType: "plugin",
      name: "Core.Plugins",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Impact Analysis: Plugin Assembly Core.Plugins");
    expect(response.content[0].text).toContain("### Plugin Steps");
    expect(response.content[0].text).toContain("Account Create");
    expect(response.content[0].text).toContain("### Dependencies");
    expect(response.content[0].text).toContain("contoso_/scripts/shared.js");
    expect(response.content[0].text).toContain("External Flow");
    expect(response.structuredContent).toMatchObject({
      data: {
        analysis: {
          componentType: "plugin",
          dependencyCountTotal: 2,
          metadata: {
            stepCount: 1,
            imageCount: 1,
          },
        },
      },
    });
  });

  it("returns structured retry options for ambiguous impact targets", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
          },
        ],
        "EntityDefinitions(LogicalName='account')/Attributes": [
          {
            MetadataId: "col-1",
            LogicalName: "faxnumber",
            SchemaName: "FaxNumber",
            DisplayName: { UserLocalizedLabel: { Label: "Fax Number" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-2",
            LogicalName: "faxextension",
            SchemaName: "FaxExtension",
            DisplayName: { UserLocalizedLabel: { Label: "Fax Extension" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
        ],
        pluginassemblies: [
          { pluginassemblyid: "asm-1", name: "Core.Plugins" },
          { pluginassemblyid: "asm-2", name: "core.plugins" },
        ],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Shared Workflow",
            uniquename: "contoso_SharedWorkflow_A",
            category: 0,
            statecode: 1,
          },
          {
            workflowid: "wf-2",
            name: "Shared Workflow",
            uniquename: "contoso_SharedWorkflow_B",
            category: 0,
            statecode: 1,
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/shared.js",
            webresourcetype: 3,
          },
          {
            webresourceid: "wr-2",
            name: "contoso_/scripts/shared.js",
            webresourcetype: 3,
          },
        ],
      },
    });

    registerAnalyzeImpact(server as never, config, client);

    const columnResponse = await server.getHandler("analyze_impact")({
      componentType: "column",
      name: "fax",
      table: "account",
    });
    const pluginResponse = await server.getHandler("analyze_impact")({
      componentType: "plugin",
      name: "CORE.PLUGINS",
    });
    const workflowResponse = await server.getHandler("analyze_impact")({
      componentType: "workflow",
      name: "Shared Workflow",
    });
    const resourceResponse = await server.getHandler("analyze_impact")({
      componentType: "web_resource",
      name: "contoso_/scripts/shared.js",
    });

    expect(columnResponse.isError).toBe(true);
    expect(columnResponse.structuredContent).toMatchObject({
      tool: "analyze_impact",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "name",
        options: [
          { value: "faxextension", label: "faxextension" },
          { value: "faxnumber", label: "faxnumber" },
        ],
        retryable: false,
      },
    });

    expect(pluginResponse.isError).toBe(true);
    expect(pluginResponse.structuredContent).toMatchObject({
      tool: "analyze_impact",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "name",
        options: [
          { value: "asm-1", label: "Core.Plugins (asm-1)" },
          { value: "asm-2", label: "core.plugins (asm-2)" },
        ],
        retryable: false,
      },
    });

    expect(workflowResponse.isError).toBe(true);
    expect(workflowResponse.structuredContent).toMatchObject({
      tool: "analyze_impact",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "name",
        options: [
          {
            value: "contoso_SharedWorkflow_A",
            label: "Shared Workflow (contoso_SharedWorkflow_A)",
          },
          {
            value: "contoso_SharedWorkflow_B",
            label: "Shared Workflow (contoso_SharedWorkflow_B)",
          },
        ],
        retryable: false,
      },
    });

    expect(resourceResponse.isError).toBe(true);
    expect(resourceResponse.structuredContent).toMatchObject({
      tool: "analyze_impact",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "name",
        options: [
          {
            value: "wr-1",
            label: "contoso_/scripts/shared.js (wr-1)",
          },
          {
            value: "wr-2",
            label: "contoso_/scripts/shared.js (wr-2)",
          },
        ],
        retryable: false,
      },
    });
  });
});
