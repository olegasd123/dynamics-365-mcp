import { describe, expect, it } from "vitest";
import { registerCompareTableSchema } from "../compare-table-schema.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_table_schema", () => {
  it("shows schema drift for columns", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
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
            MetadataId: "col-1",
            LogicalName: "name",
            SchemaName: "Name",
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
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata":
          [
            {
              MetadataId: "col-1",
              LogicalName: "name",
              MaxLength: 160,
            },
          ],
        "EntityDefinitions(LogicalName='account')/Keys": [],
        "EntityDefinitions(LogicalName='account')/ManyToOneRelationships": [],
        "EntityDefinitions(LogicalName='account')/OneToManyRelationships": [],
        "EntityDefinitions(LogicalName='account')/ManyToManyRelationships": [],
      },
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
            MetadataId: "col-1",
            LogicalName: "name",
            SchemaName: "Name",
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
            MaxLength: 200,
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
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata":
          [
            {
              MetadataId: "col-1",
              LogicalName: "name",
              MaxLength: 200,
            },
          ],
        "EntityDefinitions(LogicalName='account')/Keys": [],
        "EntityDefinitions(LogicalName='account')/ManyToOneRelationships": [],
        "EntityDefinitions(LogicalName='account')/OneToManyRelationships": [],
        "EntityDefinitions(LogicalName='account')/ManyToManyRelationships": [],
      },
    });

    registerCompareTableSchema(server as never, config, client);
    const handler = server.getHandler("compare_table_schema");
    const response = await handler({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      table: "account",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Table Schema Comparison");
    expect(response.content[0].text).toContain("### Columns");
    expect(response.content[0].text).toContain("maxLength");
    expect(response.structuredContent).toMatchObject({
      tool: "compare_table_schema",
      ok: true,
      data: {
        sourceEnvironment: "prod",
        targetEnvironment: "dev",
      },
    });

    const payload = response.structuredContent as {
      data: {
        columnComparison: {
          differences: Array<{ key: string; changedFields: Array<{ field: string }> }>;
        };
      };
    };
    expect(payload.data.columnComparison.differences[0].key).toBe("name");
    expect(payload.data.columnComparison.differences[0].changedFields[0].field).toBe("maxLength");
  });
});
