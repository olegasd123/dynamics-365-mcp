import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  globalOptionSetDefinitionPath,
  globalOptionSetDefinitionsPath,
  listGlobalOptionSetsQuery,
} from "../../queries/option-set-queries.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

export interface GlobalOptionValueRecord extends Record<string, unknown> {
  metadataId: string;
  value?: number;
  label: string;
  description: string;
  color: string;
  externalValue: string;
  isManaged: boolean;
}

export interface GlobalOptionSetRecord extends Record<string, unknown> {
  metadataId: string;
  name: string;
  displayName: string;
  description: string;
  optionSetType: string;
  isGlobal: boolean;
  isManaged: boolean;
  isCustomOptionSet: boolean;
  parentOptionSetName: string;
  optionCount: number;
}

export interface GlobalOptionSetDetails extends GlobalOptionSetRecord {
  options: GlobalOptionValueRecord[];
}

export async function listGlobalOptionSets(
  env: EnvironmentConfig,
  client: DynamicsClient,
  nameFilter?: string,
): Promise<GlobalOptionSetRecord[]> {
  const records = await client.queryPath<Record<string, unknown>>(
    env,
    globalOptionSetDefinitionsPath(),
    listGlobalOptionSetsQuery(),
  );

  const normalized = records.map(normalizeGlobalOptionSetRecord);
  const filtered = applyNameFilter(normalized, nameFilter);

  return filtered.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.displayName.localeCompare(right.displayName),
  );
}

export async function getGlobalOptionSetDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  optionSetRef: string,
): Promise<GlobalOptionSetDetails> {
  const optionSets = await listGlobalOptionSets(env, client);
  const match = resolveGlobalOptionSet(optionSetRef, optionSets);
  const details = await client.getPath<Record<string, unknown>>(
    env,
    globalOptionSetDefinitionPath(match.metadataId),
  );

  if (!details) {
    throw new Error(`Global option set '${match.name}' could not be loaded by metadata id.`);
  }

  return normalizeGlobalOptionSetDetails(details);
}

function applyNameFilter(
  optionSets: GlobalOptionSetRecord[],
  nameFilter: string | undefined,
): GlobalOptionSetRecord[] {
  if (!nameFilter?.trim()) {
    return optionSets;
  }

  const needle = nameFilter.trim().toLowerCase();
  return optionSets.filter((optionSet) => {
    return (
      optionSet.metadataId.toLowerCase().includes(needle) ||
      optionSet.name.toLowerCase().includes(needle) ||
      optionSet.displayName.toLowerCase().includes(needle)
    );
  });
}

function resolveGlobalOptionSet(
  optionSetRef: string,
  optionSets: GlobalOptionSetRecord[],
): GlobalOptionSetRecord {
  if (!optionSetRef.trim()) {
    throw new Error("Global option set reference must not be empty.");
  }

  const exactId = optionSets.filter((optionSet) => optionSet.metadataId === optionSetRef);
  if (exactId.length === 1) {
    return exactId[0];
  }

  const exactName = optionSets.filter((optionSet) => optionSet.name === optionSetRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const exactDisplayName = optionSets.filter((optionSet) => optionSet.displayName === optionSetRef);
  if (exactDisplayName.length === 1) {
    return exactDisplayName[0];
  }

  const needle = optionSetRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueOptionSets(
    optionSets.filter((optionSet) => {
      return (
        optionSet.metadataId.toLowerCase() === needle ||
        optionSet.name.toLowerCase() === needle ||
        optionSet.displayName.toLowerCase() === needle
      );
    }),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueOptionSets(
    optionSets.filter((optionSet) => {
      return (
        optionSet.metadataId.toLowerCase().includes(needle) ||
        optionSet.name.toLowerCase().includes(needle) ||
        optionSet.displayName.toLowerCase().includes(needle)
      );
    }),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueOptionSets([
    ...exactId,
    ...exactName,
    ...exactDisplayName,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);
  if (matches.length > 1) {
    throw createAmbiguousGlobalOptionSetError(optionSetRef, matches);
  }

  throw new Error(`Global option set '${optionSetRef}' not found.`);
}

function createAmbiguousGlobalOptionSetError(
  optionSetRef: string,
  matches: GlobalOptionSetRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Global option set '${optionSetRef}' is ambiguous. Choose an option set and try again. Matches: ${matches.map(formatGlobalOptionSetMatch).join(", ")}.`,
    {
      parameter: "optionSet",
      options: matches.map(createGlobalOptionSetOption),
    },
  );
}

function createGlobalOptionSetOption(optionSet: GlobalOptionSetRecord): AmbiguousMatchOption {
  return {
    value: optionSet.metadataId || optionSet.name,
    label: formatGlobalOptionSetMatch(optionSet),
  };
}

function formatGlobalOptionSetMatch(optionSet: GlobalOptionSetRecord): string {
  const displaySuffix =
    optionSet.displayName && optionSet.displayName !== optionSet.name
      ? ` (${optionSet.displayName})`
      : "";
  const idSuffix = optionSet.metadataId ? ` [${optionSet.metadataId}]` : "";
  return `${optionSet.name}${displaySuffix}${idSuffix}`;
}

function uniqueOptionSets(optionSets: GlobalOptionSetRecord[]): GlobalOptionSetRecord[] {
  const seen = new Set<string>();

  return optionSets.filter((optionSet) => {
    const key = optionSet.metadataId || optionSet.name;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeGlobalOptionSetRecord(record: Record<string, unknown>): GlobalOptionSetRecord {
  const optionSetType = normalizeEnumValue(record.OptionSetType);
  const options = extractOptions(record);
  const optionCount =
    options.length > 0 ? options.length : optionSetType.toLowerCase() === "boolean" ? 2 : 0;

  return {
    metadataId: String(record.MetadataId || ""),
    name: String(record.Name || ""),
    displayName: getLabelText(record.DisplayName),
    description: getLabelText(record.Description),
    optionSetType,
    isGlobal: getBooleanValue(record.IsGlobal),
    isManaged: getBooleanValue(record.IsManaged),
    isCustomOptionSet: getBooleanValue(record.IsCustomOptionSet),
    parentOptionSetName: String(record.ParentOptionSetName || ""),
    optionCount,
  };
}

function normalizeGlobalOptionSetDetails(record: Record<string, unknown>): GlobalOptionSetDetails {
  return {
    ...normalizeGlobalOptionSetRecord(record),
    options: extractOptions(record).sort(
      (left, right) =>
        (left.value ?? 0) - (right.value ?? 0) || left.label.localeCompare(right.label),
    ),
  };
}

function extractOptions(record: Record<string, unknown>): GlobalOptionValueRecord[] {
  const optionRecords = Array.isArray(record.Options)
    ? record.Options.map(getRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
  const booleanRecords = [getRecord(record.FalseOption), getRecord(record.TrueOption)].filter(
    (item): item is Record<string, unknown> => Boolean(item),
  );
  const sources = optionRecords.length > 0 ? optionRecords : booleanRecords;

  return sources
    .map(normalizeOption)
    .filter((option) => option.value !== undefined || option.label || option.metadataId);
}

function normalizeOption(option: Record<string, unknown>): GlobalOptionValueRecord {
  return {
    metadataId: String(option.MetadataId || ""),
    value: getNumberValue(option.Value),
    label: getLabelText(option.Label),
    description: getLabelText(option.Description),
    color: String(option.Color || ""),
    externalValue: String(option.ExternalValue || ""),
    isManaged: getBooleanValue(option.IsManaged),
  };
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
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
