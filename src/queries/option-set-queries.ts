import { query } from "../utils/odata-builder.js";

const GLOBAL_OPTION_SET_LIST_SELECT = [
  "MetadataId",
  "Name",
  "DisplayName",
  "Description",
  "OptionSetType",
  "IsGlobal",
  "IsManaged",
  "IsCustomOptionSet",
  "ParentOptionSetName",
  "Options",
] as const;

export function globalOptionSetDefinitionsPath(): string {
  return "GlobalOptionSetDefinitions";
}

export function globalOptionSetDefinitionPath(metadataId: string): string {
  return `GlobalOptionSetDefinitions(${metadataId})`;
}

export function listGlobalOptionSetsQuery(): string {
  return query().select(GLOBAL_OPTION_SET_LIST_SELECT).orderby("Name asc").toString();
}
