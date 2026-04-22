import { createHash } from "node:crypto";
import { normalizeXml } from "../../utils/xml-metadata.js";

export interface SitemapLocalizedText {
  languageCode: string;
  text: string;
}

export interface SitemapPrivilege {
  entity: string;
  privilege: string;
}

export interface SitemapSubArea {
  id: string;
  title: string;
  titles: SitemapLocalizedText[];
  descriptions: SitemapLocalizedText[];
  entity: string;
  url: string;
  icon: string;
  client: string;
  availableOffline: string;
  passParams: string;
  sku: string;
  privileges: SitemapPrivilege[];
}

export interface SitemapGroup {
  id: string;
  title: string;
  titles: SitemapLocalizedText[];
  descriptions: SitemapLocalizedText[];
  subAreas: SitemapSubArea[];
}

export interface SitemapArea {
  id: string;
  title: string;
  titles: SitemapLocalizedText[];
  descriptions: SitemapLocalizedText[];
  icon: string;
  groups: SitemapGroup[];
}

export interface SitemapXmlSummary {
  normalizedXml: string;
  hash: string;
  areas: SitemapArea[];
  areaCount: number;
  groupCount: number;
  subAreaCount: number;
  tableNames: string[];
  urls: string[];
}

type SitemapNode = SitemapArea | SitemapGroup | SitemapSubArea;

interface ParsedTag {
  name: string;
  attrs: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
}

export function summarizeSitemapXml(xml: string): SitemapXmlSummary {
  const normalizedXml = normalizeXml(xml);
  const areas: SitemapArea[] = [];
  let currentArea: SitemapArea | null = null;
  let currentGroup: SitemapGroup | null = null;
  let currentSubArea: SitemapSubArea | null = null;

  for (const tag of parseTags(normalizedXml)) {
    const name = tag.name.toLowerCase();

    if (tag.closing) {
      if (name === "subarea") {
        currentSubArea = null;
      } else if (name === "group") {
        currentGroup = null;
        currentSubArea = null;
      } else if (name === "area") {
        currentArea = null;
        currentGroup = null;
        currentSubArea = null;
      }
      continue;
    }

    if (name === "area") {
      const area = createArea(tag.attrs);
      areas.push(area);
      if (!tag.selfClosing) {
        currentArea = area;
        currentGroup = null;
        currentSubArea = null;
      }
      continue;
    }

    if (name === "group" && currentArea) {
      const group = createGroup(tag.attrs);
      currentArea.groups.push(group);
      if (!tag.selfClosing) {
        currentGroup = group;
        currentSubArea = null;
      }
      continue;
    }

    if (name === "subarea" && currentGroup) {
      const subArea = createSubArea(tag.attrs);
      currentGroup.subAreas.push(subArea);
      if (!tag.selfClosing) {
        currentSubArea = subArea;
      }
      continue;
    }

    if (name === "title") {
      addLocalizedText(
        getCurrentNode(currentSubArea, currentGroup, currentArea),
        tag.attrs,
        "Title",
      );
      continue;
    }

    if (name === "description") {
      addLocalizedText(
        getCurrentNode(currentSubArea, currentGroup, currentArea),
        tag.attrs,
        "Description",
      );
      continue;
    }

    if (name === "privilege" && currentSubArea) {
      const privilege = {
        entity: getAttr(tag.attrs, "Entity"),
        privilege: getAttr(tag.attrs, "Privilege"),
      };
      if (privilege.entity || privilege.privilege) {
        currentSubArea.privileges.push(privilege);
      }
    }
  }

  const subAreas = areas.flatMap((area) => area.groups.flatMap((group) => group.subAreas));

  return {
    normalizedXml,
    hash: createHash("sha256").update(normalizedXml).digest("hex").slice(0, 12),
    areas,
    areaCount: areas.length,
    groupCount: areas.reduce((count, area) => count + area.groups.length, 0),
    subAreaCount: subAreas.length,
    tableNames: uniqueSorted(subAreas.map((subArea) => subArea.entity).filter(Boolean)),
    urls: uniqueSorted(subAreas.map((subArea) => subArea.url).filter(Boolean)),
  };
}

function createArea(attrs: Record<string, string>): SitemapArea {
  return {
    id: getAttr(attrs, "Id"),
    title: getAttr(attrs, "Title"),
    titles: [],
    descriptions: [],
    icon: getAttr(attrs, "Icon"),
    groups: [],
  };
}

function createGroup(attrs: Record<string, string>): SitemapGroup {
  return {
    id: getAttr(attrs, "Id"),
    title: getAttr(attrs, "Title"),
    titles: [],
    descriptions: [],
    subAreas: [],
  };
}

function createSubArea(attrs: Record<string, string>): SitemapSubArea {
  return {
    id: getAttr(attrs, "Id"),
    title: getAttr(attrs, "Title"),
    titles: [],
    descriptions: [],
    entity: getAttr(attrs, "Entity"),
    url: getAttr(attrs, "Url"),
    icon: getAttr(attrs, "Icon"),
    client: getAttr(attrs, "Client"),
    availableOffline: getAttr(attrs, "AvailableOffline"),
    passParams: getAttr(attrs, "PassParams"),
    sku: getAttr(attrs, "Sku"),
    privileges: [],
  };
}

function addLocalizedText(
  node: SitemapNode | null,
  attrs: Record<string, string>,
  textAttributeName: "Title" | "Description",
): void {
  if (!node) {
    return;
  }

  const text = getAttr(attrs, textAttributeName);
  if (!text) {
    return;
  }

  const localizedText = {
    languageCode: getAttr(attrs, "LCID"),
    text,
  };

  if (textAttributeName === "Title") {
    node.titles.push(localizedText);
    if (!node.title) {
      node.title = text;
    }
  } else {
    node.descriptions.push(localizedText);
  }
}

function getCurrentNode(
  subArea: SitemapSubArea | null,
  group: SitemapGroup | null,
  area: SitemapArea | null,
): SitemapNode | null {
  return subArea || group || area;
}

function parseTags(xml: string): ParsedTag[] {
  const tags: ParsedTag[] = [];
  const tagRegex = /<\s*(\/?)([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)\s*>/g;

  for (const match of xml.matchAll(tagRegex)) {
    const rawAttrs = match[3] || "";
    tags.push({
      name: match[2] || "",
      attrs: parseAttributes(rawAttrs),
      closing: match[1] === "/",
      selfClosing: match[4] === "/" || rawAttrs.trim().endsWith("/"),
    });
  }

  return tags;
}

function parseAttributes(chunk: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g;

  for (const match of chunk.matchAll(attrRegex)) {
    attrs[match[1] || ""] = unescapeXml(match[3] || "");
  }

  return attrs;
}

function getAttr(attrs: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase();
  const key = Object.keys(attrs).find((candidate) => candidate.toLowerCase() === lowerName);
  return key ? attrs[key] || "" : "";
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
