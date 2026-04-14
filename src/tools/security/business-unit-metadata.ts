import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  listBusinessUnitsQuery,
  listRootBusinessUnitsQuery,
} from "../../queries/security-queries.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

export interface BusinessUnitRecord extends Record<string, unknown> {
  businessunitid: string;
  name: string;
  parentbusinessunitid: string;
  parentBusinessUnitName: string;
  organizationid: string;
  organizationName: string;
  isdisabled: boolean;
  createdon: string;
  modifiedon: string;
  isRoot: boolean;
}

export interface BusinessUnitDetails {
  businessUnit: BusinessUnitRecord;
  parent: BusinessUnitRecord | null;
  children: BusinessUnitRecord[];
  path: string[];
}

interface RootBusinessUnitRecord extends Record<string, unknown> {
  businessunitid: string;
  name: string;
}

export async function listBusinessUnits(
  env: EnvironmentConfig,
  client: DynamicsClient,
  nameFilter?: string,
): Promise<BusinessUnitRecord[]> {
  const records = await client.query<Record<string, unknown>>(
    env,
    "businessunits",
    listBusinessUnitsQuery(nameFilter),
  );

  return records.map(normalizeBusinessUnit);
}

export async function resolveBusinessUnit(
  env: EnvironmentConfig,
  client: DynamicsClient,
  businessUnitRef: string,
): Promise<BusinessUnitRecord> {
  const businessUnits = await listBusinessUnits(env, client);
  return resolveBusinessUnitFromRecords(env.name, businessUnits, businessUnitRef);
}

export async function fetchBusinessUnitDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  businessUnitRef: string,
): Promise<BusinessUnitDetails> {
  const businessUnits = await listBusinessUnits(env, client);
  const businessUnit = resolveBusinessUnitFromRecords(env.name, businessUnits, businessUnitRef);
  const byId = new Map(businessUnits.map((unit) => [unit.businessunitid, unit]));
  const parent = byId.get(businessUnit.parentbusinessunitid) || null;
  const children = businessUnits
    .filter((unit) => unit.parentbusinessunitid === businessUnit.businessunitid)
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    businessUnit,
    parent,
    children,
    path: buildBusinessUnitPath(businessUnit, byId),
  };
}

export async function fetchDefaultGlobalBusinessUnitName(
  env: EnvironmentConfig,
  client: DynamicsClient,
): Promise<string> {
  const businessUnits = await client.query<Record<string, unknown>>(
    env,
    "businessunits",
    listRootBusinessUnitsQuery(),
  );
  const rootBusinessUnits = businessUnits
    .map(normalizeRootBusinessUnit)
    .filter((unit) => unit.name);

  if (rootBusinessUnits.length === 1) {
    return rootBusinessUnits[0].name;
  }

  if (rootBusinessUnits.length > 1) {
    throw createAmbiguousDefaultGlobalBusinessUnitError(env.name, rootBusinessUnits);
  }

  throw new Error(`Default global business unit not found in '${env.name}'.`);
}

function resolveBusinessUnitFromRecords(
  environmentName: string,
  businessUnits: BusinessUnitRecord[],
  businessUnitRef: string,
): BusinessUnitRecord {
  const exactId = businessUnits.filter((unit) => unit.businessunitid === businessUnitRef);
  if (exactId.length === 1) {
    return exactId[0];
  }

  const exactName = businessUnits.filter((unit) => unit.name === businessUnitRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const needle = businessUnitRef.trim().toLowerCase();
  const matches = businessUnits.filter((unit) => unit.name.toLowerCase().includes(needle));
  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1 || exactName.length > 1) {
    const ambiguous = uniqueBusinessUnits([...matches, ...exactName]);
    throw createAmbiguousBusinessUnitError(businessUnitRef, environmentName, ambiguous);
  }

  throw new Error(`Business unit '${businessUnitRef}' not found in '${environmentName}'.`);
}

function buildBusinessUnitPath(
  businessUnit: BusinessUnitRecord,
  byId: Map<string, BusinessUnitRecord>,
): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: BusinessUnitRecord | undefined = businessUnit;

  while (current && !visited.has(current.businessunitid)) {
    visited.add(current.businessunitid);
    path.unshift(current.name || current.businessunitid);
    current = current.parentbusinessunitid ? byId.get(current.parentbusinessunitid) : undefined;
  }

  return path;
}

function normalizeBusinessUnit(record: Record<string, unknown>): BusinessUnitRecord {
  const parentBusinessUnitId = String(record._parentbusinessunitid_value || "");

  return {
    ...record,
    businessunitid: String(record.businessunitid || ""),
    name: String(record.name || ""),
    parentbusinessunitid: parentBusinessUnitId,
    parentBusinessUnitName: String(
      record["_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue"] ||
        parentBusinessUnitId ||
        "",
    ),
    organizationid: String(record._organizationid_value || ""),
    organizationName: String(
      record["_organizationid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._organizationid_value ||
        "",
    ),
    isdisabled: Boolean(record.isdisabled),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
    isRoot: !parentBusinessUnitId,
  };
}

function createAmbiguousBusinessUnitError(
  businessUnitRef: string,
  environmentName: string,
  matches: BusinessUnitRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Business unit '${businessUnitRef}' is ambiguous in '${environmentName}'. Choose a business unit and try again. Matches: ${matches.map(formatBusinessUnitMatch).join(", ")}.`,
    {
      parameter: "businessUnitName",
      options: matches.map((unit) => createBusinessUnitOption(unit)),
    },
  );
}

function createBusinessUnitOption(unit: BusinessUnitRecord): AmbiguousMatchOption {
  return {
    value: unit.businessunitid,
    label: formatBusinessUnitMatch(unit),
  };
}

function formatBusinessUnitMatch(unit: BusinessUnitRecord): string {
  return unit.parentBusinessUnitName ? `${unit.name} [${unit.parentBusinessUnitName}]` : unit.name;
}

function normalizeRootBusinessUnit(record: Record<string, unknown>): RootBusinessUnitRecord {
  return {
    ...record,
    businessunitid: String(record.businessunitid || ""),
    name: String(record.name || ""),
  };
}

function createAmbiguousDefaultGlobalBusinessUnitError(
  environmentName: string,
  matches: RootBusinessUnitRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Default global business unit is ambiguous in '${environmentName}'. Choose a business unit and try again. Matches: ${matches.map((unit) => unit.name).join(", ")}.`,
    {
      parameter: "businessUnitName",
      options: matches.map((unit) => createRootBusinessUnitOption(unit)),
    },
  );
}

function createRootBusinessUnitOption(unit: RootBusinessUnitRecord): AmbiguousMatchOption {
  return {
    value: unit.businessunitid,
    label: unit.name || unit.businessunitid,
  };
}

function uniqueBusinessUnits(units: BusinessUnitRecord[]): BusinessUnitRecord[] {
  const seen = new Set<string>();

  return units.filter((unit) => {
    if (seen.has(unit.businessunitid)) {
      return false;
    }

    seen.add(unit.businessunitid);
    return true;
  });
}
