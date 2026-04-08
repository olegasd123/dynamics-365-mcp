import { describe, expect, it } from "vitest";
import { registerFindMetadata } from "../find-metadata.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

function createDiscoveryHarness() {
  const server = new FakeServer();
  const config = createTestConfig(["dev"]);
  const { client } = createRecordingClient({
    dev: {
      EntityDefinitions: [
        {
          MetadataId: "table-account",
          LogicalName: "account",
          SchemaName: "Account",
          DisplayName: { UserLocalizedLabel: { Label: "Account" } },
          DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
          Description: { UserLocalizedLabel: { Label: "Main account table" } },
          EntitySetName: "accounts",
          PrimaryIdAttribute: "accountid",
          PrimaryNameAttribute: "name",
          OwnershipType: { Value: "UserOwned" },
          IsCustomEntity: false,
          IsManaged: true,
          IsActivity: false,
          IsAuditEnabled: { Value: true },
          IsValidForAdvancedFind: true,
          ChangeTrackingEnabled: false,
        },
        {
          MetadataId: "table-order",
          LogicalName: "salesorder",
          SchemaName: "SalesOrder",
          DisplayName: { UserLocalizedLabel: { Label: "Order" } },
          DisplayCollectionName: { UserLocalizedLabel: { Label: "Orders" } },
          Description: { UserLocalizedLabel: { Label: "Sales order table" } },
          EntitySetName: "salesorders",
          PrimaryIdAttribute: "salesorderid",
          PrimaryNameAttribute: "name",
          OwnershipType: { Value: "UserOwned" },
          IsCustomEntity: false,
          IsManaged: true,
          IsActivity: false,
          IsAuditEnabled: { Value: true },
          IsValidForAdvancedFind: true,
          ChangeTrackingEnabled: false,
        },
      ],
      "EntityDefinitions(LogicalName='account')/Attributes": [
        {
          MetadataId: "column-name",
          LogicalName: "name",
          SchemaName: "Name",
          DisplayName: { UserLocalizedLabel: { Label: "Account Name" } },
          Description: { UserLocalizedLabel: { Label: "Main account name" } },
          AttributeType: "String",
          AttributeTypeName: { Value: "StringType" },
          RequiredLevel: { Value: "ApplicationRequired" },
          IsPrimaryId: false,
          IsPrimaryName: true,
          IsAuditEnabled: { Value: true },
          IsValidForAdvancedFind: true,
          IsValidForCreate: { Value: true },
          IsValidForRead: { Value: true },
          IsValidForUpdate: { Value: true },
          IsCustomAttribute: false,
          IsSecured: false,
          Targets: [],
          FormatName: { Value: "Text" },
        },
      ],
      "EntityDefinitions(LogicalName='salesorder')/Attributes": [
        {
          MetadataId: "column-order-name",
          LogicalName: "name",
          SchemaName: "Name",
          DisplayName: { UserLocalizedLabel: { Label: "Order Name" } },
          Description: { UserLocalizedLabel: { Label: "Order title" } },
          AttributeType: "String",
          AttributeTypeName: { Value: "StringType" },
          RequiredLevel: { Value: "None" },
          IsPrimaryId: false,
          IsPrimaryName: true,
          IsAuditEnabled: { Value: true },
          IsValidForAdvancedFind: true,
          IsValidForCreate: { Value: true },
          IsValidForRead: { Value: true },
          IsValidForUpdate: { Value: true },
          IsCustomAttribute: false,
          IsSecured: false,
          Targets: [],
          FormatName: { Value: "Text" },
        },
      ],
      systemforms: [
        {
          formid: "form-account-main",
          name: "Account Main",
          description: "Main account form",
          objecttypecode: "account",
          type: 2,
          uniquename: "msdyn.AccountMain",
          formactivationstate: 1,
          isdefault: true,
          ismanaged: false,
          publishedon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
        },
      ],
      savedqueries: [
        {
          savedqueryid: "view-active-accounts",
          name: "Active Accounts",
          description: "Active account records",
          returnedtypecode: "account",
          querytype: 0,
          isdefault: true,
          isquickfindquery: false,
          ismanaged: false,
          statecode: 0,
          modifiedon: "2025-01-02T00:00:00Z",
        },
      ],
      workflows: [
        {
          workflowid: "workflow-sync",
          workflowidunique: "workflow-sync-u",
          name: "Account Sync Process",
          uniquename: "contoso_AccountSyncProcess",
          category: 0,
          statecode: 1,
          statuscode: 2,
          type: 1,
          mode: 0,
          primaryentity: "account",
          ismanaged: false,
          description: "Sync account changes",
          clientdata: "{}",
          connectionreferences: "{}",
          createdon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
        },
        {
          workflowid: "action-sync",
          workflowidunique: "action-sync-u",
          name: "Account Sync Action",
          uniquename: "contoso_AccountSyncAction",
          category: 3,
          statecode: 1,
          statuscode: 2,
          type: 1,
          mode: 0,
          primaryentity: "account",
          ismanaged: false,
          description: "Action for account sync",
          clientdata: "{}",
          connectionreferences: "{}",
          createdon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
        },
        {
          workflowid: "flow-sync",
          workflowidunique: "flow-sync-u",
          name: "Account Sync Flow",
          uniquename: "contoso_AccountSyncFlow",
          category: 5,
          statecode: 1,
          statuscode: 2,
          type: 1,
          primaryentity: "account",
          ismanaged: false,
          description: "Cloud flow for account sync",
          clientdata: "{}",
          connectionreferences: "{}",
          createdon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
          _createdby_value: "user-1",
          _modifiedby_value: "user-1",
          _ownerid_value: "user-1",
        },
      ],
      pluginassemblies: [
        {
          pluginassemblyid: "assembly-account",
          name: "Contoso.Account.Plugins",
          version: "1.0.0.0",
          publickeytoken: "abcd",
          isolationmode: 2,
          ismanaged: false,
          createdon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
        },
      ],
      plugintypes: [
        {
          plugintypeid: "plugin-account",
          name: "AccountPlugin",
          typename: "Contoso.Account.Plugins.AccountPlugin",
          friendlyname: "Account Plugin",
          isworkflowactivity: false,
          workflowactivitygroupname: "",
          customworkflowactivityinfo: "",
          _pluginassemblyid_value: "assembly-account",
        },
      ],
      webresourceset: [
        {
          webresourceid: "wr-account",
          name: "new_/scripts/account-helper.js",
          displayname: "Account Helper",
          webresourcetype: 3,
          ismanaged: false,
          description: "Helper for account forms",
          modifiedon: "2025-01-02T00:00:00Z",
        },
      ],
      solutions: [
        {
          solutionid: "solution-core",
          friendlyname: "Core Account",
          uniquename: "contoso_CoreAccount",
          version: "1.0.0.0",
          ismanaged: false,
          modifiedon: "2025-01-03T00:00:00Z",
        },
      ],
      solutioncomponents: [
        {
          solutioncomponentid: "sc-table-account",
          _solutionid_value: "solution-core",
          objectid: "table-account",
          componenttype: 1,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-form-account",
          _solutionid_value: "solution-core",
          objectid: "form-account-main",
          componenttype: 24,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-view-account",
          _solutionid_value: "solution-core",
          objectid: "view-active-accounts",
          componenttype: 26,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-workflow-sync",
          _solutionid_value: "solution-core",
          objectid: "workflow-sync",
          componenttype: 29,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-action-sync",
          _solutionid_value: "solution-core",
          objectid: "action-sync",
          componenttype: 29,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-flow-sync",
          _solutionid_value: "solution-core",
          objectid: "flow-sync",
          componenttype: 29,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-assembly-account",
          _solutionid_value: "solution-core",
          objectid: "assembly-account",
          componenttype: 91,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
        {
          solutioncomponentid: "sc-webresource-account",
          _solutionid_value: "solution-core",
          objectid: "wr-account",
          componenttype: 61,
          rootsolutioncomponentid: null,
          rootcomponentbehavior: 0,
        },
      ],
      customapis: [
        {
          customapiid: "api-sync",
          name: "Account Sync API",
          uniquename: "contoso_AccountSyncApi",
          displayname: "Account Sync API",
          description: "API for account sync",
          bindingtype: 0,
          boundentitylogicalname: "",
          isfunction: false,
          isprivate: false,
          allowedcustomprocessingsteptype: 2,
          executeprivilegename: "",
          workflowsdkstepenabled: false,
          ismanaged: false,
          statecode: 0,
          statuscode: 1,
          createdon: "2025-01-01T00:00:00Z",
          modifiedon: "2025-01-02T00:00:00Z",
          _plugintypeid_value: "",
          _sdkmessageid_value: "",
          _powerfxruleid_value: "",
        },
      ],
    },
  });

  registerFindMetadata(server as never, config, client);

  return server;
}

describe("find_metadata tool", () => {
  it("ranks exact matches before partial matches and includes next tools", async () => {
    const server = createDiscoveryHarness();

    const response = await server.getHandler("find_metadata")({ query: "account" });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Metadata Matches in 'dev'");

    const payload = response.structuredContent as {
      data: {
        count: number;
        items: Array<{
          componentType: string;
          displayName: string;
          solution: string | null;
          matchReason: string;
          suggestedNextTools: string[];
        }>;
      };
    };

    expect(payload.data.count).toBeGreaterThan(1);
    expect(payload.data.items[0]).toMatchObject({
      componentType: "table",
      displayName: "Account",
      solution: "Core Account",
      matchReason: "Exact display name match",
    });
    expect(payload.data.items[0]?.suggestedNextTools).toContain("get_table_schema");
    expect(
      payload.data.items.some(
        (item) =>
          item.componentType === "web_resource" &&
          (item.matchReason.startsWith("Partial") || item.matchReason.startsWith("Starts with")),
      ),
    ).toBe(true);
  });

  it("supports component type filters", async () => {
    const server = createDiscoveryHarness();

    const response = await server.getHandler("find_metadata")({
      query: "sync",
      componentType: "cloud_flow",
    });

    const payload = response.structuredContent as {
      data: {
        count: number;
        items: Array<{ componentType: string; displayName: string }>;
      };
    };

    expect(payload.data.count).toBe(1);
    expect(payload.data.items).toMatchObject([
      {
        componentType: "cloud_flow",
        displayName: "Account Sync Flow",
      },
    ]);
  });

  it("returns multiple matches for ambiguous searches instead of failing", async () => {
    const server = createDiscoveryHarness();

    const response = await server.getHandler("find_metadata")({ query: "sync" });

    expect(response.isError).toBeUndefined();

    const payload = response.structuredContent as {
      data: {
        count: number;
        items: Array<{ componentType: string }>;
      };
    };

    expect(payload.data.count).toBeGreaterThan(2);
    expect(new Set(payload.data.items.map((item) => item.componentType))).toEqual(
      new Set(["workflow", "action", "cloud_flow", "custom_api"]),
    );
  });

  it("returns an empty success result when nothing matches", async () => {
    const server = createDiscoveryHarness();

    const response = await server.getHandler("find_metadata")({ query: "missing-item" });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toBe("No metadata matches found in 'dev' for 'missing-item'.");
    expect(response.structuredContent).toMatchObject({
      tool: "find_metadata",
      ok: true,
      data: {
        count: 0,
        items: [],
      },
    });
  });
});
