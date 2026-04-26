import { createHash } from "node:crypto";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getDocumentTemplateByIdentityQuery,
  listDocumentTemplateDetailsByIdsQuery,
  listDocumentTemplatesQuery,
  type DocumentTemplateStatus,
  type DocumentTemplateType,
} from "../../queries/document-template-queries.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

const DOCUMENT_TYPE_LABELS: Record<number, string> = {
  1: "Excel",
  2: "Word",
};

const STATUS_LABELS: Record<string, string> = {
  true: "Draft",
  false: "Activated",
};

export interface DocumentTemplateRecord extends Record<string, unknown> {
  documenttemplateid: string;
  name: string;
  description: string;
  associatedentitytypecode: string;
  documenttype: number | null;
  documentTypeLabel: string;
  languagecode: number | null;
  status: boolean | null;
  statusLabel: string;
  createdon: string;
  modifiedon: string;
  createdById: string;
  createdByName: string;
  modifiedById: string;
  modifiedByName: string;
}

export interface DocumentTemplateContentSummary {
  contentLength: number;
  contentSizeBytes: number;
  contentHash: string;
  clientDataLength: number;
  clientDataHash: string;
}

export interface DocumentTemplateDetails extends DocumentTemplateRecord {
  clientdata: string;
  content: string;
  versionnumber: string;
  summary: DocumentTemplateContentSummary;
}

export interface DocumentTemplateResponseDetails extends DocumentTemplateRecord {
  versionnumber: string;
  summary: DocumentTemplateContentSummary;
  clientdata?: string;
  content?: string;
}

export async function listDocumentTemplates(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    associatedEntityTypeCode?: string;
    documentType?: DocumentTemplateType;
    status?: DocumentTemplateStatus;
    languageCode?: number;
  },
): Promise<DocumentTemplateRecord[]> {
  const records = await client.query<Record<string, unknown>>(
    env,
    "documenttemplates",
    listDocumentTemplatesQuery(options),
  );

  return records.map(normalizeDocumentTemplate);
}

