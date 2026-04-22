export interface EnvironmentVariableDefinitionRecord extends Record<string, unknown> {
  environmentvariabledefinitionid: string;
  schemaname: string;
  displayname: string;
  type: number;
  defaultvalue: string;
  valueschema: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface EnvironmentVariableValueRecord extends Record<string, unknown> {
  environmentvariablevalueid: string;
  environmentvariabledefinitionid: string;
  value: string;
  ismanaged: boolean;
  modifiedon: string;
}

export interface ConnectionReferenceRecord extends Record<string, unknown> {
  connectionreferenceid: string;
  connectionreferencelogicalname: string;
  displayname: string;
  connectorid: string;
  connectionid: string;
  ismanaged: boolean;
  modifiedon: string;
  statecode: number;
}

export interface AppModuleRecord extends Record<string, unknown> {
  appmoduleid: string;
  appmoduleidunique: string;
  name: string;
  uniquename: string;
  ismanaged: boolean;
  modifiedon: string;
  statecode: number;
}

export interface DashboardRecord extends Record<string, unknown> {
  formid: string;
  name: string;
  description: string;
  objecttypecode: string;
  type: number;
  ismanaged: boolean;
  publishedon: string;
  modifiedon: string;
}

export const ENVIRONMENT_VARIABLE_TYPE_LABELS: Record<number, string> = {
  100000000: "String",
  100000001: "Number",
  100000002: "Boolean",
  100000003: "JSON",
  100000004: "Data Source",
  100000005: "Secret",
};

export const CONNECTION_REFERENCE_STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

export const APP_MODULE_STATE_LABELS: Record<number, string> = {
  0: "Active",
  1: "Inactive",
};

export const DASHBOARD_TYPE_LABELS: Record<number, string> = {
  0: "Dashboard",
};

export function normalizeEnvironmentVariableDefinition(
  record: Record<string, unknown>,
): EnvironmentVariableDefinitionRecord {
  return {
    ...record,
    environmentvariabledefinitionid: String(record.environmentvariabledefinitionid || ""),
    schemaname: String(record.schemaname || ""),
    displayname: String(record.displayname || ""),
    type: Number(record.type || 0),
    defaultvalue: String(record.defaultvalue || ""),
    valueschema: String(record.valueschema || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

export function normalizeEnvironmentVariableValue(
  record: Record<string, unknown>,
): EnvironmentVariableValueRecord {
  return {
    ...record,
    environmentvariablevalueid: String(record.environmentvariablevalueid || ""),
    environmentvariabledefinitionid: String(record._environmentvariabledefinitionid_value || ""),
    value: String(record.value || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
  };
}

export function normalizeConnectionReference(
  record: Record<string, unknown>,
): ConnectionReferenceRecord {
  const displayName = record.connectionreferencedisplayname || record.displayname || "";

  return {
    ...record,
    connectionreferenceid: String(record.connectionreferenceid || ""),
    connectionreferencelogicalname: String(record.connectionreferencelogicalname || ""),
    displayname: String(displayName),
    connectorid: String(record.connectorid || ""),
    connectionid: String(record.connectionid || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
    statecode: Number(record.statecode || 0),
  };
}

export function normalizeAppModule(record: Record<string, unknown>): AppModuleRecord {
  return {
    ...record,
    appmoduleid: String(record.appmoduleid || ""),
    appmoduleidunique: String(record.appmoduleidunique || record.appmoduleid || ""),
    name: String(record.name || ""),
    uniquename: String(record.uniquename || ""),
    ismanaged: Boolean(record.ismanaged),
    modifiedon: String(record.modifiedon || ""),
    statecode: Number(record.statecode || 0),
  };
}

export function normalizeDashboard(record: Record<string, unknown>): DashboardRecord {
  return {
    ...record,
    formid: String(record.formid || ""),
    name: String(record.name || ""),
    description: String(record.description || ""),
    objecttypecode: String(record.objecttypecode || ""),
    type: Number(record.type || 0),
    ismanaged: Boolean(record.ismanaged),
    publishedon: String(record.publishedon || ""),
    modifiedon: String(record.modifiedon || ""),
  };
}

export function getEnvironmentVariableTypeLabel(type: number): string {
  return ENVIRONMENT_VARIABLE_TYPE_LABELS[type] || String(type);
}

export function getConnectionReferenceStateLabel(statecode: number): string {
  return CONNECTION_REFERENCE_STATE_LABELS[statecode] || String(statecode);
}

export function getAppModuleStateLabel(statecode: number): string {
  return APP_MODULE_STATE_LABELS[statecode] || String(statecode);
}

export function getDashboardTypeLabel(type: number): string {
  return DASHBOARD_TYPE_LABELS[type] || String(type);
}

export function getConnectionStatus(connection: ConnectionReferenceRecord): string {
  if (!connection.connectionid) {
    return "Missing Connection";
  }

  if (connection.statecode !== 0) {
    return "Inactive";
  }

  return "Connected";
}

export function getConnectorName(connectorId: string): string {
  const trimmed = connectorId.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}
