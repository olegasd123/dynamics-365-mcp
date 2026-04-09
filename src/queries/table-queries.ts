import { buildQueryString, odataEq, odataStringLiteral } from "../utils/odata-helpers.js";

const TABLE_SELECT = [
  "MetadataId",
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

function buildOrStringFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

export function listTablesQuery(): string {
  return buildQueryString({
    select: TABLE_SELECT,
  });
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
  return buildQueryString({
    select: COLUMN_SELECT,
    filter: "AttributeOf eq null",
    orderby: "LogicalName asc",
  });
}

export function listTableChoiceColumnsQuery(): string {
  return buildQueryString({
    select: CHOICE_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableLookupColumnsQuery(): string {
  return buildQueryString({
    select: LOOKUP_COLUMN_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableStringColumnsQuery(): string {
  return buildQueryString({
    select: STRING_COLUMN_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableNumericColumnsQuery(): string {
  return buildQueryString({
    select: NUMERIC_COLUMN_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableDateTimeColumnsQuery(): string {
  return buildQueryString({
    select: DATETIME_COLUMN_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableKeysQuery(): string {
  return buildQueryString({
    select: KEY_SELECT,
    orderby: "LogicalName asc",
  });
}

export function listTableManyToOneRelationshipsQuery(): string {
  return buildQueryString({
    select: MANY_TO_ONE_SELECT,
    orderby: "SchemaName asc",
  });
}

export function listTableOneToManyRelationshipsQuery(): string {
  return listTableManyToOneRelationshipsQuery();
}

export function listTableManyToManyRelationshipsQuery(): string {
  return buildQueryString({
    select: MANY_TO_MANY_SELECT,
    orderby: "SchemaName asc",
  });
}

export function getTableByLogicalNameQuery(logicalName: string): string {
  return buildQueryString({
    select: TABLE_SELECT,
    filter: odataEq("LogicalName", logicalName),
  });
}

export function listTablesByMetadataIdsQuery(metadataIds: string[]): string {
  return buildQueryString({
    select: TABLE_SELECT,
    filter: buildOrStringFilter("MetadataId", metadataIds),
  });
}
