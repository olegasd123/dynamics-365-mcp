import { createHash } from "node:crypto";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  getEmailTemplateByIdentityQuery,
  listEmailTemplateDetailsByIdsQuery,
  listEmailTemplatesByIdsQuery,
  listEmailTemplatesQuery,
  type EmailTemplateScope,
} from "../../queries/email-template-queries.js";
import { listSolutionComponentsQuery } from "../../queries/solution-queries.js";
import { queryRecordsByIdsInChunks } from "../../utils/query-batching.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";
import { resolveSolution } from "../solutions/solution-inventory.js";

export const EMAIL_TEMPLATE_COMPONENT_TYPE = 36;

export interface EmailTemplateRecord extends Record<string, unknown> {
  templateid: string;
  title: string;
  description: string;
  templatetypecode: string;
  subject: string;
  mimetype: string;
  languagecode: number | null;
  ispersonal: boolean;
  scope: "personal" | "organization";
  ismanaged: boolean;
  isrecommended: boolean;
  usedcount: number | null;
  ownerid: string;
  ownerName: string;
  createdon: string;
  modifiedon: string;
}

export interface EmailTemplateContentSummary {
  subjectLength: number;
  bodyLength: number;
  safeHtmlLength: number;
  presentationXmlLength: number;
  subjectSafeHtmlLength: number;
  subjectPresentationXmlLength: number;
  bodyHash: string;
  safeHtmlHash: string;
  presentationXmlHash: string;
  subjectSafeHtmlHash: string;
  subjectPresentationXmlHash: string;
  placeholders: string[];
}

export interface EmailTemplateDetails extends EmailTemplateRecord {
  body: string;
  safehtml: string;
  presentationxml: string;
  subjectsafehtml: string;
  subjectpresentationxml: string;
  generationtypecode: number | null;
  componentstate: number | null;
  versionnumber: string;
  summary: EmailTemplateContentSummary;
}

export interface EmailTemplateResponseDetails extends EmailTemplateRecord {
  generationtypecode: number | null;
  componentstate: number | null;
  versionnumber: string;
  summary: EmailTemplateContentSummary;
  body?: string;
  safehtml?: string;
  presentationxml?: string;
  subjectsafehtml?: string;
  subjectpresentationxml?: string;
}

export async function listEmailTemplates(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    templateTypeCode?: string;
    scope?: EmailTemplateScope;
    languageCode?: number;
    solution?: string;
  },
): Promise<EmailTemplateRecord[]> {
  const scope = options?.scope || "all";

  const records = options?.solution
    ? await fetchSolutionEmailTemplates(env, client, options)
    : await client.query<Record<string, unknown>>(
        env,
        "templates",
        listEmailTemplatesQuery({ ...options, scope }),
      );

  return records.map(normalizeEmailTemplate).filter((template) =>
    matchesTemplateFilter(template, {
      ...options,
      scope,
    }),
  );
}

