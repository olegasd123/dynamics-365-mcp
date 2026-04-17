import { Buffer } from "node:buffer";
import { z } from "zod";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { and, contains, eq, or, query, type ODataFilter } from "../../utils/odata-builder.js";
import {
  fetchTableColumns,
  type TableColumnRecord,
  type TableRecord,
} from "../tables/table-metadata.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

const ACTIVE_STATE_CODE = 0;
const INACTIVE_STATE_CODE = 1;
const MAX_MATCH_RESULTS = 25;
const FORMATTED_VALUE_SUFFIX = "@OData.Community.Display.V1.FormattedValue";

const LIST_FIELD_CANDIDATES = [
  "fullname",
  "name",
  "firstname",
  "lastname",
  "emailaddress1",
  "productnumber",
  "accountnumber",
  "customernumber",
  "telephone1",
  "mobilephone",
  "description",
  "statecode",
  "statuscode",
  "createdon",
  "modifiedon",
] as const;

const DETAIL_FIELD_CANDIDATES = [
  "fullname",
  "name",
  "firstname",
  "lastname",
  "title",
  "jobtitle",
  "emailaddress1",
  "emailaddress2",
  "telephone1",
  "mobilephone",
  "productnumber",
  "accountnumber",
  "customernumber",
  "description",
  "ownerid",
  "parentcustomerid",
  "parentaccountid",
  "parentcontactid",
  "transactioncurrencyid",
  "statecode",
  "statuscode",
  "createdon",
  "modifiedon",
] as const;

const SECONDARY_FIELD_CANDIDATES = [
  "emailaddress1",
  "productnumber",
  "accountnumber",
  "customernumber",
  "telephone1",
  "mobilephone",
  "jobtitle",
  "description",
  "firstname",
  "lastname",
] as const;

export const TABLE_RECORD_STATE_SCHEMA = z
  .enum(["active", "inactive", "all"])
  .optional()
  .describe("Optional state filter. Defaults to 'active'. Use 'inactive' for deactivated rows.");

export type TableRecordState = z.infer<typeof TABLE_RECORD_STATE_SCHEMA>;

interface DataColumnDescriptor {
  logicalName: string;
  selectName: string;
  displayName: string;
  attributeType: string;
}

interface TableDataProfile {
  table: TableRecord;
  columnsByLogicalName: Map<string, DataColumnDescriptor>;
  primaryIdColumn: DataColumnDescriptor;
  primaryNameColumn: DataColumnDescriptor | null;
  orderByField: string;
  supportsStateFilter: boolean;
  listFieldNames: string[];
  detailFieldNames: string[];
  nameSearchFieldNames: string[];
}

interface CursorPayload {
  nextLink: string;
  totalCount: number;
}

export interface TableRecordListItem extends Record<string, unknown> {
  recordId: string;
  label: string;
  secondaryText: string;
  statecode: number | null;
  stateLabel: string | null;
  statuscode: number | null;
  statusLabel: string | null;
  createdon: string;
  modifiedon: string;
  raw: Record<string, unknown>;
}

export interface TableRecordFieldValue extends Record<string, unknown> {
  logicalName: string;
  displayName: string;
  value: string;
  rawValue: unknown;
  formattedValue: string | null;
}

export interface TableRecordDetails extends Record<string, unknown> {
  recordId: string;
  label: string;
  secondaryText: string;
  statecode: number | null;
  stateLabel: string | null;
  statuscode: number | null;
  statusLabel: string | null;
  createdon: string;
  modifiedon: string;
  fields: TableRecordFieldValue[];
  raw: Record<string, unknown>;
}

