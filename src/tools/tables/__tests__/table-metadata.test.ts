import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchTableSchema, listTables, resolveTable } from "../table-metadata.js";

describe("table metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists solution tables and loads schema details", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
          },
        ],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "table-1", componenttype: 1 },
        ],
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            Description: { UserLocalizedLabel: { Label: "Customer account" } },
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
            MetadataId: "table-2",
            LogicalName: "contact",
            SchemaName: "Contact",
            DisplayName: { UserLocalizedLabel: { Label: "Contact" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Contacts" } },
            Description: { UserLocalizedLabel: { Label: "Contact person" } },
            EntitySetName: "contacts",
            PrimaryIdAttribute: "contactid",
            PrimaryNameAttribute: "fullname",
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
            LogicalName: "accountid",
            SchemaName: "AccountId",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            AttributeType: "Uniqueidentifier",
            AttributeTypeName: { Value: "UniqueidentifierType" },
            RequiredLevel: { Value: "SystemRequired" },
            IsPrimaryId: true,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: false,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-2",
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
          {
            MetadataId: "col-3",
            LogicalName: "preferredcontactmethodcode",
            SchemaName: "PreferredContactMethodCode",
            DisplayName: { UserLocalizedLabel: { Label: "Preferred Method" } },
            AttributeType: "Picklist",
            AttributeTypeName: { Value: "PicklistType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-4",
            LogicalName: "primarycontactid",
            SchemaName: "PrimaryContactId",
            DisplayName: { UserLocalizedLabel: { Label: "Primary Contact" } },
            AttributeType: "Lookup",
            AttributeTypeName: { Value: "LookupType" },
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
            Targets: ["contact"],
          },
        ],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata":
          [
            {
              MetadataId: "col-3",
              LogicalName: "preferredcontactmethodcode",
              SchemaName: "PreferredContactMethodCode",
              AttributeTypeName: { Value: "PicklistType" },
              OptionSet: {
                Name: "account_preferredcontactmethodcode",
                IsGlobal: false,
                Options: [{ Value: 1 }, { Value: 2 }],
              },
            },
          ],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.BooleanAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StateAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StatusAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata":
          [
            {
              MetadataId: "col-4",
              LogicalName: "primarycontactid",
              Targets: ["contact"],
            },
          ],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata":
          [
            {
              MetadataId: "col-2",
              LogicalName: "name",
              MaxLength: 160,
              FormatName: { Value: "Text" },
            },
          ],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.IntegerAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.BigIntAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.DecimalAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.DoubleAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.MoneyAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata":
          [],
        "EntityDefinitions(LogicalName='account')/Keys": [
          {
            MetadataId: "key-1",
            LogicalName: "accountnumberkey",
            SchemaName: "AccountNumberKey",
            DisplayName: { UserLocalizedLabel: { Label: "Account Number Key" } },
            KeyAttributes: ["accountnumber"],
            EntityKeyIndexStatus: { Value: "Active" },
            IsManaged: true,
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
            IsCustomRelationship: false,
            IsManaged: true,
          },
        ],
        "EntityDefinitions(LogicalName='account')/OneToManyRelationships": [
          {
            MetadataId: "rel-2",
            SchemaName: "account_opportunities",
            ReferencedEntity: "account",
            ReferencedAttribute: "accountid",
            ReferencingEntity: "opportunity",
            ReferencingAttribute: "parentaccountid",
            IsCustomRelationship: false,
            IsManaged: true,
          },
        ],
        "EntityDefinitions(LogicalName='account')/ManyToManyRelationships": [
          {
            MetadataId: "rel-3",
            SchemaName: "accountleads_association",
            Entity1LogicalName: "account",
            Entity1IntersectAttribute: "accountid",
            Entity2LogicalName: "lead",
            Entity2IntersectAttribute: "leadid",
            IntersectEntityName: "accountlead",
            IsCustomRelationship: false,
            IsManaged: true,
          },
        ],
      },
    });

    const tables = await listTables(env, client, { solution: "Core" });
    const table = await resolveTable(env, client, "Account", "Core");
    const schema = await fetchTableSchema(env, client, "account", "Core");

    expect(tables).toHaveLength(1);
    expect(tables[0].logicalName).toBe("account");
    expect(table.logicalName).toBe("account");
    expect(schema.table.displayName).toBe("Account");
    expect(schema.columns).toHaveLength(4);
    expect(
      schema.columns.find((column) => column.logicalName === "preferredcontactmethodcode"),
    ).toMatchObject({
      choiceKind: "Picklist",
      optionSetName: "account_preferredcontactmethodcode",
      optionCount: 2,
    });
    expect(
      schema.columns.find((column) => column.logicalName === "primarycontactid"),
    ).toMatchObject({
      targets: ["contact"],
    });
    expect(schema.keys).toEqual([
      expect.objectContaining({
        logicalName: "accountnumberkey",
        keyAttributes: ["accountnumber"],
      }),
    ]);
    expect(schema.relationships).toHaveLength(3);
  });
});
