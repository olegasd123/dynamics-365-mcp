import { describe, expect, it } from "vitest";
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
