import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import {
  listTableChoiceColumnsQuery,
  listTableColumnsQuery,
  listTableKeysQuery,
  listTableManyToManyRelationshipsQuery,
  listTableManyToOneRelationshipsQuery,
  listTableOneToManyRelationshipsQuery,
  listTablesQuery,
  tableChoiceColumnsPath,
  tableColumnsPath,
  tableKeysPath,
  tableManyToManyRelationshipsPath,
  tableManyToOneRelationshipsPath,
  tableOneToManyRelationshipsPath,
  type ChoiceAttributeMetadataType,
} from "../../queries/table-queries.js";
import { resolveSolution } from "../solutions/solution-inventory.js";

const TABLE_COMPONENT_TYPE = 1;

const CHOICE_ATTRIBUTE_TYPES: ChoiceAttributeMetadataType[] = [
  "PicklistAttributeMetadata",
  "MultiSelectPicklistAttributeMetadata",
  "BooleanAttributeMetadata",
  "StateAttributeMetadata",
  "StatusAttributeMetadata",
];

export interface TableRecord extends Record<string, unknown> {
  metadataId: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  collectionName: string;
  description: string;
  entitySetName: string;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  ownershipType: string;
  isCustomEntity: boolean;
  isManaged: boolean;
  isActivity: boolean;
  isAuditEnabled: boolean;
  isValidForAdvancedFind: boolean;
  changeTrackingEnabled: boolean;
}

export interface TableColumnRecord extends Record<string, unknown> {
  metadataId: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  description: string;
  attributeType: string;
  requiredLevel: string;
  isPrimaryId: boolean;
  isPrimaryName: boolean;
  isAuditEnabled: boolean;
  isValidForAdvancedFind: boolean;
  isValidForCreate: boolean;
  isValidForRead: boolean;
  isValidForUpdate: boolean;
  isCustomAttribute: boolean;
  isSecured: boolean;
  targets: string[];
  maxLength?: number;
  precision?: number;
  minValue?: number;
  maxValue?: number;
  formatName: string;
  choiceKind: string;
  optionSetName: string;
  isGlobalChoice: boolean;
  optionCount?: number;
}

export interface TableKeyRecord extends Record<string, unknown> {
  metadataId: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  keyAttributes: string[];
  indexStatus: string;
  isManaged: boolean;
}

export interface TableRelationshipRecord extends Record<string, unknown> {
  metadataId: string;
  schemaName: string;
  kind: "many-to-one" | "one-to-many" | "many-to-many";
  referencedEntity: string;
  referencedAttribute: string;
  referencingEntity: string;
  referencingAttribute: string;
  entity1LogicalName: string;
  entity1IntersectAttribute: string;
  entity2LogicalName: string;
  entity2IntersectAttribute: string;
  intersectEntityName: string;
  isCustomRelationship: boolean;
  isManaged: boolean;
  securityTypes: string;
  relatedTable: string;
  details: string;
}

export interface TableSchema {
  table: TableRecord;
  columns: TableColumnRecord[];
  keys: TableKeyRecord[];
  relationships: TableRelationshipRecord[];
}

interface ChoiceColumnDetails {
  logicalName: string;
  choiceKind: string;
  optionSetName: string;
  isGlobalChoice: boolean;
  optionCount?: number;
}

export async function listTables(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    solution?: string;
  },
): Promise<TableRecord[]> {
  const rawTables = await client.query<Record<string, unknown>>(
    env,
    "EntityDefinitions",
    listTablesQuery(options?.nameFilter),
  );
  let tables = rawTables.map(normalizeTable);

  if (options?.solution) {
    const solutionTableIds = await fetchSolutionTableIds(env, client, options.solution);
    tables = tables.filter((table) => solutionTableIds.has(table.metadataId));
  }

  return tables.sort((left, right) => left.logicalName.localeCompare(right.logicalName));
}