export async function resolveDocumentTemplate(
  env: EnvironmentConfig,
  client: DynamicsClient,
  templateRef: string,
  options?: {
    associatedEntityTypeCode?: string;
    documentType?: DocumentTemplateType;
    status?: DocumentTemplateStatus;
    languageCode?: number;
  },
): Promise<DocumentTemplateRecord> {
  const templates = await listDocumentTemplates(env, client, options);
  const exactMatches = uniqueDocumentTemplates(
    templates.filter(
      (template) => template.documenttemplateid === templateRef || template.name === templateRef,
    ),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const needle = templateRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueDocumentTemplates(
    templates.filter(
      (template) =>
        template.name.toLowerCase() === needle ||
        template.documenttemplateid.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueDocumentTemplates(
    templates.filter(
      (template) =>
        template.name.toLowerCase().includes(needle) ||
        template.documenttemplateid.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueDocumentTemplates([
    ...exactMatches,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);
  if (matches.length > 1) {
    throw createAmbiguousDocumentTemplateError(templateRef, env.name, matches);
  }

  throw new Error(`Document template '${templateRef}' not found in '${env.name}'.`);
}

export async function fetchDocumentTemplateDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  templateRef: string,
  options?: {
    associatedEntityTypeCode?: string;
    documentType?: DocumentTemplateType;
    status?: DocumentTemplateStatus;
    languageCode?: number;
  },
): Promise<DocumentTemplateDetails> {
  const template = await resolveDocumentTemplate(env, client, templateRef, options);
  const records = await client.query<Record<string, unknown>>(
    env,
    "documenttemplates",
    getDocumentTemplateByIdentityQuery(template.documenttemplateid),
  );
  const details = records.find(
    (record) => String(record.documenttemplateid || "") === template.documenttemplateid,
  );

  if (!details) {
    const fallback = await client.query<Record<string, unknown>>(
      env,
      "documenttemplates",
      listDocumentTemplateDetailsByIdsQuery([template.documenttemplateid]),
    );
    const fallbackDetails = fallback.find(
      (record) => String(record.documenttemplateid || "") === template.documenttemplateid,
    );
    if (fallbackDetails) {
      return normalizeDocumentTemplateDetails(fallbackDetails);
    }

    throw new Error(`Document template '${template.name}' not found in '${env.name}'.`);
  }

  return normalizeDocumentTemplateDetails(details);
}

export function toDocumentTemplateResponseDetails(
  template: DocumentTemplateDetails,
  includeContent?: boolean,
): DocumentTemplateResponseDetails {
  const response: DocumentTemplateResponseDetails = {
    ...template,
    versionnumber: template.versionnumber,
    summary: template.summary,
  };

  if (!includeContent) {
    delete response.clientdata;
    delete response.content;
  }

  return response;
}

function normalizeDocumentTemplate(record: Record<string, unknown>): DocumentTemplateRecord {
  const documentType =
    record.documenttype === undefined || record.documenttype === null
      ? null
      : Number(record.documenttype);
  const status =
    record.status === undefined || record.status === null ? null : Boolean(record.status);

  return {
    ...record,
    documenttemplateid: String(record.documenttemplateid || ""),
    name: String(record.name || ""),
    description: String(record.description || ""),
    associatedentitytypecode: String(record.associatedentitytypecode || ""),
    documenttype: documentType,
    documentTypeLabel:
      documentType === null ? "-" : DOCUMENT_TYPE_LABELS[documentType] || String(documentType),
    languagecode:
      record.languagecode === undefined || record.languagecode === null
        ? null
        : Number(record.languagecode),
    status,
    statusLabel: status === null ? "-" : STATUS_LABELS[String(status)] || String(status),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
    createdById: String(record._createdby_value || ""),
    createdByName: String(
      record["_createdby_value@OData.Community.Display.V1.FormattedValue"] ||
        record._createdby_value ||
        "",
    ),
    modifiedById: String(record._modifiedby_value || ""),
    modifiedByName: String(
      record["_modifiedby_value@OData.Community.Display.V1.FormattedValue"] ||
        record._modifiedby_value ||
        "",
    ),
  };
}

function normalizeDocumentTemplateDetails(
  record: Record<string, unknown>,
): DocumentTemplateDetails {
  const base = normalizeDocumentTemplate(record);
  const clientdata = String(record.clientdata || "");
  const content = String(record.content || "");

  return {
    ...base,
    clientdata,
    content,
    versionnumber: String(record.versionnumber || ""),
    summary: {
      contentLength: content.length,
      contentSizeBytes: estimateBase64SizeBytes(content),
      contentHash: hashText(content),
      clientDataLength: clientdata.length,
      clientDataHash: hashText(clientdata),
    },
  };
}

function uniqueDocumentTemplates(templates: DocumentTemplateRecord[]): DocumentTemplateRecord[] {
  const seen = new Set<string>();
  return templates.filter((template) => {
    if (!template.documenttemplateid || seen.has(template.documenttemplateid)) {
      return false;
    }

    seen.add(template.documenttemplateid);
    return true;
  });
}

function createAmbiguousDocumentTemplateError(
  templateRef: string,
  environmentName: string,
  matches: DocumentTemplateRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Document template '${templateRef}' is ambiguous in '${environmentName}'. Choose a matching template and try again.`,
    {
      parameter: "templateName",
      options: matches.map((template) => createDocumentTemplateOption(template)),
    },
  );
}

function createDocumentTemplateOption(template: DocumentTemplateRecord): AmbiguousMatchOption {
  return {
    value: template.documenttemplateid,
    label: formatDocumentTemplateMatch(template),
  };
}

function formatDocumentTemplateMatch(template: DocumentTemplateRecord): string {
  const table = template.associatedentitytypecode || "-";
  return `${template.documentTypeLabel}/${table}/${template.name} (${template.documenttemplateid})`;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function estimateBase64SizeBytes(value: string): number {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}