export async function loadTableDataProfile(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
): Promise<TableDataProfile> {
  const { table, columns } = await fetchTableColumns(env, client, tableRef);
  const columnsByLogicalName = new Map<string, DataColumnDescriptor>();

  for (const column of columns) {
    if (!column.isValidForRead) {
      continue;
    }

    columnsByLogicalName.set(column.logicalName, {
      logicalName: column.logicalName,
      selectName: getColumnSelectName(column),
      displayName: column.displayName || column.logicalName,
      attributeType: column.attributeType,
    });
  }

  const primaryIdColumn = getRequiredColumnDescriptor(
    columnsByLogicalName,
    table.primaryIdAttribute,
    {
      attributeType: "Uniqueidentifier",
      displayName: table.primaryIdAttribute,
    },
  );
  const primaryNameColumn =
    getOptionalColumnDescriptor(columnsByLogicalName, table.primaryNameAttribute) || null;
  const supportsStateFilter = columnsByLogicalName.has("statecode");
  const orderByField = primaryNameColumn?.logicalName
    ? `${primaryNameColumn.logicalName} asc`
    : columnsByLogicalName.has("modifiedon")
      ? "modifiedon desc"
      : `${primaryIdColumn.logicalName} asc`;

  return {
    table,
    columnsByLogicalName,
    primaryIdColumn,
    primaryNameColumn,
    orderByField,
    supportsStateFilter,
    listFieldNames: buildFieldSelection(columnsByLogicalName, primaryIdColumn, primaryNameColumn, [
      ...LIST_FIELD_CANDIDATES,
    ]),
    detailFieldNames: buildFieldSelection(
      columnsByLogicalName,
      primaryIdColumn,
      primaryNameColumn,
      [...DETAIL_FIELD_CANDIDATES],
    ),
    nameSearchFieldNames: uniqueFieldNames(
      [
        primaryNameColumn?.logicalName,
        columnsByLogicalName.has("fullname") ? "fullname" : undefined,
        columnsByLogicalName.has("name") ? "name" : undefined,
        columnsByLogicalName.has("lastname") ? "lastname" : undefined,
        columnsByLogicalName.has("firstname") ? "firstname" : undefined,
      ].filter((value): value is string => Boolean(value)),
    ),
  };
}

export async function listTableDataRecords(
  env: EnvironmentConfig,
  client: DynamicsClient,
  profile: TableDataProfile,
  options?: {
    cursor?: string;
    limit?: number;
    nameFilter?: string;
    state?: TableRecordState;
  },
): Promise<{
  limit: number;
  cursor: string | null;
  returnedCount: number;
  totalCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  items: TableRecordListItem[];
}> {
  const limit = options?.limit ?? 50;
  const cursorPayload = decodeCursor(options?.cursor);
  const page = await client.queryPage<Record<string, unknown>>(
    env,
    profile.table.entitySetName,
    buildListQuery(profile, limit, options?.nameFilter, options?.state),
    {
      pageLink: cursorPayload?.nextLink,
    },
  );
  const totalCount = page.totalCount ?? cursorPayload?.totalCount ?? page.items.length;
  const nextCursor =
    page.nextLink && totalCount >= 0
      ? encodeCursor({
          nextLink: page.nextLink,
          totalCount,
        })
      : null;

  return {
    limit,
    cursor: options?.cursor || null,
    returnedCount: page.items.length,
    totalCount,
    hasMore: nextCursor !== null,
    nextCursor,
    items: page.items.map((record) => normalizeListItem(profile, record)),
  };
}

export async function getTableDataRecordDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  profile: TableDataProfile,
  options: {
    firstName?: string;
    lastName?: string;
    name?: string;
    recordId?: string;
    state?: TableRecordState;
  },
): Promise<TableRecordDetails> {
  const stateFilter = buildStateFilter(profile, options.state);

  if (options.recordId) {
    const records = await client.query<Record<string, unknown>>(
      env,
      profile.table.entitySetName,
      buildLookupByIdQuery(profile, options.recordId, stateFilter),
      {
        maxPages: 1,
      },
    );

    if (records.length > 0) {
      return normalizeDetailsRecord(profile, records[0]);
    }

    throw new Error(buildNotFoundMessage(profile, env.name, options, stateFilter));
  }

  const selector = normalizeLookupSelector(options);
  const exactQuery = buildExactLookupQuery(profile, selector, stateFilter);
  const exactMatches = exactQuery
    ? await client.query<Record<string, unknown>>(env, profile.table.entitySetName, exactQuery, {
        maxPages: 1,
      })
    : [];

  const exactResolved = resolveCandidates(profile, selector, exactMatches);
  if (exactResolved.length === 1) {
    return normalizeDetailsRecord(profile, exactResolved[0]);
  }
  if (exactResolved.length > 1) {
    throw createAmbiguousRecordError(
      selector.rawRef,
      env.name,
      profile.table.logicalName,
      profile,
      exactResolved,
    );
  }

  const containsQuery = buildContainsLookupQuery(profile, selector, stateFilter);
  const containsMatches = containsQuery
    ? await client.query<Record<string, unknown>>(env, profile.table.entitySetName, containsQuery, {
        maxPages: 1,
      })
    : [];
  const partialResolved = resolveCandidates(profile, selector, containsMatches);

  if (partialResolved.length === 1) {
    return normalizeDetailsRecord(profile, partialResolved[0]);
  }

  if (partialResolved.length > 1) {
    throw createAmbiguousRecordError(
      selector.rawRef,
      env.name,
      profile.table.logicalName,
      profile,
      partialResolved,
    );
  }

  throw new Error(buildNotFoundMessage(profile, env.name, options, stateFilter));
}

