import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getFormDetailsByIdentityQuery,
  listFormDetailsByIdsQuery,
  listFormsByIdsQuery,
  listFormsQuery,
  type FormType,
} from "../../queries/form-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { resolveTable, type TableRecord } from "../tables/table-metadata.js";
import { summarizeFormXml, type FormXmlSummary } from "../../utils/xml-metadata.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";

const FORM_COMPONENT_TYPES = new Set([24, 60]);

const FORM_TYPE_LABELS_BY_CODE: Record<number, string> = {
  2: "Main",
  7: "Quick Create",
  11: "Card",
  12: "Main",
};

export interface FormRecord extends Record<string, unknown> {
  formid: string;
  name: string;
  description: string;
  objecttypecode: string;
  type: number;
  typeLabel: string;
  uniquename: string;
  formactivationstate: number;
  isdefault: boolean;
  ismanaged: boolean;
  publishedon: string;
  modifiedon: string;
}

export interface FormDetails extends FormRecord {
  formxml: string;
  summary: FormXmlSummary;
  summaryHash: string;
}

export async function listForms(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    table?: string;
    type?: FormType;
    nameFilter?: string;
    solution?: string;
  },
): Promise<FormRecord[]> {
  if (options?.solution) {
    const formIds = await fetchSolutionFormIds(env, client, options.solution);
    const resolvedTable = await tryResolveFormTable(env, client, options.table);
    const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
      env,
      client,
      "systemforms",
      [...formIds],
      "formid",
      listFormsByIdsQuery,
    );

    return records
      .map(normalizeForm)
      .filter((form) => matchesFormFilter(form, options, resolvedTable))
      .sort(compareForms);
  }

  const records = await client.query<Record<string, unknown>>(
    env,
    "systemforms",
    listFormsQuery(options),
  );
  return records.map(normalizeForm).sort(compareForms);
}

export async function resolveForm(
  env: EnvironmentConfig,
  client: DynamicsClient,
  formRef: string,
  options?: {
    table?: string;
    type?: FormType;
    solution?: string;
  },
): Promise<FormRecord> {
  const forms = await listForms(env, client, options);
  const exactMatches = findExactFormMatches(forms, formRef);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Form '${formRef}' is ambiguous in '${env.name}'. Matches: ${exactMatches.map(formatFormMatch).join(", ")}.`,
    );
  }

  if (options?.solution) {
    const fallbackExactMatches = findExactFormMatches(
      await listForms(env, client, { table: options.table, type: options.type }),
      formRef,
    );

    if (fallbackExactMatches.length === 1) {
      return fallbackExactMatches[0];
    }
  }

  const partialMatches = findPartialFormMatches(forms, formRef);
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Form '${formRef}' is ambiguous in '${env.name}'. Matches: ${partialMatches.map(formatFormMatch).join(", ")}.`,
    );
  }

  throw new Error(`Form '${formRef}' not found in '${env.name}'.`);
}

export async function fetchFormDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  formRef: string,
  options?: {
    table?: string;
    type?: FormType;
    solution?: string;
  },
): Promise<FormDetails> {
  const form = await resolveForm(env, client, formRef, options);
  const records = await client.query<Record<string, unknown>>(
    env,
    "systemforms",
    getFormDetailsByIdentityQuery({
      formId: form.formid || undefined,
      table: form.formid ? undefined : form.objecttypecode,
      uniqueName: form.formid ? undefined : form.uniquename || undefined,
      formName: form.formid || form.uniquename ? undefined : form.name,
    }),
  );

  const details = records.find((record) => String(record.formid || "") === form.formid);
  if (!details) {
    throw new Error(`Form '${form.name}' not found in '${env.name}'.`);
  }

  return normalizeFormDetails(details);
}

export async function fetchFormDetailsByIds(
  env: EnvironmentConfig,
  client: DynamicsClient,
  formIds: string[],
): Promise<FormDetails[]> {
  const records = await queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "systemforms",
    formIds,
    "formid",
    listFormDetailsByIdsQuery,
  );

  return records.map(normalizeFormDetails).sort(compareForms);
}

