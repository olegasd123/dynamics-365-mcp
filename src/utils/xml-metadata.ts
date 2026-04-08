import { createHash } from "node:crypto";

export interface FormXmlSummary {
  normalizedXml: string;
  hash: string;
  tabs: string[];
  sections: string[];
  controls: string[];
  libraries: string[];
  handlerCount: number;
}

export interface ViewXmlSummary {
  normalizedFetchXml: string;
  normalizedLayoutXml: string;
  fetchHash: string;
  layoutHash: string;
  entityName: string;
  attributes: string[];
  orders: string[];
  linkEntities: string[];
  filterCount: number;
  layoutColumns: string[];
  rowId: string;
}

export function summarizeFormXml(formXml: string): FormXmlSummary {
  const normalizedXml = normalizeXml(formXml);

  return {
    normalizedXml,
    hash: hashText(normalizedXml),
    tabs: extractOrderedAttributeValues(normalizedXml, "tab", "name"),
    sections: extractOrderedAttributeValues(normalizedXml, "section", "name"),
    controls: extractOrderedAttributeValues(normalizedXml, "control", "datafieldname").concat(
      extractOrderedAttributeValues(normalizedXml, "control", "id").filter(
        (value) =>
          !extractOrderedAttributeValues(normalizedXml, "control", "datafieldname").includes(value),
      ),
    ),
    libraries: extractOrderedAttributeValues(normalizedXml, "Library", "name"),
    handlerCount: countTags(normalizedXml, "Handler"),
  };
}

export function summarizeViewXml(fetchXml: string, layoutXml: string): ViewXmlSummary {
  const normalizedFetchXml = normalizeXml(fetchXml);
  const normalizedLayoutXml = normalizeXml(layoutXml);

  return {
    normalizedFetchXml,
    normalizedLayoutXml,
    fetchHash: hashText(normalizedFetchXml),
    layoutHash: hashText(normalizedLayoutXml),
    entityName: extractFirstAttributeValue(normalizedFetchXml, "entity", "name"),
    attributes: extractOrderedAttributeValues(normalizedFetchXml, "attribute", "name"),
    orders: extractOrderValues(normalizedFetchXml),
    linkEntities: extractOrderedAttributeValues(normalizedFetchXml, "link-entity", "name"),
    filterCount: countTags(normalizedFetchXml, "filter"),
    layoutColumns: extractOrderedAttributeValues(normalizedLayoutXml, "cell", "name"),
    rowId: extractFirstAttributeValue(normalizedLayoutXml, "row", "id"),
  };
}

export function normalizeXml(xml: string): string {
  return xml
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function extractOrderedAttributeValues(
  xml: string,
  tagName: string,
  attributeName: string,
): string[] {
  const tagRegex = new RegExp(`<${escapeRegExp(tagName)}\\b([^>]*)>`, "gi");
  const values: string[] = [];
  const seen = new Set<string>();

  for (const match of xml.matchAll(tagRegex)) {
    const attrs = match[1] || "";
    const value = extractAttributeFromChunk(attrs, attributeName);
    if (value && !seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }

  return values;
}

function extractFirstAttributeValue(xml: string, tagName: string, attributeName: string): string {
  const values = extractOrderedAttributeValues(xml, tagName, attributeName);
  return values[0] || "";
}

function extractOrderValues(xml: string): string[] {
  const tagRegex = /<order\b([^>]*)>/gi;
  const values: string[] = [];

  for (const match of xml.matchAll(tagRegex)) {
    const attrs = match[1] || "";
    const attribute = extractAttributeFromChunk(attrs, "attribute");
    const descending = extractAttributeFromChunk(attrs, "descending");
    if (!attribute) {
      continue;
    }
    values.push(`${attribute}${descending === "true" ? " desc" : " asc"}`);
  }

  return values;
}

function countTags(xml: string, tagName: string): number {
  const regex = new RegExp(`<${escapeRegExp(tagName)}\\b`, "gi");
  return [...xml.matchAll(regex)].length;
}

function extractAttributeFromChunk(chunk: string, attributeName: string): string {
  const attrRegex = new RegExp(`${escapeRegExp(attributeName)}=(["'])(.*?)\\1`, "i");
  const match = chunk.match(attrRegex);
  return match?.[2] || "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
