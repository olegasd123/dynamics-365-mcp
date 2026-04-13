import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import {
  buildRetrieveEntityRibbonPath,
  type RibbonLocationFilter,
} from "../../queries/ribbon-queries.js";
import {
  listSolutionComponentsByObjectIdsQuery,
  listSolutionsQuery,
} from "../../queries/solution-queries.js";
import { resolveTable, type TableRecord } from "../tables/table-metadata.js";
import { normalizeXml } from "../../utils/xml-metadata.js";

interface RetrieveEntityRibbonResponse {
  CompressedEntityXml?: string;
}

interface ExportTranslationResponse {
  ExportTranslationFile?: string;
}

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  parent?: XmlNode;
}

export interface RibbonActionSummary {
  type: string;
  attributes: Record<string, string>;
}

export interface RibbonRuleSummary {
  id: string;
  type: "display" | "enable";
  steps: RibbonActionSummary[];
}

export interface RibbonCommandSummary {
  id: string;
  displayRuleIds: string[];
  enableRuleIds: string[];
  actions: RibbonActionSummary[];
}

export interface RibbonButtonRecord {
  altText: string;
  id: string;
  labelText: string;
  label: string;
  toolTipTitleText: string;
  toolTipTitle: string;
  toolTipDescriptionText: string;
  toolTipDescription: string;
  descriptionText: string;
  description: string;
  command: string;
  sequence: number | null;
  templateAlias: string;
  image16by16: string;
  image32by32: string;
  modernImage: string;
  location: string;
  ribbonId: string;
  ribbonType: "form" | "homepageGrid" | "subgrid" | "other";
  tabId: string;
  groupId: string;
  ancestorIds: string[];
  commandDefinition: RibbonCommandSummary | null;
}

export interface RibbonGroup {
  id: string;
  type: RibbonButtonRecord["ribbonType"];
  location: string;
  buttonCount: number;
  buttons: RibbonButtonRecord[];
}

export interface TableRibbonMetadata {
  table: TableRecord;
  locationFilter: RibbonLocationFilter;
  sourceXml: string;
  normalizedXml: string;
  xmlHash: string;
  ribbons: RibbonGroup[];
  buttons: RibbonButtonRecord[];
  commands: RibbonCommandSummary[];
  displayRules: RibbonRuleSummary[];
  enableRules: RibbonRuleSummary[];
  locLabels: Record<string, string>;
}

export interface RibbonButtonDetails extends RibbonButtonRecord {
  displayRules: RibbonRuleSummary[];
  enableRules: RibbonRuleSummary[];
}

type RibbonTextKind = "label" | "title" | "description" | "alt" | "generic";

interface CandidateSolution {
  friendlyname: string;
  solutionid: string;
  uniquename: string;
  ismanaged: boolean;
}

const GENERIC_RIBBON_NAME_PARTS = new Set([
  "alt",
  "button",
  "children",
  "command",
  "controls",
  "description",
  "display",
  "enable",
  "form",
  "group",
  "groups",
  "homepagegrid",
  "label",
  "labeltext",
  "maintab",
  "management",
  "mscrm",
  "other",
  "ribbon",
  "subgrid",
  "tab",
  "tabs",
  "title",
  "tooltip",
  "tooltipdescription",
  "tooltiptitle",
]);
const TABLE_SOLUTION_COMPONENT_TYPE = 1;
const RIBBON_TRANSLATION_ACTION_PATH = "solutions/Microsoft.Dynamics.CRM.ExportTranslation";
const ribbonTranslationCache = new Map<string, Promise<Record<string, string>>>();