export async function resolveEmailTemplate(
  env: EnvironmentConfig,
  client: DynamicsClient,
  templateRef: string,
  options?: {
    templateTypeCode?: string;
    scope?: EmailTemplateScope;
    languageCode?: number;
    solution?: string;
  },
): Promise<EmailTemplateRecord> {
  const templates = await listEmailTemplates(env, client, options);
  const exactMatches = uniqueEmailTemplates(
    templates.filter(
      (template) => template.templateid === templateRef || template.title === templateRef,
    ),
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const needle = templateRef.trim().toLowerCase();
  const caseInsensitiveMatches = uniqueEmailTemplates(
    templates.filter(
      (template) =>
        template.title.toLowerCase() === needle || template.templateid.toLowerCase() === needle,
    ),
  );
  if (caseInsensitiveMatches.length === 1) {
    return caseInsensitiveMatches[0];
  }

  const partialMatches = uniqueEmailTemplates(
    templates.filter(
      (template) =>
        template.title.toLowerCase().includes(needle) ||
        template.templateid.toLowerCase().includes(needle),
    ),
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  const matches = uniqueEmailTemplates([
    ...exactMatches,
    ...caseInsensitiveMatches,
    ...partialMatches,
  ]);
  if (matches.length > 1) {
    throw createAmbiguousEmailTemplateError(templateRef, env.name, matches);
  }

  throw new Error(`Email template '${templateRef}' not found in '${env.name}'.`);
}

export async function fetchEmailTemplateDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  templateRef: string,
  options?: {
    templateTypeCode?: string;
    scope?: EmailTemplateScope;
    languageCode?: number;
    solution?: string;
  },
): Promise<EmailTemplateDetails> {
  const template = await resolveEmailTemplate(env, client, templateRef, options);
  const records = options?.solution
    ? await queryRecordsByIdsInChunks<Record<string, unknown>>(
        env,
        client,
        "templates",
        [template.templateid],
        "templateid",
        listEmailTemplateDetailsByIdsQuery,
      )
    : await client.query<Record<string, unknown>>(
        env,
        "templates",
        getEmailTemplateByIdentityQuery({
          templateName: template.title,
          templateTypeCode: template.templatetypecode || options?.templateTypeCode,
        }),
      );

  const details = records.find((record) => String(record.templateid || "") === template.templateid);
  if (!details) {
    throw new Error(`Email template '${template.title}' not found in '${env.name}'.`);
  }

  return normalizeEmailTemplateDetails(details);
}

export function toEmailTemplateResponseDetails(
  template: EmailTemplateDetails,
  includeRawContent?: boolean,
): EmailTemplateResponseDetails {
  const response: EmailTemplateResponseDetails = {
    ...template,
    generationtypecode: template.generationtypecode,
    componentstate: template.componentstate,
    versionnumber: template.versionnumber,
    summary: template.summary,
  };

  if (!includeRawContent) {
    delete response.body;
    delete response.safehtml;
    delete response.presentationxml;
    delete response.subjectsafehtml;
    delete response.subjectpresentationxml;
  }

  return response;
}

function normalizeEmailTemplate(record: Record<string, unknown>): EmailTemplateRecord {
  const ispersonal = Boolean(record.ispersonal);

  return {
    ...record,
    templateid: String(record.templateid || ""),
    title: String(record.title || ""),
    description: String(record.description || ""),
    templatetypecode: String(record.templatetypecode || ""),
    subject: String(record.subject || ""),
    mimetype: String(record.mimetype || ""),
    languagecode:
      record.languagecode === undefined || record.languagecode === null
        ? null
        : Number(record.languagecode),
    ispersonal,
    scope: ispersonal ? "personal" : "organization",
    ismanaged: Boolean(record.ismanaged),
    isrecommended: Boolean(record.isrecommended),
    usedcount:
      record.usedcount === undefined || record.usedcount === null ? null : Number(record.usedcount),
    ownerid: String(record._ownerid_value || ""),
    ownerName: String(
      record["_ownerid_value@OData.Community.Display.V1.FormattedValue"] ||
        record._ownerid_value ||
        "",
    ),
    createdon: String(record.createdon || ""),
    modifiedon: String(record.modifiedon || ""),
  };
}

function normalizeEmailTemplateDetails(record: Record<string, unknown>): EmailTemplateDetails {
  const base = normalizeEmailTemplate(record);
  const body = String(record.body || "");
  const safehtml = String(record.safehtml || "");
  const presentationxml = String(record.presentationxml || "");
  const subjectsafehtml = String(record.subjectsafehtml || "");
  const subjectpresentationxml = String(record.subjectpresentationxml || "");

  return {
    ...base,
    body,
    safehtml,
    presentationxml,
    subjectsafehtml,
    subjectpresentationxml,
    generationtypecode:
      record.generationtypecode === undefined || record.generationtypecode === null
        ? null
        : Number(record.generationtypecode),
    componentstate:
      record.componentstate === undefined || record.componentstate === null
        ? null
        : Number(record.componentstate),
    versionnumber: String(record.versionnumber || ""),
    summary: {
      subjectLength: base.subject.length,
      bodyLength: body.length,
      safeHtmlLength: safehtml.length,
      presentationXmlLength: presentationxml.length,
      subjectSafeHtmlLength: subjectsafehtml.length,
      subjectPresentationXmlLength: subjectpresentationxml.length,
      bodyHash: hashText(body),
      safeHtmlHash: hashText(safehtml),
      presentationXmlHash: hashText(presentationxml),
      subjectSafeHtmlHash: hashText(subjectsafehtml),
      subjectPresentationXmlHash: hashText(subjectpresentationxml),
      placeholders: extractPlaceholders([
        base.subject,
        body,
        safehtml,
        presentationxml,
        subjectsafehtml,
        subjectpresentationxml,
      ]),
    },
  };
}

async function fetchSolutionEmailTemplateIds(
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
      .filter((component) => Number(component.componenttype || 0) === EMAIL_TEMPLATE_COMPONENT_TYPE)
      .map((component) => String(component.objectid || ""))
      .filter(Boolean),
  );
}

