import { eq, guidInList, isNull, query, odataStringLiteral } from "../utils/odata-builder.js";

const TABLE_SELECT = [
  "MetadataId",
  "ObjectTypeCode",
  "LogicalName",
  "SchemaName",
  "DisplayName",
  "DisplayCollectionName",
  "Description",
  "EntitySetName",
  "PrimaryIdAttribute",
  "PrimaryNameAttribute",
  "OwnershipType",
  "IsCustomEntity",
  "IsManaged",
  "IsActivity",
  "IsAuditEnabled",
  "IsValidForAdvancedFind",
  "ChangeTrackingEnabled",
];

const COLUMN_SELECT = [
  "MetadataId",
  "LogicalName",
  "SchemaName",
  "DisplayName",
  "Description",
  "AttributeType",
  "AttributeTypeName",
  "RequiredLevel",
  "IsPrimaryId",
  "IsPrimaryName",
  "IsAuditEnabled",
  "IsValidForAdvancedFind",
  "IsValidForCreate",
  "IsValidForRead",
  "IsValidForUpdate",
  "IsCustomAttribute",
  "IsSecured",
];

const KEY_SELECT = [
  "MetadataId",
  "LogicalName",
  "SchemaName",
  "DisplayName",
  "KeyAttributes",
  "EntityKeyIndexStatus",
  "IsManaged",
];

const MANY_TO_ONE_SELECT = [
  "MetadataId",
  "SchemaName",
  "ReferencedEntity",
  "ReferencedAttribute",
  "ReferencingEntity",
  "ReferencingAttribute",
  "IsCustomRelationship",
  "IsManaged",
  "SecurityTypes",
];

const MANY_TO_MANY_SELECT = [
  "MetadataId",
  "SchemaName",
  "Entity1LogicalName",
  "Entity1IntersectAttribute",
  "Entity2LogicalName",
  "Entity2IntersectAttribute",
  "IntersectEntityName",
  "IsCustomRelationship",
  "IsManaged",
  "SecurityTypes",
];

const CHOICE_SELECT = [
  "MetadataId",
  "LogicalName",
  "SchemaName",
  "DisplayName",
  "AttributeType",
  "AttributeTypeName",
  "OptionSet",
  "GlobalOptionSet",
];

const LOOKUP_COLUMN_SELECT = ["MetadataId", "LogicalName", "Targets"];

const STRING_COLUMN_SELECT = ["MetadataId", "LogicalName", "MaxLength", "FormatName"];

const NUMERIC_COLUMN_SELECT = ["MetadataId", "LogicalName", "Precision", "MinValue", "MaxValue"];

const DATETIME_COLUMN_SELECT = ["MetadataId", "LogicalName"];

export type ChoiceAttributeMetadataType =
  | "PicklistAttributeMetadata"
  | "MultiSelectPicklistAttributeMetadata"
  | "BooleanAttributeMetadata"
  | "StateAttributeMetadata"
  | "StatusAttributeMetadata";

export type ColumnDetailMetadataType =
  | "LookupAttributeMetadata"
  | "StringAttributeMetadata"
  | "MemoAttributeMetadata"
  | "IntegerAttributeMetadata"
  | "BigIntAttributeMetadata"
  | "DecimalAttributeMetadata"
  | "DoubleAttributeMetadata"
  | "MoneyAttributeMetadata"
  | "DateTimeAttributeMetadata";

export function listTablesQuery(): string {
  return query().select(TABLE_SELECT).toString();
}

export function tableDefinitionPath(logicalName: string): string {
  return `EntityDefinitions(LogicalName=${odataStringLiteral(logicalName)})`;
}

export function tableColumnsPath(logicalName: string): string {
  return `${tableDefinitionPath(logicalName)}/Attributes`;
}

export function tableKeysPath(logicalName: string): string {
  return `${tableDefinitionPath(logicalName)}/Keys`;
}

export function tableManyToOneRelationshipsPath(logicalName: string): string {
  return `${tableDefinitionPath(logicalName)}/ManyToOneRelationships`;
}

export function tableOneToManyRelationshipsPath(logicalName: string): string {
  return `${tableDefinitionPath(logicalName)}/OneToManyRelationships`;
}

export function tableManyToManyRelationshipsPath(logicalName: string): string {
  return `${tableDefinitionPath(logicalName)}/ManyToManyRelationships`;
}

export function tableChoiceColumnsPath(
  logicalName: string,
  metadataType: ChoiceAttributeMetadataType,
): string {
  return `${tableColumnsPath(logicalName)}/Microsoft.Dynamics.CRM.${metadataType}`;
}

export function tableDetailColumnsPath(
  logicalName: string,
  metadataType: ColumnDetailMetadataType,
): string {
  return `${tableColumnsPath(logicalName)}/Microsoft.Dynamics.CRM.${metadataType}`;
}

export function listTableColumnsQuery(): string {
  return query()
    .select(COLUMN_SELECT)
    .filter(isNull("AttributeOf"))
    .orderby("LogicalName asc")
    .toString();
}

export function listTableChoiceColumnsQuery(): string {
  return query().select(CHOICE_SELECT).orderby("LogicalName asc").toString();
}

export function listTableLookupColumnsQuery(): string {
  return query().select(LOOKUP_COLUMN_SELECT).orderby("LogicalName asc").toString();
}

export function listTableStringColumnsQuery(): string {
  return query().select(STRING_COLUMN_SELECT).orderby("LogicalName asc").toString();
}

export function listTableNumericColumnsQuery(): string {
  return query().select(NUMERIC_COLUMN_SELECT).orderby("LogicalName asc").toString();
}

export function listTableDateTimeColumnsQuery(): string {
  return query().select(DATETIME_COLUMN_SELECT).orderby("LogicalName asc").toString();
}

export function listTableKeysQuery(): string {
  return query().select(KEY_SELECT).orderby("LogicalName asc").toString();
}

export function listTableManyToOneRelationshipsQuery(): string {
  return query().select(MANY_TO_ONE_SELECT).orderby("SchemaName asc").toString();
}

export function listTableOneToManyRelationshipsQuery(): string {
  return listTableManyToOneRelationshipsQuery();
}

export function listTableManyToManyRelationshipsQuery(): string {
  return query().select(MANY_TO_MANY_SELECT).orderby("SchemaName asc").toString();
}

export function getTableByLogicalNameQuery(logicalName: string): string {
  return query().select(TABLE_SELECT).filter(eq("LogicalName", logicalName)).toString();
}

export function listTablesByMetadataIdsQuery(metadataIds: string[]): string {
  return query().select(TABLE_SELECT).filter(guidInList("MetadataId", metadataIds)).toString();
}
