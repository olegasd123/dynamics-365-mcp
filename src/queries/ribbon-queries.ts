import { escapeODataString } from "../utils/odata-builder.js";

export const RIBBON_LOCATION_FILTERS = ["form", "homepageGrid", "subgrid", "all"] as const;

export type RibbonLocationFilter = (typeof RIBBON_LOCATION_FILTERS)[number];

const RIBBON_LOCATION_ENUM: Record<RibbonLocationFilter, string> = {
  form: "Form",
  homepageGrid: "HomepageGrid",
  subgrid: "SubGrid",
  all: "All",
};

export function buildRetrieveEntityRibbonPath(
  entityName: string,
  location: RibbonLocationFilter = "all",
): string {
  const escapedEntityName = escapeODataString(entityName);
  const enumValue = RIBBON_LOCATION_ENUM[location];

  return `RetrieveEntityRibbon(EntityName='${escapedEntityName}',RibbonLocationFilter=Microsoft.Dynamics.CRM.RibbonLocationFilters'${enumValue}')`;
}
