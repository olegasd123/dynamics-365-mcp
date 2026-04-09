import { describe, expect, it } from "vitest";
import {
  listTableDateTimeColumnsQuery,
  listTableChoiceColumnsQuery,
  listTableColumnsQuery,
  listTableKeysQuery,
  listTableLookupColumnsQuery,
  listTableManyToManyRelationshipsQuery,
  listTableManyToOneRelationshipsQuery,
  listTableNumericColumnsQuery,
  listTableStringColumnsQuery,
  listTablesByMetadataIdsQuery,
  listTablesQuery,
  tableChoiceColumnsPath,
  tableColumnsPath,
  tableDetailColumnsPath,
  tableKeysPath,
  tableManyToManyRelationshipsPath,
  tableManyToOneRelationshipsPath,
  tableOneToManyRelationshipsPath,
} from "../table-queries.js";

describe("table queries", () => {
  it("builds the tables query", () => {
    const query = listTablesQuery();

    expect(query).toContain(
      "$select=MetadataId,LogicalName,SchemaName,DisplayName,DisplayCollectionName,Description,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,OwnershipType,IsCustomEntity,IsManaged,IsActivity,IsAuditEnabled,IsValidForAdvancedFind,ChangeTrackingEnabled",
    );
    expect(query).not.toContain("$orderby=");
  });

  it("adds a name filter for tables", () => {
    const query = listTablesQuery();

    expect(query).not.toContain("$filter=");
    expect(query).not.toContain("contains(");
  });

  it("builds a metadata id filter for targeted table queries", () => {
    const query = listTablesByMetadataIdsQuery(["table-1", "table-2"]);

    expect(query).toContain("MetadataId eq 'table-1'");
    expect(query).toContain("MetadataId eq 'table-2'");
    expect(query).not.toContain("$orderby=");
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
    expect(tableChoiceColumnsPath("account", "PicklistAttributeMetadata")).toBe(
      "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
    );
    expect(tableDetailColumnsPath("account", "LookupAttributeMetadata")).toBe(
      "EntityDefinitions(LogicalName='account')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata",
    );
  });

  it("builds the columns query", () => {
    const query = listTableColumnsQuery();

    expect(query).toContain("$filter=AttributeOf eq null");
    expect(query).toContain("$orderby=LogicalName asc");
    expect(query).toContain("AttributeTypeName");
    expect(query).not.toContain("Targets");
  });

  it("builds the choice columns query", () => {
    const picklistQuery = listTableChoiceColumnsQuery();

    expect(picklistQuery).toContain(
      "$select=MetadataId,LogicalName,SchemaName,DisplayName,AttributeType,AttributeTypeName,OptionSet,GlobalOptionSet",
    );
    expect(picklistQuery).not.toContain("TrueOption");
  });

  it("builds detail queries for derived column metadata", () => {
    expect(listTableLookupColumnsQuery()).toContain("$select=MetadataId,LogicalName,Targets");
    expect(listTableStringColumnsQuery()).toContain(
      "$select=MetadataId,LogicalName,MaxLength,FormatName",
    );
    expect(listTableNumericColumnsQuery()).toContain(
      "$select=MetadataId,LogicalName,Precision,MinValue,MaxValue",
    );
    expect(listTableDateTimeColumnsQuery()).toContain("$select=MetadataId,LogicalName");
  });

  it("builds the keys and relationship queries", () => {
    expect(listTableKeysQuery()).toContain("$orderby=LogicalName asc");
    expect(listTableManyToOneRelationshipsQuery()).toContain("ReferencedEntity");
    expect(listTableManyToManyRelationshipsQuery()).toContain("IntersectEntityName");
  });
});
