import { describe, expect, it } from "vitest";
import { registerAnalyzeCreateTriggers } from "../analyze-create-triggers.js";
import { registerAnalyzeUpdateTriggers } from "../analyze-update-triggers.js";
import { registerFindColumnUsage } from "../find-column-usage.js";
import { registerFindTableUsage } from "../find-table-usage.js";
import { registerFindWebResourceUsage } from "../find-web-resource-usage.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("usage tools", () => {
  it("finds table, column, and web resource usage", async () => {
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
    const htmlContent = Buffer.from("<script src='contoso_/scripts/app.js'></script>").toString(
      "base64",
    );

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
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            uniquename: "contoso_account_main",
            formxml:
              "<form><tabs><tab name='general'><columns><column><sections><section name='summary'><rows><row><cell><control id='name' datafieldname='name' /></cell></row></rows></section></sections></column></columns></tab></tabs><Library name='contoso_/scripts/app.js' /></form>",
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
        customapirequestparameters: [
          {
            customapirequestparameterid: "req-1",
            _customapiid_value: "api-1",
            name: "Target",
            logicalentityname: "account",
            type: 5,
            statecode: 0,
          },
        ],
        customapiresponseproperties: [],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            content: Buffer.from("console.log('app');").toString("base64"),
          },
          {
            webresourceid: "wr-2",
            name: "contoso_/pages/page.html",
            webresourcetype: 1,
            content: htmlContent,
          },
        ],
      },
    });

    registerFindTableUsage(server as never, config, client);
    registerFindColumnUsage(server as never, config, client);
    registerFindWebResourceUsage(server as never, config, client);

    const tableResponse = await server.getHandler("find_table_usage")({ table: "account" });
    const columnResponse = await server.getHandler("find_column_usage")({
      table: "account",
      column: "name",
    });
    const webResourceResponse = await server.getHandler("find_web_resource_usage")({
      name: "contoso_/scripts/app.js",
    });

    expect(tableResponse.content[0].text).toContain("Account Update");
    expect(tableResponse.content[0].text).toContain("Do Thing");
    expect(tableResponse.content[0].text).toContain("Account Flow");
    expect(columnResponse.content[0].text).toContain("Account Main");
    expect(columnResponse.content[0].text).toContain("Active Accounts");
    expect(webResourceResponse.content[0].text).toContain("Account Main");
    expect(webResourceResponse.content[0].text).toContain("contoso_/pages/page.html");
  });

  it("analyzes direct update triggers without guessing from system-managed fields", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const relatedFlowClientData = JSON.stringify({
      properties: {
        definition: {
          triggers: { When_contact_changes: { entityName: "contact", columnName: "firstname" } },
          actions: {},
        },
      },
    });

    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "contact",
            SchemaName: "Contact",
            DisplayName: { UserLocalizedLabel: { Label: "Contact" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Contacts" } },
            EntitySetName: "contacts",
            PrimaryIdAttribute: "contactid",
            PrimaryNameAttribute: "fullname",
            OwnershipType: { Value: "UserOwned" },
          },
        ],
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "Plugin1",
            typename: "Core.Plugins.Plugin1",
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "Plugin2",
            typename: "Core.Plugins.Plugin2",
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-3",
            name: "Plugin3",
            typename: "Core.Plugins.Plugin3",
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-4",
            name: "PluginAny",
            typename: "Core.Plugins.PluginAny",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Plugin1 Step",
            statecode: 0,
            stage: 20,
            mode: 0,
            filteringattributes: "firstname",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-2",
            name: "Plugin2 Step",
            statecode: 0,
            stage: 20,
            mode: 0,
            filteringattributes: "lastname,modifiedon",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
          {
            sdkmessageprocessingstepid: "step-3",
            _eventhandler_value: "type-3",
            name: "Plugin3 Step",
            statecode: 0,
            stage: 40,
            mode: 1,
            filteringattributes: "modifiedby",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
          {
            sdkmessageprocessingstepid: "step-4",
            _eventhandler_value: "type-4",
            name: "PluginAny Step",
            statecode: 0,
            stage: 40,
            mode: 0,
            filteringattributes: "",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
        ],
        sdkmessageprocessingstepimages: [],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Contact First Name Sync",
            uniquename: "contoso_ContactFirstNameSync",
            category: 0,
            statecode: 1,
            mode: 1,
            primaryentity: "contact",
            triggeronupdateattributelist: "firstname",
          },
          {
            workflowid: "wf-2",
            name: "Contact Last Name Sync",
            uniquename: "contoso_ContactLastNameSync",
            category: 0,
            statecode: 1,
            mode: 1,
            primaryentity: "contact",
            triggeronupdateattributelist: "lastname,modifiedon",
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Contact Flow",
            uniquename: "contoso_ContactFlow",
            category: 5,
            statecode: 1,
            type: 1,
            primaryentity: "contact",
            clientdata: relatedFlowClientData,
            connectionreferences: "",
          },
        ],
      },
    });

    registerAnalyzeUpdateTriggers(server as never, config, client);

    const response = await server.getHandler("analyze_update_triggers")({
      table: "contact",
      changedAttributes: ["firstname"],
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Plugin1 Step");
    expect(response.content[0].text).toContain("PluginAny Step");
    expect(response.content[0].text).toContain("Contact First Name Sync");
    expect(response.content[0].text).toContain("### System-Managed Column Matches");
    expect(response.content[0].text).toContain("Plugin2 Step");
    expect(response.content[0].text).toContain("Plugin3 Step");
    expect(response.content[0].text).toContain("Contact Last Name Sync");
    expect(response.content[0].text).toContain("Contact Flow");
    expect(response.content[0].text).toContain(
      "System-managed columns like modifiedon and modifiedby are not treated as direct matches",
    );
    expect(response.structuredContent).toMatchObject({
      data: {
        analysis: {
          tableLogicalName: "contact",
          changedAttributes: ["firstname"],
          directPluginSteps: [
            expect.objectContaining({ name: "Plugin1 Step", matchType: "specific_attributes" }),
            expect.objectContaining({ name: "PluginAny Step", matchType: "all_updates" }),
          ],
          directWorkflows: [
            expect.objectContaining({ name: "Contact First Name Sync" }),
          ],
          systemManagedPluginSteps: [
            expect.objectContaining({
              name: "Plugin2 Step",
              systemManagedAttributes: ["modifiedon"],
            }),
            expect.objectContaining({
              name: "Plugin3 Step",
              systemManagedAttributes: ["modifiedby"],
            }),
          ],
          systemManagedWorkflows: [
            expect.objectContaining({
              name: "Contact Last Name Sync",
              systemManagedAttributes: ["modifiedon"],
            }),
          ],
          relatedCloudFlows: [
            expect.objectContaining({ name: "Contact Flow", matchedAttributes: ["firstname"] }),
          ],
        },
      },
    });
  });

  it("analyzes direct create triggers and keeps field references separate", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const relatedFlowClientData = JSON.stringify({
      properties: {
        definition: {
          triggers: { When_contact_created: { entityName: "contact", columnName: "firstname" } },
          actions: {},
        },
      },
    });

    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "contact",
            SchemaName: "Contact",
            DisplayName: { UserLocalizedLabel: { Label: "Contact" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Contacts" } },
            EntitySetName: "contacts",
            PrimaryIdAttribute: "contactid",
            PrimaryNameAttribute: "fullname",
            OwnershipType: { Value: "UserOwned" },
          },
        ],
        pluginassemblies: [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "CreatePlugin",
            typename: "Core.Plugins.CreatePlugin",
            _pluginassemblyid_value: "asm-1",
          },
          {
            plugintypeid: "type-2",
            name: "UpdatePlugin",
            typename: "Core.Plugins.UpdatePlugin",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Contact Create Step",
            statecode: 0,
            stage: 20,
            mode: 0,
            filteringattributes: "",
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-2",
            name: "Contact Update Step",
            statecode: 0,
            stage: 40,
            mode: 1,
            filteringattributes: "firstname",
            sdkmessageid: { name: "Update" },
            sdkmessagefilterid: { primaryobjecttypecode: "contact" },
          },
        ],
        sdkmessageprocessingstepimages: [],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Contact Create Workflow",
            uniquename: "contoso_ContactCreateWorkflow",
            category: 0,
            statecode: 1,
            mode: 1,
            primaryentity: "contact",
            triggeroncreate: true,
            triggeronupdateattributelist: "",
          },
          {
            workflowid: "wf-2",
            name: "Contact Update Workflow",
            uniquename: "contoso_ContactUpdateWorkflow",
            category: 0,
            statecode: 1,
            mode: 1,
            primaryentity: "contact",
            triggeroncreate: false,
            triggeronupdateattributelist: "firstname",
          },
          {
            workflowid: "flow-1",
            workflowidunique: "flow-u-1",
            name: "Contact Create Flow",
            uniquename: "contoso_ContactCreateFlow",
            category: 5,
            statecode: 1,
            type: 1,
            primaryentity: "contact",
            clientdata: relatedFlowClientData,
            connectionreferences: "",
          },
        ],
      },
    });

    registerAnalyzeCreateTriggers(server as never, config, client);

    const response = await server.getHandler("analyze_create_triggers")({
      table: "contact",
      providedAttributes: ["firstname"],
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Contact Create Step");
    expect(response.content[0].text).toContain("Contact Create Workflow");
    expect(response.content[0].text).toContain("Contact Create Flow");
    expect(response.content[0].text).not.toContain("Contact Update Step");
    expect(response.content[0].text).not.toContain("Contact Update Workflow");
    expect(response.content[0].text).toContain(
      "Direct create matches are table-level. The provided fields do not narrow plugin Create steps or workflow Create triggers.",
    );
    expect(response.structuredContent).toMatchObject({
      data: {
        analysis: {
          tableLogicalName: "contact",
          providedAttributes: ["firstname"],
          directPluginSteps: [
            expect.objectContaining({ name: "Contact Create Step" }),
          ],
          directWorkflows: [
            expect.objectContaining({ name: "Contact Create Workflow" }),
          ],
          relatedCloudFlows: [
            expect.objectContaining({ name: "Contact Create Flow", matchedAttributes: ["firstname"] }),
          ],
        },
      },
    });
  });

  it("warns when web resource usage needs a broad form scan", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const forms = Array.from({ length: 55 }, (_, index) => ({
      formid: `form-${index + 1}`,
      name: `Account Main ${index + 1}`,
      objecttypecode: "account",
      type: 2,
      uniquename: `contoso_account_main_${index + 1}`,
      formxml: "<form />",
    }));
    const { client } = createRecordingClient({
      dev: {
        systemforms: forms,
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            content: Buffer.from("console.log('app');").toString("base64"),
          },
        ],
      },
    });

    registerFindWebResourceUsage(server as never, config, client);
    const response = await server.getHandler("find_web_resource_usage")({
      name: "contoso_/scripts/app.js",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "Warnings: Form detail scan is limited to 50 forms per request while checking web resource usage.",
    );
    expect(response.structuredContent).toMatchObject({
      data: {
        warnings: [expect.stringContaining("Form detail scan is limited to 50 forms per request")],
      },
    });
  });
});