export function describeRequestedState(
  state: TableRecordState,
  supportsStateFilter: boolean,
): string {
  if (!supportsStateFilter) {
    return "not supported";
  }

  switch (state || "active") {
    case "inactive":
      return "Inactive";
    case "all":
      return "All";
    default:
      return "Active";
  }
}

function buildListQuery(
  profile: TableDataProfile,
  limit: number,
  nameFilter?: string,
  state?: TableRecordState,
): string {
  const filter = and(buildStateFilter(profile, state), buildNameFilter(profile, nameFilter));

  return query()
    .select(buildSelectFieldNames(profile, profile.listFieldNames))
    .filter(filter)
    .orderby(profile.orderByField)
    .top(limit)
    .count(true)
    .toString();
}

function buildLookupByIdQuery(
  profile: TableDataProfile,
  recordId: string,
  stateFilter?: ODataFilter,
): string {
  return query()
    .select(buildSelectFieldNames(profile, profile.detailFieldNames))
    .filter(and(eq(profile.primaryIdColumn.logicalName, recordId), stateFilter))
    .top(2)
    .toString();
}

function buildExactLookupQuery(
  profile: TableDataProfile,
  selector: ReturnType<typeof normalizeLookupSelector>,
  stateFilter?: ODataFilter,
): string | null {
  const filters: ODataFilter[] = [];

  if (selector.name && profile.nameSearchFieldNames.length > 0) {
    filters.push(
      or(
        ...profile.nameSearchFieldNames.map((fieldName) => eq(fieldName, selector.name as string)),
      ) as ODataFilter,
    );
  }

  if (selector.lastName && profile.columnsByLogicalName.has("lastname")) {
    const nameFilters = [eq("lastname", selector.lastName)];
    if (selector.firstName && profile.columnsByLogicalName.has("firstname")) {
      filters.push(and(eq("firstname", selector.firstName), ...nameFilters) as ODataFilter);
    } else {
      filters.push(nameFilters[0]);
    }
  } else if (selector.firstName && profile.columnsByLogicalName.has("firstname")) {
    filters.push(eq("firstname", selector.firstName));
  }

  const lookupFilter = or(...filters);
  if (!lookupFilter) {
    return null;
  }

  return query()
    .select(buildSelectFieldNames(profile, profile.detailFieldNames))
    .filter(and(stateFilter, lookupFilter))
    .orderby(profile.orderByField)
    .top(MAX_MATCH_RESULTS)
    .toString();
}

function buildContainsLookupQuery(
  profile: TableDataProfile,
  selector: ReturnType<typeof normalizeLookupSelector>,
  stateFilter?: ODataFilter,
): string | null {
  const filters: ODataFilter[] = [];

  if (selector.name && profile.nameSearchFieldNames.length > 0) {
    filters.push(
      or(
        ...profile.nameSearchFieldNames.map((fieldName) =>
          contains(fieldName, selector.name as string),
        ),
      ) as ODataFilter,
    );
  }

  if (selector.lastName && profile.columnsByLogicalName.has("lastname")) {
    const lastNameFilter = contains("lastname", selector.lastName);
    if (selector.firstName && profile.columnsByLogicalName.has("firstname")) {
      filters.push(and(contains("firstname", selector.firstName), lastNameFilter) as ODataFilter);
    } else {
      filters.push(lastNameFilter);
    }
  } else if (selector.firstName && profile.columnsByLogicalName.has("firstname")) {
    filters.push(contains("firstname", selector.firstName));
  }

  const lookupFilter = or(...filters);
  if (!lookupFilter) {
    return null;
  }

  return query()
    .select(buildSelectFieldNames(profile, profile.detailFieldNames))
    .filter(and(stateFilter, lookupFilter))
    .orderby(profile.orderByField)
    .top(MAX_MATCH_RESULTS)
    .toString();
}

function buildNameFilter(profile: TableDataProfile, nameFilter?: string): ODataFilter | undefined {
  const trimmed = nameFilter?.trim();
  if (!trimmed || profile.nameSearchFieldNames.length === 0) {
    return undefined;
  }

  return or(...profile.nameSearchFieldNames.map((fieldName) => contains(fieldName, trimmed)));
}

