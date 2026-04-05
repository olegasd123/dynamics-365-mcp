import { describe, expect, it } from "vitest";
import {
  listTableChoiceColumnsQuery,
  listTableColumnsQuery,
  listTableKeysQuery,
  listTableManyToManyRelationshipsQuery,
  listTableManyToOneRelationshipsQuery,
  listTablesQuery,
  tableChoiceColumnsPath,
  tableColumnsPath,
  tableKeysPath,
  tableManyToManyRelationshipsPath,
  tableManyToOneRelationshipsPath,
  tableOneToManyRelationshipsPath,
} from "../table-queries.js";

describe("table queries", () => {
  it("builds the tables query", () => {
    const query = listTablesQuery();

    expect(query).toContain("$select=MetadataId,LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,OwnershipType,IsCustomEntity,IsManaged,IsActivity,IsAuditEnabled,IsValidForAdvancedFind,ChangeTrackingEnabled");
    expect(query).toContain("$orderby=LogicalName asc");
  });

  it("adds a name filter for tables", () => {
    const query = listTablesQuery("account");

    expect(query).toContain("contains(LogicalName,'account')");
    expect(query).toContain("contains(SchemaName,'account')");
    expect(query).toContain("contains(EntitySetName,'account')");
  });

  it("builds table metadata paths", () => {
    expect(tableColumnsPath("account")).toBe("EntityDefinitions(LogicalName='account')/Attributes");
    expect(tableKeysPath("account")).toBe("EntityDefinitions(LogicalName='account')/Keys");
    expect(tableManyToOneRelationshipsPath("account")).toBe(
      "EntityDefinitions(LogicalName='account')/ManyToOneRelationships",
    );
    expect(tableOneToManyRelationshipsPath("account")).toBe(
      "EntityDefinitions(LogicalName='account')/OneToManyRelationships",
    );
    expect(tableManyToManyRelationshipsPath("account")).toBe(
      "EntityDefinitions(LogicalName='account')/ManyToManyRelationships",
    );
    expect(
      tableChoiceColumnsPath("account", "PicklistAttributeMetadata"),
    ).toBe(
      "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
    );
  });

  it("builds the columns query", () => {
    const query = listTableColumnsQuery();

    expect(query).toContain("$filter=AttributeOf eq null");
    expect(query).toContain("$orderby=LogicalName asc");
    expect(query).toContain("AttributeTypeName");
  });

  it("builds the choice columns query", () => {
    const query = listTableChoiceColumnsQuery();

    expect(query).toContain("$select=MetadataId,LogicalName,SchemaName,DisplayName,AttributeType,AttributeTypeName,OptionSet,GlobalOptionSet,TrueOption,FalseOption");
  });

  it("builds the keys and relationship queries", () => {
    expect(listTableKeysQuery()).toContain("$orderby=LogicalName asc");
    expect(listTableManyToOneRelationshipsQuery()).toContain("ReferencedEntity");
    expect(listTableManyToManyRelationshipsQuery()).toContain("IntersectEntityName");
  });
});