export async function resolveTable(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  solution?: string,
): Promise<TableRecord> {
  const tables = await listTables(env, client, { solution });
  const exactLogical = tables.filter((table) => table.logicalName === tableRef);
  if (exactLogical.length === 1) {
    return exactLogical[0];
  }

  const exactSchema = tables.filter((table) => table.schemaName === tableRef);
  if (exactSchema.length === 1) {
    return exactSchema[0];
  }

  const exactDisplay = tables.filter((table) => table.displayName === tableRef);
  if (exactDisplay.length === 1) {
    return exactDisplay[0];
  }

  const needle = tableRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueTables(
    tables.filter(
      (table) =>
        table.logicalName.toLowerCase() === needle ||
        table.schemaName.toLowerCase() === needle ||
        table.displayName.toLowerCase() === needle,
    ),
  );

  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueTables(
    tables.filter(
      (table) =>
        table.logicalName.toLowerCase().includes(needle) ||
        table.schemaName.toLowerCase().includes(needle) ||
        table.displayName.toLowerCase().includes(needle),
    ),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const ambiguousMatches = uniqueTables([
    ...exactLogical,
    ...exactSchema,
    ...exactDisplay,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);

  const solutionSuffix = solution ? ` in solution '${solution}'` : "";
  if (ambiguousMatches.length > 1) {
    throw new Error(
      `Table '${tableRef}' is ambiguous in '${env.name}'${solutionSuffix}. Matches: ${formatTableMatches(ambiguousMatches)}.`,
    );
  }

  throw new Error(`Table '${tableRef}' not found in '${env.name}'${solutionSuffix}.`);
}

export async function fetchTableColumns(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  solution?: string,
): Promise<{ table: TableRecord; columns: TableColumnRecord[] }> {
  const table = await resolveTable(env, client, tableRef, solution);
  const columns = await fetchColumnsByLogicalName(env, client, table.logicalName);

  return { table, columns };
}

export async function fetchTableRelationships(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  solution?: string,
): Promise<{ table: TableRecord; relationships: TableRelationshipRecord[] }> {
  const table = await resolveTable(env, client, tableRef, solution);
  const relationships = await fetchRelationshipsByLogicalName(env, client, table.logicalName);

  return { table, relationships };
}

export async function fetchTableSchema(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  solution?: string,
): Promise<TableSchema> {
  const table = await resolveTable(env, client, tableRef, solution);
  const [columns, keys, relationships] = await Promise.all([
    fetchColumnsByLogicalName(env, client, table.logicalName),
    fetchKeysByLogicalName(env, client, table.logicalName),
    fetchRelationshipsByLogicalName(env, client, table.logicalName),
  ]);

  return {
    table,
    columns,
    keys,
    relationships,
  };
}

export function buildRelationshipComparisonKey(relationship: TableRelationshipRecord): string {
  switch (relationship.kind) {
    case "many-to-many":
      return [
        relationship.kind,
        relationship.schemaName,
        relationship.entity1LogicalName,
        relationship.entity2LogicalName,
        relationship.intersectEntityName,
      ].join(" | ");
    default:
      return [
        relationship.kind,
        relationship.schemaName,
        relationship.referencingEntity,
        relationship.referencingAttribute,
        relationship.referencedEntity,
        relationship.referencedAttribute,
      ].join(" | ");
  }
}

async function fetchColumnsByLogicalName(
  env: EnvironmentConfig,
  client: DynamicsClient,
  logicalName: string,
): Promise<TableColumnRecord[]> {
  const [baseColumns, ...choiceGroups] = await Promise.all([
    client.queryPath<Record<string, unknown>>(
      env,
      tableColumnsPath(logicalName),
      listTableColumnsQuery(),
    ),
    ...CHOICE_ATTRIBUTE_TYPES.map((metadataType) =>
      client.queryPath<Record<string, unknown>>(
        env,
        tableChoiceColumnsPath(logicalName, metadataType),
        listTableChoiceColumnsQuery(),
      ),
    ),
  ]);

  const choiceByLogicalName = new Map<string, ChoiceColumnDetails>();
  for (const group of choiceGroups) {
    for (const attribute of group) {
      const choice = normalizeChoiceColumn(attribute);
      choiceByLogicalName.set(choice.logicalName, choice);
    }
  }

  return baseColumns
    .map((column) => normalizeColumn(column, choiceByLogicalName.get(String(column.LogicalName || ""))))
    .sort((left, right) => left.logicalName.localeCompare(right.logicalName));
}

async function fetchKeysByLogicalName(
  env: EnvironmentConfig,
  client: DynamicsClient,
  logicalName: string,
): Promise<TableKeyRecord[]> {
  const keys = await client.queryPath<Record<string, unknown>>(
    env,
    tableKeysPath(logicalName),
    listTableKeysQuery(),
  );

  return keys
    .map(normalizeKey)
    .sort((left, right) => left.logicalName.localeCompare(right.logicalName));
}

async function fetchRelationshipsByLogicalName(
  env: EnvironmentConfig,
  client: DynamicsClient,
  logicalName: string,
): Promise<TableRelationshipRecord[]> {
  const [manyToOne, oneToMany, manyToMany] = await Promise.all([
    client.queryPath<Record<string, unknown>>(
      env,
      tableManyToOneRelationshipsPath(logicalName),
      listTableManyToOneRelationshipsQuery(),
    ),
    client.queryPath<Record<string, unknown>>(
      env,
      tableOneToManyRelationshipsPath(logicalName),
      listTableOneToManyRelationshipsQuery(),
    ),
    client.queryPath<Record<string, unknown>>(
      env,
      tableManyToManyRelationshipsPath(logicalName),
      listTableManyToManyRelationshipsQuery(),
    ),
  ]);

  return [
    ...manyToOne.map((relationship) => normalizeManyToOneRelationship(relationship, "many-to-one")),
    ...oneToMany.map((relationship) => normalizeManyToOneRelationship(relationship, "one-to-many")),
    ...manyToMany.map(normalizeManyToManyRelationship),
  ].sort((left, right) => left.schemaName.localeCompare(right.schemaName));
}

async function fetchSolutionTableIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionRef: string,
): Promise<Set<string>> {
  const solution = await resolveSolution(env, client, solutionRef);
  const components = await client.query<Record<string, unknown>>(
    env,
    "solutioncomponents",
    listSolutionComponentsQuery(solution.solutionid),
  );

  return new Set(
    components
      .filter((component) => Number(component.componenttype || 0) === TABLE_COMPONENT_TYPE)
      .map((component) => String(component.objectid || ""))
      .filter(Boolean),
  );
}

function normalizeTable(table: Record<string, unknown>): TableRecord {
  return {
    ...table,
    metadataId: String(table.MetadataId || ""),
    logicalName: String(table.LogicalName || ""),
    schemaName: String(table.SchemaName || ""),
    displayName: getLabelText(table.DisplayName),
    collectionName: getLabelText(table.DisplayCollectionName),
    description: getLabelText(table.Description),
    entitySetName: String(table.EntitySetName || ""),
    primaryIdAttribute: String(table.PrimaryIdAttribute || ""),
    primaryNameAttribute: String(table.PrimaryNameAttribute || ""),
    ownershipType: normalizeEnumValue(table.OwnershipType),
    isCustomEntity: getBooleanValue(table.IsCustomEntity),
    isManaged: getBooleanValue(table.IsManaged),
    isActivity: getBooleanValue(table.IsActivity),
    isAuditEnabled: getBooleanValue(table.IsAuditEnabled),
    isValidForAdvancedFind: getBooleanValue(table.IsValidForAdvancedFind),
    changeTrackingEnabled: getBooleanValue(table.ChangeTrackingEnabled),
  };
}

function normalizeColumn(
  column: Record<string, unknown>,
  choiceDetails?: ChoiceColumnDetails,
): TableColumnRecord {
  return {
    ...column,
    metadataId: String(column.MetadataId || ""),
    logicalName: String(column.LogicalName || ""),
    schemaName: String(column.SchemaName || ""),
    displayName: getLabelText(column.DisplayName),
    description: getLabelText(column.Description),
    attributeType: normalizeAttributeType(column.AttributeTypeName || column.AttributeType),
    requiredLevel: normalizeEnumValue(column.RequiredLevel),
    isPrimaryId: getBooleanValue(column.IsPrimaryId),
    isPrimaryName: getBooleanValue(column.IsPrimaryName),
    isAuditEnabled: getBooleanValue(column.IsAuditEnabled),
    isValidForAdvancedFind: getBooleanValue(column.IsValidForAdvancedFind),
    isValidForCreate: getBooleanValue(column.IsValidForCreate),
    isValidForRead: getBooleanValue(column.IsValidForRead),
    isValidForUpdate: getBooleanValue(column.IsValidForUpdate),
    isCustomAttribute: getBooleanValue(column.IsCustomAttribute),
    isSecured: getBooleanValue(column.IsSecured),
    targets: getStringArray(column.Targets),
    maxLength: getNumberValue(column.MaxLength),
    precision: getNumberValue(column.Precision),
    minValue: getNumberValue(column.MinValue),
    maxValue: getNumberValue(column.MaxValue),
    formatName: normalizeEnumValue(column.FormatName),
    choiceKind: choiceDetails?.choiceKind || "",
    optionSetName: choiceDetails?.optionSetName || "",
    isGlobalChoice: choiceDetails?.isGlobalChoice || false,
    optionCount: choiceDetails?.optionCount,
  };
}

function normalizeChoiceColumn(column: Record<string, unknown>): ChoiceColumnDetails {
  const optionSet = getRecord(column.OptionSet);
  const globalOptionSet = getRecord(column.GlobalOptionSet);
  const optionSource = globalOptionSet || optionSet;
  const optionCount = getOptionCount(column, optionSource);

  return {
    logicalName: String(column.LogicalName || ""),
    choiceKind: normalizeAttributeType(column.AttributeTypeName || column.AttributeType),
    optionSetName:
      String(optionSource?.Name || optionSource?.name || optionSet?.Name || optionSet?.name || ""),
    isGlobalChoice: getBooleanValue(optionSource?.IsGlobal),
    optionCount,
  };
}

function normalizeKey(key: Record<string, unknown>): TableKeyRecord {
  return {
    ...key,
    metadataId: String(key.MetadataId || ""),
    logicalName: String(key.LogicalName || ""),
    schemaName: String(key.SchemaName || ""),
    displayName: getLabelText(key.DisplayName),
    keyAttributes: getStringArray(key.KeyAttributes),
    indexStatus: normalizeEnumValue(key.EntityKeyIndexStatus),
    isManaged: getBooleanValue(key.IsManaged),
  };
}

function normalizeManyToOneRelationship(
  relationship: Record<string, unknown>,
  kind: "many-to-one" | "one-to-many",
): TableRelationshipRecord {
  const referencedEntity = String(relationship.ReferencedEntity || "");
  const referencedAttribute = String(relationship.ReferencedAttribute || "");
  const referencingEntity = String(relationship.ReferencingEntity || "");
  const referencingAttribute = String(relationship.ReferencingAttribute || "");

  return {
    ...relationship,
    metadataId: String(relationship.MetadataId || ""),
    schemaName: String(relationship.SchemaName || ""),
    kind,
    referencedEntity,
    referencedAttribute,
    referencingEntity,
    referencingAttribute,
    entity1LogicalName: "",
    entity1IntersectAttribute: "",
    entity2LogicalName: "",
    entity2IntersectAttribute: "",
    intersectEntityName: "",
    isCustomRelationship: getBooleanValue(relationship.IsCustomRelationship),
    isManaged: getBooleanValue(relationship.IsManaged),
    securityTypes: normalizeEnumValue(relationship.SecurityTypes),
    relatedTable: kind === "many-to-one" ? referencedEntity : referencingEntity,
    details:
      kind === "many-to-one"
        ? `${referencingAttribute} -> ${referencedEntity}.${referencedAttribute}`
        : `${referencedAttribute} <- ${referencingEntity}.${referencingAttribute}`,
  };
}

function normalizeManyToManyRelationship(
  relationship: Record<string, unknown>,
): TableRelationshipRecord {
  const entity1LogicalName = String(relationship.Entity1LogicalName || "");
  const entity1IntersectAttribute = String(relationship.Entity1IntersectAttribute || "");
  const entity2LogicalName = String(relationship.Entity2LogicalName || "");
  const entity2IntersectAttribute = String(relationship.Entity2IntersectAttribute || "");
  const intersectEntityName = String(relationship.IntersectEntityName || "");

  return {
    ...relationship,
    metadataId: String(relationship.MetadataId || ""),
    schemaName: String(relationship.SchemaName || ""),
    kind: "many-to-many",
    referencedEntity: "",
    referencedAttribute: "",
    referencingEntity: "",
    referencingAttribute: "",
    entity1LogicalName,
    entity1IntersectAttribute,
    entity2LogicalName,
    entity2IntersectAttribute,
    intersectEntityName,
    isCustomRelationship: getBooleanValue(relationship.IsCustomRelationship),
    isManaged: getBooleanValue(relationship.IsManaged),
    securityTypes: normalizeEnumValue(relationship.SecurityTypes),
    relatedTable: `${entity1LogicalName} <-> ${entity2LogicalName}`,
    details: `${intersectEntityName} (${entity1IntersectAttribute}, ${entity2IntersectAttribute})`,
  };
}

function getLabelText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const record = getRecord(value);
  const userLocalizedLabel = getRecord(record?.UserLocalizedLabel);
  if (typeof userLocalizedLabel?.Label === "string") {
    return userLocalizedLabel.Label;
  }

  const localizedLabels = Array.isArray(record?.LocalizedLabels)
    ? (record.LocalizedLabels as unknown[])
    : [];
  const firstLabel = localizedLabels
    .map(getRecord)
    .find((label) => typeof label?.Label === "string");

  if (typeof firstLabel?.Label === "string") {
    return firstLabel.Label;
  }

  return "";
}

function getBooleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const record = getRecord(value);
  if (typeof record?.Value === "boolean") {
    return record.Value;
  }

  if (typeof record?.value === "boolean") {
    return record.value;
  }

  return false;
}

function getNumberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const record = getRecord(value);
  if (typeof record?.Value === "number" && Number.isFinite(record.Value)) {
    return record.Value;
  }

  return undefined;
}

function normalizeEnumValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const record = getRecord(value);
  if (typeof record?.Value === "string") {
    return record.Value;
  }
  if (typeof record?.Value === "number") {
    return String(record.Value);
  }
  if (typeof record?.value === "string") {
    return record.value;
  }

  return "";
}

function normalizeAttributeType(value: unknown): string {
  const rawValue = normalizeEnumValue(value);
  return rawValue.endsWith("Type") ? rawValue.slice(0, -4) : rawValue;
}

function getStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function getOptionCount(column: Record<string, unknown>, optionSet?: Record<string, unknown>): number | undefined {
  const options = Array.isArray(optionSet?.Options) ? optionSet.Options : undefined;
  if (options?.length) {
    return options.length;
  }

  const trueOption = getRecord(column.TrueOption);
  const falseOption = getRecord(column.FalseOption);
  if (trueOption || falseOption) {
    return 2;
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function uniqueTables(tables: TableRecord[]): TableRecord[] {
  const seen = new Set<string>();

  return tables.filter((table) => {
    if (seen.has(table.metadataId)) {
      return false;
    }
    seen.add(table.metadataId);
    return true;
  });
}

function formatTableMatches(tables: TableRecord[]): string {
  return tables
    .map((table) => `${table.logicalName} (${table.schemaName || table.displayName || "no label"})`)
    .join(", ");
}