function buildStateFilter(
  profile: TableDataProfile,
  state?: TableRecordState,
): ODataFilter | undefined {
  if (!profile.supportsStateFilter) {
    return undefined;
  }

  switch (state || "active") {
    case "inactive":
      return eq("statecode", INACTIVE_STATE_CODE);
    case "all":
      return undefined;
    default:
      return eq("statecode", ACTIVE_STATE_CODE);
  }
}

function buildFieldSelection(
  columnsByLogicalName: Map<string, DataColumnDescriptor>,
  primaryIdColumn: DataColumnDescriptor,
  primaryNameColumn: DataColumnDescriptor | null,
  candidates: readonly string[],
): string[] {
  const fields = [primaryIdColumn.logicalName];

  if (primaryNameColumn?.logicalName) {
    fields.push(primaryNameColumn.logicalName);
  }

  for (const fieldName of candidates) {
    if (columnsByLogicalName.has(fieldName)) {
      fields.push(fieldName);
    }
  }

  return uniqueFieldNames(fields);
}

function buildSelectFieldNames(profile: TableDataProfile, logicalNames: string[]): string[] {
  return uniqueFieldNames(
    logicalNames.map((logicalName) => {
      const descriptor = profile.columnsByLogicalName.get(logicalName);
      return descriptor?.selectName || logicalName;
    }),
  );
}

function getRequiredColumnDescriptor(
  columnsByLogicalName: Map<string, DataColumnDescriptor>,
  logicalName: string,
  fallback: Pick<DataColumnDescriptor, "attributeType" | "displayName">,
): DataColumnDescriptor {
  return (
    getOptionalColumnDescriptor(columnsByLogicalName, logicalName) || {
      logicalName,
      selectName: logicalName,
      displayName: fallback.displayName,
      attributeType: fallback.attributeType,
    }
  );
}

function getOptionalColumnDescriptor(
  columnsByLogicalName: Map<string, DataColumnDescriptor>,
  logicalName?: string,
): DataColumnDescriptor | undefined {
  if (!logicalName) {
    return undefined;
  }

  return columnsByLogicalName.get(logicalName);
}

function getColumnSelectName(column: TableColumnRecord): string {
  return column.targets.length > 0 ? `_${column.logicalName}_value` : column.logicalName;
}

function normalizeListItem(
  profile: TableDataProfile,
  record: Record<string, unknown>,
): TableRecordListItem {
  const recordId = String(readRecordRawValue(record, profile.primaryIdColumn) || "");
  const label = resolveRecordLabel(profile, record, recordId);
  const secondaryText = resolveSecondaryText(profile, record, label);

  return {
    recordId,
    label,
    secondaryText,
    statecode: getNumberOrNull(readRecordRawValue(record, "statecode")),
    stateLabel: resolveChoiceLabel(record, "statecode"),
    statuscode: getNumberOrNull(readRecordRawValue(record, "statuscode")),
    statusLabel: resolveChoiceLabel(record, "statuscode"),
    createdon: String(readRecordRawValue(record, "createdon") || ""),
    modifiedon: String(readRecordRawValue(record, "modifiedon") || ""),
    raw: normalizeRawRecord(profile, record, profile.listFieldNames),
  };
}

function normalizeDetailsRecord(
  profile: TableDataProfile,
  record: Record<string, unknown>,
): TableRecordDetails {
  const listItem = normalizeListItem(profile, record);
  const fields = profile.detailFieldNames
    .map((fieldName) => buildFieldValue(profile, record, fieldName))
    .filter((field): field is TableRecordFieldValue => Boolean(field));

  return {
    ...listItem,
    fields,
    raw: normalizeRawRecord(profile, record, profile.detailFieldNames),
  };
}

function buildFieldValue(
  profile: TableDataProfile,
  record: Record<string, unknown>,
  logicalName: string,
): TableRecordFieldValue | null {
  const descriptor = profile.columnsByLogicalName.get(logicalName) || {
    logicalName,
    selectName: logicalName,
    displayName: logicalName,
    attributeType: "",
  };
  const rawValue = readRecordRawValue(record, descriptor);
  const formattedValue = readRecordFormattedValue(record, descriptor);

  if (isBlankValue(rawValue) && !formattedValue) {
    return null;
  }

  return {
    logicalName: descriptor.logicalName,
    displayName: descriptor.displayName || descriptor.logicalName,
    value: formattedValue || formatUnknownValue(rawValue),
    rawValue,
    formattedValue: formattedValue || null,
  };
}

