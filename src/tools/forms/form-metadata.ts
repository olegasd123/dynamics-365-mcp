import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getFormDetailsByIdentityQuery,
  listFormsByIdsQuery,
  listFormsQuery,
  type FormType,
} from "../../queries/form-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { resolveSolution } from "../solutions/solution-inventory.js";
import { summarizeFormXml, type FormXmlSummary } from "../../utils/xml-metadata.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";

const FORM_COMPONENT_TYPE = 24;

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
      .filter((form) => matchesFormFilter(form, options))
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
  const exactUnique = forms.filter((form) => form.uniquename === formRef);
  if (exactUnique.length === 1) {
    return exactUnique[0];
  }

  const exactName = forms.filter((form) => form.name === formRef);
  if (exactName.length === 1) {
    return exactName[0];
  }

  const needle = formRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueForms(
    forms.filter(
      (form) => form.uniquename.toLowerCase() === needle || form.name.toLowerCase() === needle,
    ),
  );

  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueForms(
    forms.filter(
      (form) =>
        form.uniquename.toLowerCase().includes(needle) || form.name.toLowerCase().includes(needle),
    ),
  );

  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueForms([
    ...exactUnique,
    ...exactName,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);

  if (matches.length > 1) {
    throw new Error(
      `Form '${formRef}' is ambiguous in '${env.name}'. Matches: ${matches.map(formatFormMatch).join(", ")}.`,
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
      table: form.objecttypecode,
      uniqueName: form.uniquename || undefined,
      formName: form.uniquename ? undefined : form.name,
    }),
  );

  const details = records.find((record) => String(record.formid || "") === form.formid);
  if (!details) {
    throw new Error(`Form '${form.name}' not found in '${env.name}'.`);
  }

  return normalizeFormDetails(details);
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
      .filter((component) => Number(component.componenttype || 0) === FORM_COMPONENT_TYPE)
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
): boolean {
  if (options?.table && form.objecttypecode !== options.table) {
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

const FORM_TYPE_CODES: Record<FormType, number[]> = {
  main: [2, 12],
  quickCreate: [7],
  card: [11],
};

function formatFormMatch(form: FormRecord): string {
  return `${form.objecttypecode}/${form.typeLabel}/${form.name}`;
}