async function fetchSolutionEmailTemplates(
  env: EnvironmentConfig,
  client: DynamicsClient,
  options?: {
    nameFilter?: string;
    templateTypeCode?: string;
    scope?: EmailTemplateScope;
    languageCode?: number;
    solution?: string;
  },
): Promise<Record<string, unknown>[]> {
  const templateIds = await fetchSolutionEmailTemplateIds(
    env,
    client,
    String(options?.solution || ""),
  );

  return queryRecordsByIdsInChunks<Record<string, unknown>>(
    env,
    client,
    "templates",
    [...templateIds],
    "templateid",
    listEmailTemplatesByIdsQuery,
  );
}

function matchesTemplateFilter(
  template: EmailTemplateRecord,
  options?: {
    nameFilter?: string;
    templateTypeCode?: string;
    scope?: EmailTemplateScope;
    languageCode?: number;
  },
): boolean {
  if (
    options?.nameFilter &&
    !template.title.toLowerCase().includes(options.nameFilter.toLowerCase())
  ) {
    return false;
  }

  if (options?.templateTypeCode && template.templatetypecode !== options.templateTypeCode) {
    return false;
  }

  if (options?.scope === "personal" && template.scope !== "personal") {
    return false;
  }

  if (options?.scope === "organization" && template.scope !== "organization") {
    return false;
  }

  if (options?.languageCode !== undefined && template.languagecode !== options.languageCode) {
    return false;
  }

  return true;
}

function uniqueEmailTemplates(templates: EmailTemplateRecord[]): EmailTemplateRecord[] {
  const seen = new Set<string>();

  return templates.filter((template) => {
    if (seen.has(template.templateid)) {
      return false;
    }
    seen.add(template.templateid);
    return true;
  });
}

function comparePlaceholders(left: string, right: string): number {
  return left.localeCompare(right);
}

function extractPlaceholders(values: string[]): string[] {
  const seen = new Set<string>();
  const patterns = [
    /\{\{([^{}]+)\}\}/g,
    /\{!([^{}]+)\}/g,
    /\b(?:datafieldname|attribute|attributelogicalname|field)=(["'])(.*?)\1/gi,
    /<datafieldname\b[^>]*\bname=(["'])(.*?)\1/gi,
  ];

  for (const value of values) {
    for (const pattern of patterns) {
      for (const match of value.matchAll(pattern)) {
        const placeholder = String(match[2] || match[1] || "").trim();
        if (placeholder) {
          seen.add(placeholder);
        }
      }
    }
  }

  return [...seen].sort(comparePlaceholders);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function formatEmailTemplateMatch(template: EmailTemplateRecord): string {
  return `${template.templatetypecode || "-"}/${template.scope}/${template.title}`;
}

function createAmbiguousEmailTemplateError(
  templateRef: string,
  environmentName: string,
  matches: EmailTemplateRecord[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Email template '${templateRef}' is ambiguous in '${environmentName}'. Choose a matching template and try again. Matches: ${matches.map(formatEmailTemplateMatch).join(", ")}.`,
    {
      parameter: "templateName",
      options: matches.map((template) => createEmailTemplateOption(template)),
    },
  );
}

function createEmailTemplateOption(template: EmailTemplateRecord): AmbiguousMatchOption {
  return {
    value: template.templateid,
    label: `${template.templatetypecode || "-"}/${template.scope}/${template.title} (${template.templateid})`,
  };
}