function normalizeRawRecord(
  profile: TableDataProfile,
  record: Record<string, unknown>,
  logicalNames: string[],
): Record<string, unknown> {
  return Object.fromEntries(
    logicalNames.map((logicalName) => {
      const descriptor = profile.columnsByLogicalName.get(logicalName);
      const rawValue = readRecordRawValue(record, descriptor || logicalName);
      const formattedValue = readRecordFormattedValue(record, descriptor || logicalName);

      return [
        logicalName,
        {
          raw: rawValue,
          formatted: formattedValue,
        },
      ];
    }),
  );
}

function resolveRecordLabel(
  profile: TableDataProfile,
  record: Record<string, unknown>,
  fallbackId: string,
): string {
  const primaryLabel = profile.primaryNameColumn
    ? readRecordFormattedValue(record, profile.primaryNameColumn) ||
      formatUnknownValue(readRecordRawValue(record, profile.primaryNameColumn))
    : "";
  if (primaryLabel) {
    return primaryLabel;
  }

  const fullName = formatUnknownValue(readRecordRawValue(record, "fullname"));
  if (fullName) {
    return fullName;
  }

  const firstName = formatUnknownValue(readRecordRawValue(record, "firstname"));
  const lastName = formatUnknownValue(readRecordRawValue(record, "lastname"));
  const combined = `${firstName} ${lastName}`.trim();
  if (combined) {
    return combined;
  }

  const name = formatUnknownValue(readRecordRawValue(record, "name"));
  return name || fallbackId || "(no label)";
}

function resolveSecondaryText(
  profile: TableDataProfile,
  record: Record<string, unknown>,
  label: string,
): string {
  for (const fieldName of SECONDARY_FIELD_CANDIDATES) {
    if (!profile.columnsByLogicalName.has(fieldName)) {
      continue;
    }

    const value =
      readRecordFormattedValue(record, fieldName) ||
      formatUnknownValue(readRecordRawValue(record, fieldName));
    if (value && value !== label) {
      return value;
    }
  }

  return "";
}

function resolveChoiceLabel(record: Record<string, unknown>, logicalName: string): string | null {
  const formatted = readRecordFormattedValue(record, logicalName);
  if (formatted) {
    return formatted;
  }

  const raw = getNumberOrNull(readRecordRawValue(record, logicalName));
  if (raw === null) {
    return null;
  }

  if (logicalName === "statecode") {
    if (raw === ACTIVE_STATE_CODE) {
      return "Active";
    }
    if (raw === INACTIVE_STATE_CODE) {
      return "Inactive";
    }
  }

  return String(raw);
}

function readRecordRawValue(
  record: Record<string, unknown>,
  descriptor: DataColumnDescriptor | string,
): unknown {
  const selectName = typeof descriptor === "string" ? descriptor : descriptor.selectName;
  return record[selectName];
}

function readRecordFormattedValue(
  record: Record<string, unknown>,
  descriptor: DataColumnDescriptor | string,
): string {
  const selectName = typeof descriptor === "string" ? descriptor : descriptor.selectName;
  return String(record[`${selectName}${FORMATTED_VALUE_SUFFIX}`] || "");
}

function getNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeLookupSelector(options: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): {
  firstName?: string;
  lastName?: string;
  name?: string;
  rawRef: string;
} {
  const firstName = options.firstName?.trim();
  const lastName = options.lastName?.trim();
  const name = options.name?.trim();

  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    name: name || undefined,
    rawRef: [name, firstName, lastName].filter(Boolean).join(" / "),
  };
}

function resolveCandidates(
  profile: TableDataProfile,
  selector: ReturnType<typeof normalizeLookupSelector>,
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (records.length <= 1) {
    return records;
  }

  const matchers = buildCandidateMatchers(profile, selector);
  if (matchers.length === 0) {
    return records;
  }

  for (const matcher of matchers) {
    const matches = records.filter((record) => matcher(record));
    if (matches.length > 0) {
      return dedupeRecords(matches, profile.primaryIdColumn.selectName);
    }
  }

  return dedupeRecords(records, profile.primaryIdColumn.selectName);
}