export async function fetchTableRibbonMetadata(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  options?: {
    location?: RibbonLocationFilter;
  },
): Promise<TableRibbonMetadata> {
  const table = await resolveTable(env, client, tableRef);
  const location = options?.location || "all";
  const response = await client.getPath<RetrieveEntityRibbonResponse>(
    env,
    buildRetrieveEntityRibbonPath(table.logicalName, location),
  );

  const compressedXml = String(response?.CompressedEntityXml || "");
  if (!compressedXml) {
    throw new Error(
      `Ribbon metadata for table '${table.logicalName}' is not available in '${env.name}'.`,
    );
  }

  const sourceXml = unzipRibbonXml(Buffer.from(compressedXml, "base64"));
  const normalizedSourceXml = normalizeXml(sourceXml);
  const tree = parseXmlTree(sourceXml);
  const locLabels = collectLocLabels(tree);
  const commandMap = collectCommandDefinitions(tree);
  const displayRuleMap = collectRuleDefinitions(tree, "display");
  const enableRuleMap = collectRuleDefinitions(tree, "enable");
  const buttons = collectButtons(tree, locLabels, commandMap)
    .filter((button) => matchesLocation(button, location))
    .sort(compareButtons);
  const ribbons = groupButtons(buttons);

  return {
    table,
    locationFilter: location,
    sourceXml,
    normalizedXml: normalizedSourceXml,
    xmlHash: createShortHash(normalizedSourceXml),
    ribbons,
    buttons,
    commands: [...commandMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    displayRules: [...displayRuleMap.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    enableRules: [...enableRuleMap.values()].sort((left, right) => left.id.localeCompare(right.id)),
    locLabels,
  };
}

export function resolveRibbonButton(
  metadata: TableRibbonMetadata,
  buttonRef: string,
): RibbonButtonDetails {
  const exactMatches = findExactButtonMatches(metadata.buttons, buttonRef);
  if (exactMatches.length === 1) {
    return hydrateButtonDetails(metadata, exactMatches[0]);
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Ribbon button '${buttonRef}' is ambiguous. Matches: ${exactMatches.map(formatButtonMatch).join(", ")}.`,
    );
  }

  const partialMatches = findPartialButtonMatches(metadata.buttons, buttonRef);
  if (partialMatches.length === 1) {
    return hydrateButtonDetails(metadata, partialMatches[0]);
  }

  if (partialMatches.length > 1) {
    throw new Error(
      `Ribbon button '${buttonRef}' is ambiguous. Matches: ${partialMatches.map(formatButtonMatch).join(", ")}.`,
    );
  }

  throw new Error(
    `Ribbon button '${buttonRef}' not found for table '${metadata.table.logicalName}' in '${metadata.locationFilter}' scope.`,
  );
}

export async function localizeRibbonButtonDetails(
  env: EnvironmentConfig,
  client: DynamicsClient,
  table: TableRecord,
  button: RibbonButtonDetails,
): Promise<RibbonButtonDetails> {
  const references = collectButtonLocLabelReferences(button);
  if (references.length === 0) {
    return button;
  }

  try {
    const candidateSolutions = await listCandidateTranslationSolutions(
      env,
      client,
      table.metadataId,
      buildRibbonSolutionSearchTokens(button),
    );
    if (candidateSolutions.length === 0) {
      return button;
    }

    const translations = await loadRibbonTranslationsForSolutions(
      env,
      client,
      candidateSolutions,
      references,
    );
    if (translations.size === 0) {
      return button;
    }

    const localizedLabel =
      resolveTranslatedLocLabel(button.labelText, translations) ||
      resolveTranslatedLocLabel(button.altText, translations) ||
      button.label;
    const localizedTooltipTitle =
      resolveTranslatedLocLabel(button.toolTipTitleText, translations) ||
      localizedLabel ||
      button.toolTipTitle;
    const localizedTooltipDescription =
      resolveTranslatedLocLabel(button.toolTipDescriptionText, translations) ||
      button.toolTipDescription;
    const localizedDescription =
      resolveTranslatedLocLabel(button.descriptionText, translations) || button.description;

    return {
      ...button,
      label: localizedLabel,
      toolTipTitle: localizedTooltipTitle,
      toolTipDescription: localizedTooltipDescription,
      description: localizedDescription,
    };
  } catch {
    return button;
  }
}

function hydrateButtonDetails(
  metadata: TableRibbonMetadata,
  button: RibbonButtonRecord,
): RibbonButtonDetails {
  const commandDefinition = button.commandDefinition;

  return {
    ...button,
    displayRules: (commandDefinition?.displayRuleIds || [])
      .map((ruleId) => metadata.displayRules.find((rule) => rule.id === ruleId) || null)
      .filter((rule): rule is RibbonRuleSummary => Boolean(rule)),
    enableRules: (commandDefinition?.enableRuleIds || [])
      .map((ruleId) => metadata.enableRules.find((rule) => rule.id === ruleId) || null)
      .filter((rule): rule is RibbonRuleSummary => Boolean(rule)),
  };
}

function collectButtons(
  tree: XmlNode,
  locLabels: Record<string, string>,
  commandMap: Map<string, RibbonCommandSummary>,
): RibbonButtonRecord[] {
  const buttons: RibbonButtonRecord[] = [];

  walkXmlTree(tree, (node) => {
    if (node.name !== "Button") {
      return;
    }

    const id = readAttr(node, "Id");
    const command = readAttr(node, "Command");
    const buttonLabelText = readAttr(node, "LabelText");
    const buttonAltText = readAttr(node, "Alt");
    const location = findNearestLocation(node) || extractRibbonId(id || command);
    const ribbonId = extractRibbonId(location || id || command);
    const ancestorIds = collectAncestorIds(node);
    const tabId =
      ancestorIds.find((value) =>
        /\.(MainTab|View|Related|Developer|ContextualTabs)\b/i.test(value),
      ) || ribbonId;
    const groupId =
      ancestorIds.find((value) => /\.Group\b/i.test(value)) ||
      ancestorIds.find((value) => value.includes(".Groups.")) ||
      "";
    const label =
      resolveRibbonText(buttonLabelText, locLabels, "label", id) ||
      resolveRibbonText(buttonAltText, locLabels, "alt", id) ||
      inferFriendlyRibbonName(id);
    const toolTipTitleText = readAttr(node, "ToolTipTitle");
    const toolTipDescriptionText = readAttr(node, "ToolTipDescription");
    const descriptionText = readAttr(node, "Description");
    const toolTipTitle =
      resolveRibbonText(toolTipTitleText, locLabels, "title", label || id) || label;

    buttons.push({
      altText: buttonAltText,
      id,
      labelText: buttonLabelText,
      label,
      toolTipTitleText,
      toolTipTitle,
      toolTipDescriptionText,
      toolTipDescription: resolveRibbonText(
        toolTipDescriptionText,
        locLabels,
        "description",
        label || id,
      ),
      descriptionText,
      description: resolveRibbonText(descriptionText, locLabels, "description", label),
      command,
      sequence: parseNumeric(readAttr(node, "Sequence")),
      templateAlias: readAttr(node, "TemplateAlias"),
      image16by16: readAttr(node, "Image16by16"),
      image32by32: readAttr(node, "Image32by32"),
      modernImage: readAttr(node, "ModernImage"),
      location,
      ribbonId,
      ribbonType: detectRibbonType(location || id || command),
      tabId,
      groupId,
      ancestorIds,
      commandDefinition: commandMap.get(command) || null,
    });
  });

  return uniqueButtons(buttons);
}

function collectLocLabels(tree: XmlNode): Record<string, string> {
  const labels = new Map<string, string>();

  walkXmlTree(tree, (node) => {
    if (node.name !== "LocLabel") {
      return;
    }

    const id = readAttr(node, "Id");
    if (!id || labels.has(id)) {
      return;
    }

    const titleNodes = node.children.filter((child) => child.name === "Titles");
    const titleCandidates = titleNodes.flatMap((titlesNode) =>
      titlesNode.children.filter((child) => child.name === "Title"),
    );
    const englishTitle =
      titleCandidates.find((child) => readAttr(child, "languagecode") === "1033") ||
      titleCandidates[0];
    const description = readAttr(englishTitle, "description");
    if (description) {
      labels.set(id, description);
    }
  });

  return Object.fromEntries(labels.entries());
}

function collectCommandDefinitions(tree: XmlNode): Map<string, RibbonCommandSummary> {
  const commandMap = new Map<string, RibbonCommandSummary>();

  walkXmlTree(tree, (node) => {
    if (node.name !== "CommandDefinition") {
      return;
    }

    const id = readAttr(node, "Id");
    if (!id) {
      return;
    }

    commandMap.set(id, {
      id,
      displayRuleIds: collectCommandRuleIds(node, "DisplayRules"),
      enableRuleIds: collectCommandRuleIds(node, "EnableRules"),
      actions: collectCommandActions(node),
    });
  });

  return commandMap;
}

function collectCommandRuleIds(
  node: XmlNode,
  containerName: "DisplayRules" | "EnableRules",
): string[] {
  const container = node.children.find((child) => child.name === containerName);
  if (!container) {
    return [];
  }

  const ids = container.children
    .map((child) => readAttr(child, "Id"))
    .filter((value): value is string => Boolean(value));

  return [...new Set(ids)];
}

function collectCommandActions(node: XmlNode): RibbonActionSummary[] {
  const actionsNode = node.children.find((child) => child.name === "Actions");
  if (!actionsNode) {
    return [];
  }

  return actionsNode.children
    .filter((child) => child.name !== "#text")
    .map((child) => ({
      type: child.name,
      attributes: { ...child.attrs },
    }));
}

function collectRuleDefinitions(
  tree: XmlNode,
  type: "display" | "enable",
): Map<string, RibbonRuleSummary> {
  const ruleMap = new Map<string, RibbonRuleSummary>();
  const ruleNodeName = type === "display" ? "DisplayRule" : "EnableRule";

  walkXmlTree(tree, (node) => {
    if (node.name !== ruleNodeName) {
      return;
    }

    if (!hasAncestor(node, "RuleDefinitions")) {
      return;
    }

    const id = readAttr(node, "Id");
    if (!id || ruleMap.has(id)) {
      return;
    }

    ruleMap.set(id, {
      id,
      type,
      steps: node.children
        .filter((child) => child.name !== "#text")
        .map((child) => ({
          type: child.name,
          attributes: { ...child.attrs },
        })),
    });
  });

  return ruleMap;
}

function groupButtons(buttons: RibbonButtonRecord[]): RibbonGroup[] {
  const ribbons = new Map<string, RibbonGroup>();

  for (const button of buttons) {
    const key = `${button.ribbonType}|${button.ribbonId}`;
    const existing = ribbons.get(key);
    if (existing) {
      existing.buttons.push(button);
      existing.buttonCount += 1;
      continue;
    }

    ribbons.set(key, {
      id: button.ribbonId,
      type: button.ribbonType,
      location: button.location || button.ribbonId,
      buttonCount: 1,
      buttons: [button],
    });
  }

  return [...ribbons.values()]
    .map((ribbon) => ({
      ...ribbon,
      buttons: [...ribbon.buttons].sort(compareButtons),
    }))
    .sort((left, right) => {
      return (
        compareRibbonType(left.type, right.type) ||
        left.id.localeCompare(right.id) ||
        left.location.localeCompare(right.location)
      );
    });
}

function matchesLocation(button: RibbonButtonRecord, location: RibbonLocationFilter): boolean {
  return location === "all" || button.ribbonType === location;
}

function findExactButtonMatches(
  buttons: RibbonButtonRecord[],
  buttonRef: string,
): RibbonButtonRecord[] {
  const needle = normalizeButtonMatchValue(buttonRef);

  return uniqueButtons(
    buttons.filter((button) =>
      getButtonSearchValues(button).some(
        (value) => value === buttonRef || normalizeButtonMatchValue(value) === needle,
      ),
    ),
  );
}

function findPartialButtonMatches(
  buttons: RibbonButtonRecord[],
  buttonRef: string,
): RibbonButtonRecord[] {
  const needle = normalizeButtonMatchValue(buttonRef);

  return uniqueButtons(
    buttons.filter((button) =>
      getButtonSearchValues(button).some((value) =>
        normalizeButtonMatchValue(value).includes(needle),
      ),
    ),
  );
}

function getButtonSearchValues(button: RibbonButtonRecord): string[] {
  return [
    button.id,
    button.label,
    button.labelText,
    button.command,
    button.toolTipTitle,
    button.toolTipDescription,
    button.location,
  ].filter(Boolean);
}

function uniqueButtons(buttons: RibbonButtonRecord[]): RibbonButtonRecord[] {
  const seen = new Set<string>();

  return buttons.filter((button) => {
    if (!button.id || seen.has(button.id)) {
      return false;
    }

    seen.add(button.id);
    return true;
  });
}

function compareButtons(left: RibbonButtonRecord, right: RibbonButtonRecord): number {
  return (
    compareRibbonType(left.ribbonType, right.ribbonType) ||
    left.ribbonId.localeCompare(right.ribbonId) ||
    compareNullableNumbers(left.sequence, right.sequence) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function compareRibbonType(
  left: RibbonButtonRecord["ribbonType"],
  right: RibbonButtonRecord["ribbonType"],
): number {
  return ribbonTypeRank(left) - ribbonTypeRank(right);
}

function ribbonTypeRank(value: RibbonButtonRecord["ribbonType"]): number {
  switch (value) {
    case "form":
      return 0;
    case "homepageGrid":
      return 1;
    case "subgrid":
      return 2;
    default:
      return 3;
  }
}

function compareNullableNumbers(left: number | null, right: number | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function collectButtonLocLabelReferences(button: RibbonButtonRecord): string[] {
  return [
    extractLocLabelReference(button.altText),
    extractLocLabelReference(button.labelText),
    extractLocLabelReference(button.toolTipTitleText),
    extractLocLabelReference(button.toolTipDescriptionText),
    extractLocLabelReference(button.descriptionText),
  ].filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index,
  );
}

function extractLocLabelReference(value: string): string {
  const match = value.match(/^\$LocLabels:(.+)$/i);
  return (match?.[1] || "").trim();
}

function resolveTranslatedLocLabel(
  value: string,
  translations: ReadonlyMap<string, string>,
): string {
  const reference = extractLocLabelReference(value);
  if (!reference) {
    return "";
  }

  return translations.get(reference) || "";
}

async function listCandidateTranslationSolutions(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableMetadataId: string,
  searchTokens: string[],
): Promise<CandidateSolution[]> {
  const components = await client.query<Record<string, unknown>>(
    env,
    "solutioncomponents",
    listSolutionComponentsByObjectIdsQuery(TABLE_SOLUTION_COMPONENT_TYPE, [tableMetadataId]),
  );
  const solutionIds = [
    ...new Set(components.map((row) => String(row._solutionid_value || "")).filter(Boolean)),
  ];
  if (solutionIds.length === 0) {
    return [];
  }

  const solutions = await client.query<Record<string, unknown>>(
    env,
    "solutions",
    listSolutionsQuery(),
  );
  return solutions
    .map((solution) => ({
      solutionid: String(solution.solutionid || ""),
      uniquename: String(solution.uniquename || ""),
      friendlyname: String(solution.friendlyname || ""),
      ismanaged: Boolean(solution.ismanaged),
    }))
    .filter((solution) => solutionIds.includes(solution.solutionid) && solution.uniquename)
    .sort((left, right) => {
      return (
        rankRibbonTranslationSolution(right, searchTokens) -
          rankRibbonTranslationSolution(left, searchTokens) ||
        Number(left.ismanaged) - Number(right.ismanaged) ||
        left.uniquename.localeCompare(right.uniquename)
      );
    });
}

async function loadRibbonTranslationsForSolutions(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutions: CandidateSolution[],
  targetKeys: string[],
): Promise<Map<string, string>> {
  const translations = new Map<string, string>();
  const pendingKeys = new Set(targetKeys);

  for (const solution of solutions) {
    if (pendingKeys.size === 0) {
      break;
    }

    try {
      const solutionTranslations = await loadRibbonTranslationsForSolution(
        env,
        client,
        solution.uniquename,
      );
      for (const [key, value] of Object.entries(solutionTranslations)) {
        if (pendingKeys.has(key) && value && !translations.has(key)) {
          translations.set(key, value);
          pendingKeys.delete(key);
        }
      }
    } catch {
      continue;
    }
  }

  return translations;
}

async function loadRibbonTranslationsForSolution(
  env: EnvironmentConfig,
  client: DynamicsClient,
  solutionUniqueName: string,
): Promise<Record<string, string>> {
  const cacheKey = `${env.name}|${solutionUniqueName}`;
  const cached = ribbonTranslationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const response = await client.invokeAction<ExportTranslationResponse>(
      env,
      RIBBON_TRANSLATION_ACTION_PATH,
      {
        SolutionName: solutionUniqueName,
      },
      { timeout: 120_000 },
    );
    const zipData = Buffer.from(String(response.ExportTranslationFile || ""), "base64");
    const xml = readZipEntry(zipData, "CrmTranslations.xml");
    return parseRibbonTranslationsWorkbook(xml);
  })().catch((error) => {
    ribbonTranslationCache.delete(cacheKey);
    throw error;
  });

  ribbonTranslationCache.set(cacheKey, pending);
  return pending;
}

function parseRibbonTranslationsWorkbook(xml: string): Record<string, string> {
  const translations: Record<string, string> = {};

  for (const row of xml.matchAll(/<Row\b[\s\S]*?<\/Row>/g)) {
    const cells = [...String(row[0] || "").matchAll(/<Data\b[^>]*>([\s\S]*?)<\/Data>/g)].map(
      (match) => decodeXmlText(match[1] || "").trim(),
    );
    if (cells.length < 4 || cells[0] !== "RibbonCustomization") {
      continue;
    }

    const key = cells[2] || "";
    const value = cells[3] || "";
    if (key && value) {
      translations[key] = value;
    }
  }

  return translations;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/gu, (_match, digits) => String.fromCodePoint(Number.parseInt(digits, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildRibbonSolutionSearchTokens(button: RibbonButtonRecord): string[] {
  return [
    button.id,
    button.command,
    button.altText,
    button.labelText,
    button.toolTipTitleText,
    button.toolTipDescriptionText,
  ]
    .flatMap(extractSearchTokens)
    .filter((value, index, values) => value.length >= 4 && values.indexOf(value) === index);
}

function extractSearchTokens(value: string): string[] {
  return String(value || "")
    .replace(/^\$(LocLabels|Resources):/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/u)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function rankRibbonTranslationSolution(
  solution: CandidateSolution,
  searchTokens: string[],
): number {
  const haystack = `${solution.uniquename} ${solution.friendlyname}`.toLowerCase();
  let score = 0;

  for (const token of searchTokens) {
    if (!token) {
      continue;
    }

    if (haystack.includes(token)) {
      score += token.length >= 8 ? 10 : 4;
    }
  }

  if (/^(active|default|cr[0-9a-f]+)/i.test(solution.uniquename)) {
    score -= 20;
  }

  return score;
}

function formatButtonMatch(button: RibbonButtonRecord): string {
  return `${button.ribbonType}/${button.label || button.id}`;
}

function normalizeButtonMatchValue(value: string | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveRibbonText(
  value: string,
  locLabels: Record<string, string>,
  kind: RibbonTextKind = "generic",
  fallbackSource = "",
): string {
  if (!value) {
    return "";
  }

  const locLabelMatch = value.match(/^\$LocLabels:(.+)$/i);
  if (locLabelMatch) {
    const reference = (locLabelMatch[1] || "").trim();
    return locLabels[reference] || inferRibbonReferenceText(reference, kind, fallbackSource);
  }

  const resourceMatch = value.match(/^\$Resources:(.+)$/i);
  if (resourceMatch) {
    return inferRibbonReferenceText((resourceMatch[1] || "").trim(), kind, fallbackSource);
  }

  return value;
}

function inferRibbonReferenceText(
  reference: string,
  kind: RibbonTextKind,
  fallbackSource: string,
): string {
  if (kind === "description") {
    return "";
  }

  return inferFriendlyRibbonName(reference) || inferFriendlyRibbonName(fallbackSource);
}

function inferFriendlyRibbonName(value: string): string {
  const cleaned = String(value || "")
    .trim()
    .replace(/^\$(LocLabels|Resources):/i, "");
  if (!cleaned) {
    return "";
  }

  const parts = cleaned
    .split(/[./:_-]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const meaningfulPart = [...parts]
    .reverse()
    .find((part) => !GENERIC_RIBBON_NAME_PARTS.has(part.toLowerCase()) && !/^\d+$/u.test(part));

  if (!meaningfulPart) {
    return "";
  }

  return meaningfulPart
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((part) =>
      /^[A-Z0-9]+$/u.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

function detectRibbonType(value: string): RibbonButtonRecord["ribbonType"] {
  if (/\.Form\./i.test(value)) {
    return "form";
  }

  if (/\.HomepageGrid\./i.test(value)) {
    return "homepageGrid";
  }

  if (/\.SubGrid\./i.test(value)) {
    return "subgrid";
  }

  return "other";
}

function extractRibbonId(value: string): string {
  const parts = value
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts[0] === "Mscrm" && ["Form", "HomepageGrid", "SubGrid"].includes(parts[1] || "")) {
    return parts.slice(0, Math.min(parts.length, 4)).join(".");
  }

  if (parts[0] === "Mscrm") {
    return parts.slice(0, Math.min(parts.length, 2)).join(".");
  }

  return value;
}

function findNearestLocation(node: XmlNode): string {
  let current = node.parent;
  while (current) {
    const location = readAttr(current, "Location");
    if (location) {
      return location;
    }
    current = current.parent;
  }

  return "";
}

function collectAncestorIds(node: XmlNode): string[] {
  const ids: string[] = [];
  let current = node.parent;

  while (current) {
    const id = readAttr(current, "Id");
    if (id) {
      ids.push(id);
    }
    current = current.parent;
  }

  return ids;
}

function parseNumeric(value: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readAttr(node: XmlNode | undefined, name: string): string {
  if (!node) {
    return "";
  }

  return node.attrs[name] || node.attrs[name.toLowerCase()] || "";
}

function walkXmlTree(node: XmlNode, visitor: (node: XmlNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    walkXmlTree(child, visitor);
  }
}

function hasAncestor(node: XmlNode, ancestorName: string): boolean {
  let current = node.parent;

  while (current) {
    if (current.name === ancestorName) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function parseXmlTree(xml: string): XmlNode {
  const root: XmlNode = {
    name: "#document",
    attrs: {},
    children: [],
  };
  const stack: XmlNode[] = [root];
  let index = 0;

  while (index < xml.length) {
    const nextTagStart = xml.indexOf("<", index);
    if (nextTagStart === -1) {
      break;
    }

    if (xml.startsWith("<!--", nextTagStart)) {
      const commentEnd = xml.indexOf("-->", nextTagStart + 4);
      index = commentEnd === -1 ? xml.length : commentEnd + 3;
      continue;
    }

    if (xml.startsWith("<?", nextTagStart)) {
      const instructionEnd = xml.indexOf("?>", nextTagStart + 2);
      index = instructionEnd === -1 ? xml.length : instructionEnd + 2;
      continue;
    }

    if (xml.startsWith("<![CDATA[", nextTagStart)) {
      const cdataEnd = xml.indexOf("]]>", nextTagStart + 9);
      index = cdataEnd === -1 ? xml.length : cdataEnd + 3;
      continue;
    }

    if (xml.startsWith("</", nextTagStart)) {
      const closeEnd = xml.indexOf(">", nextTagStart + 2);
      if (closeEnd === -1) {
        break;
      }

      const closingName = stripNamespace(
        xml
          .slice(nextTagStart + 2, closeEnd)
          .trim()
          .replace(/\s.*/u, ""),
      );

      while (stack.length > 1) {
        const candidate = stack.pop();
        if (candidate?.name === closingName) {
          break;
        }
      }

      index = closeEnd + 1;
      continue;
    }

    const tagEnd = findTagEnd(xml, nextTagStart + 1);
    if (tagEnd === -1) {
      break;
    }

    let tagContent = xml.slice(nextTagStart + 1, tagEnd).trim();
    const selfClosing = tagContent.endsWith("/");
    if (selfClosing) {
      tagContent = tagContent.slice(0, -1).trim();
    }

    const firstSpaceIndex = tagContent.search(/\s/u);
    const rawName = firstSpaceIndex === -1 ? tagContent : tagContent.slice(0, firstSpaceIndex);
    const attrChunk = firstSpaceIndex === -1 ? "" : tagContent.slice(firstSpaceIndex + 1);
    const node: XmlNode = {
      name: stripNamespace(rawName),
      attrs: parseAttributes(attrChunk),
      children: [],
      parent: stack[stack.length - 1],
    };

    stack[stack.length - 1]?.children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }

    index = tagEnd + 1;
  }

  return root;
}

function stripNamespace(value: string): string {
  return value.includes(":") ? value.split(":").pop() || value : value;
}

function parseAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Za-z_][\w:.-]*)\s*=\s*(['"])(.*?)\2/gs;

  for (const match of value.matchAll(regex)) {
    const key = stripNamespace(match[1] || "");
    const attributeValue = match[3] || "";
    attrs[key] = attributeValue;
    attrs[key.toLowerCase()] = attributeValue;
  }

  return attrs;
}

function findTagEnd(xml: string, startIndex: number): number {
  let quote: '"' | "'" | null = null;

  for (let index = startIndex; index < xml.length; index += 1) {
    const char = xml[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === ">") {
      return index;
    }
  }

  return -1;
}

function unzipRibbonXml(data: Buffer): string {
  return readZipEntry(data, "RibbonXml.xml");
}

function readZipEntry(data: Buffer, fileNameSuffix: string): string {
  let offset = 0;

  while (offset + 30 <= data.length) {
    const signature = data.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) {
      break;
    }

    if (signature !== 0x04034b50) {
      throw new Error("Unsupported ribbon ZIP package format.");
    }

    const flags = data.readUInt16LE(offset + 6);
    const compressionMethod = data.readUInt16LE(offset + 8);
    const compressedSize = data.readUInt32LE(offset + 18);
    const fileNameLength = data.readUInt16LE(offset + 26);
    const extraFieldLength = data.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const fileName = data.toString("utf8", fileNameStart, fileNameEnd).replace(/^\/+/, "");
    const fileDataStart = fileNameEnd + extraFieldLength;
    const fileDataEnd = fileDataStart + compressedSize;

    if ((flags & 0x08) !== 0) {
      throw new Error("Ribbon ZIP entries with data descriptors are not supported.");
    }

    if (fileName.endsWith(fileNameSuffix)) {
      const compressedData = data.subarray(fileDataStart, fileDataEnd);
      if (compressionMethod === 0) {
        return compressedData.toString("utf8");
      }

      if (compressionMethod === 8) {
        return inflateRawSync(compressedData).toString("utf8");
      }

      throw new Error(`Unsupported ribbon ZIP compression method '${compressionMethod}'.`);
    }

    offset = fileDataEnd;
  }

  throw new Error(`${fileNameSuffix} was not found in the retrieved package.`);
}

function createShortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