function normalizeForm(form: Record<string, unknown>): FormRecord {
  const type = Number(form.type || 0);

  return {
    ...form,
    formid: String(form.formid || ""),
    name: String(form.name || ""),
    description: String(form.description || ""),
    objecttypecode: String(form.objecttypecode || ""),
    type,
    typeLabel: FORM_TYPE_LABELS_BY_CODE[type] || String(type),
    uniquename: String(form.uniquename || ""),
    formactivationstate: Number(form.formactivationstate || 0),
    isdefault: Boolean(form.isdefault),
    ismanaged: Boolean(form.ismanaged),
    publishedon: String(form.publishedon || ""),
    modifiedon: String(form.modifiedon || ""),
  };
}

function normalizeFormDetails(form: Record<string, unknown>): FormDetails {
  const base = normalizeForm(form);
  const formxml = String(form.formxml || "");
  const summary = summarizeFormXml(formxml);

  return {
    ...base,
    formxml,
    summary,
    summaryHash: summary.hash,
  };
}

async function fetchSolutionFormIds(
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
      .filter((component) => FORM_COMPONENT_TYPES.has(Number(component.componenttype || 0)))
      .map((component) => String(component.objectid || ""))
      .filter(Boolean),
  );
}

function uniqueForms(forms: FormRecord[]): FormRecord[] {
  const seen = new Set<string>();

  return forms.filter((form) => {
    if (seen.has(form.formid)) {
      return false;
    }
    seen.add(form.formid);
    return true;
  });
}

function findExactFormMatches(forms: FormRecord[], formRef: string): FormRecord[] {
  const needle = normalizeFormMatchValue(formRef);

  return uniqueForms(
    forms.filter(
      (form) =>
        form.formid === formRef ||
        form.uniquename === formRef ||
        form.name === formRef ||
        normalizeFormMatchValue(form.formid) === needle ||
        normalizeFormMatchValue(form.uniquename) === needle ||
        normalizeFormMatchValue(form.name) === needle,
    ),
  );
}

function findPartialFormMatches(forms: FormRecord[], formRef: string): FormRecord[] {
  const needle = normalizeFormMatchValue(formRef);

  return uniqueForms(
    forms.filter(
      (form) =>
        normalizeFormMatchValue(form.formid).includes(needle) ||
        normalizeFormMatchValue(form.uniquename).includes(needle) ||
        normalizeFormMatchValue(form.name).includes(needle),
    ),
  );
}

function compareForms(left: FormRecord, right: FormRecord): number {
  return (
    left.objecttypecode.localeCompare(right.objecttypecode) ||
    left.typeLabel.localeCompare(right.typeLabel) ||
    left.name.localeCompare(right.name)
  );
}

function matchesFormFilter(
  form: FormRecord,
  options?: {
    table?: string;
    type?: FormType;
    nameFilter?: string;
    solution?: string;
  },
  resolvedTable?: TableRecord | null,
): boolean {
  if (options?.table && !matchesFormTable(form, options.table, resolvedTable)) {
    return false;
  }

  if (options?.type && !FORM_TYPE_CODES[options.type].includes(form.type)) {
    return false;
  }

  if (options?.nameFilter) {
    const needle = options.nameFilter.toLowerCase();
    return (
      form.name.toLowerCase().includes(needle) || form.uniquename.toLowerCase().includes(needle)
    );
  }

  return true;
}

async function tryResolveFormTable(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef?: string,
): Promise<TableRecord | null> {
  if (!tableRef) {
    return null;
  }

  try {
    return await resolveTable(env, client, tableRef);
  } catch {
    return null;
  }
}

function matchesFormTable(
  form: FormRecord,
  tableRef: string,
  resolvedTable?: TableRecord | null,
): boolean {
  const formTable = normalizeFormMatchValue(form.objecttypecode);
  if (!formTable) {
    return false;
  }

  const candidates = new Set<string>([normalizeFormMatchValue(tableRef)]);
  if (resolvedTable) {
    [
      resolvedTable.logicalName,
      resolvedTable.schemaName,
      resolvedTable.displayName,
      resolvedTable.entitySetName,
      resolvedTable.collectionName,
      resolvedTable.objectTypeCode,
    ]
      .map(normalizeFormMatchValue)
      .filter(Boolean)
      .forEach((value) => candidates.add(value));
  }

  return candidates.has(formTable);
}

function normalizeFormMatchValue(value: string | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const FORM_TYPE_CODES: Record<FormType, number[]> = {
  main: [2, 12],
  quickCreate: [7],
  card: [11],
};

function formatFormMatch(form: FormRecord): string {
  return `${form.objecttypecode}/${form.typeLabel}/${form.name}`;
}