function buildCandidateMatchers(
  profile: TableDataProfile,
  selector: ReturnType<typeof normalizeLookupSelector>,
): Array<(record: Record<string, unknown>) => boolean> {
  const matchers: Array<(record: Record<string, unknown>) => boolean> = [];

  if (selector.firstName && selector.lastName) {
    const firstName = selector.firstName;
    const lastName = selector.lastName;
    matchers.push(
      (record) =>
        equalsIgnoreCase(readRecordRawValue(record, "firstname"), firstName) &&
        equalsIgnoreCase(readRecordRawValue(record, "lastname"), lastName),
    );
    matchers.push(
      (record) =>
        includesIgnoreCase(readRecordRawValue(record, "firstname"), firstName) &&
        includesIgnoreCase(readRecordRawValue(record, "lastname"), lastName),
    );
  } else if (selector.lastName) {
    const lastName = selector.lastName;
    matchers.push((record) => equalsIgnoreCase(readRecordRawValue(record, "lastname"), lastName));
    matchers.push((record) => includesIgnoreCase(readRecordRawValue(record, "lastname"), lastName));
  } else if (selector.firstName) {
    const firstName = selector.firstName;
    matchers.push((record) => equalsIgnoreCase(readRecordRawValue(record, "firstname"), firstName));
    matchers.push((record) =>
      includesIgnoreCase(readRecordRawValue(record, "firstname"), firstName),
    );
  }

  if (selector.name) {
    const name = selector.name;
    matchers.push((record) =>
      profile.nameSearchFieldNames.some((fieldName) =>
        equalsIgnoreCase(readRecordRawValue(record, fieldName), name),
      ),
    );
    matchers.push((record) =>
      profile.nameSearchFieldNames.some((fieldName) =>
        includesIgnoreCase(readRecordRawValue(record, fieldName), name),
      ),
    );
  }

  return matchers;
}

function dedupeRecords(
  records: Record<string, unknown>[],
  idSelectName: string,
): Record<string, unknown>[] {
  const seen = new Set<string>();

  return records.filter((record) => {
    const recordId = String(record[idSelectName] || "");
    if (seen.has(recordId)) {
      return false;
    }

    seen.add(recordId);
    return true;
  });
}

function equalsIgnoreCase(value: unknown, needle: string): boolean {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === needle.trim().toLowerCase()
  );
}

function includesIgnoreCase(value: unknown, needle: string): boolean {
  return String(value || "")
    .trim()
    .toLowerCase()
    .includes(needle.trim().toLowerCase());
}

function createAmbiguousRecordError(
  recordRef: string,
  environmentName: string,
  tableLogicalName: string,
  profile: TableDataProfile,
  records: Record<string, unknown>[],
): AmbiguousMatchError {
  const options = records.map((record) => createRecordOption(profile, record));
  const matchSummary = options.map((option) => option.label).join(", ");

  return new AmbiguousMatchError(
    `Record '${recordRef}' is ambiguous in table '${tableLogicalName}' and environment '${environmentName}'. Choose a record and try again. Matches: ${matchSummary}.`,
    {
      parameter: "recordId",
      options,
    },
  );
}

function createRecordOption(
  profile: TableDataProfile,
  record: Record<string, unknown>,
): AmbiguousMatchOption {
  const item = normalizeListItem(profile, record);
  const parts = [item.label];

  if (item.secondaryText) {
    parts.push(item.secondaryText);
  }

  parts.push(item.recordId);

  return {
    value: item.recordId,
    label: parts.join(" | "),
  };
}

function buildNotFoundMessage(
  profile: TableDataProfile,
  environmentName: string,
  options: {
    firstName?: string;
    lastName?: string;
    name?: string;
    recordId?: string;
    state?: TableRecordState;
  },
  stateFilter?: ODataFilter,
): string {
  const ref =
    options.recordId ||
    [options.name?.trim(), options.firstName?.trim(), options.lastName?.trim()]
      .filter(Boolean)
      .join(" / ");
  const stateSuffix =
    stateFilter && profile.supportsStateFilter
      ? ` with state '${describeRequestedState(options.state, true)}'`
      : "";

  return `Record '${ref || "(empty)"}' not found in table '${profile.table.logicalName}' and environment '${environmentName}'${stateSuffix}.`;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): CursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.nextLink !== "string" ||
      typeof parsed.totalCount !== "number"
    ) {
      throw new Error("Invalid cursor shape");
    }

    return parsed;
  } catch {
    throw new Error(`Invalid cursor '${cursor}'. Use the nextCursor value returned by this tool.`);
  }
}

function uniqueFieldNames(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isBlankValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
