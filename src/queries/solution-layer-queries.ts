import { and, eq, inList, query } from "../utils/odata-builder.js";

const DEFAULT_COMPONENT_LAYER_SELECT = [
  "msdyn_componentlayerid",
  "msdyn_name",
  "msdyn_componentid",
  "msdyn_solutioncomponentname",
  "msdyn_solutionname",
  "msdyn_publishername",
  "msdyn_order",
  "msdyn_overwritetime",
  "msdyn_changes",
];

export function listSolutionComponentLayersQuery(
  componentId: string,
  componentTypeNames: string[],
): string {
  return query()
    .select(DEFAULT_COMPONENT_LAYER_SELECT)
    .filter(
      and(
        eq("msdyn_componentid", componentId),
        inList("msdyn_solutioncomponentname", componentTypeNames),
      ),
    )
    .orderby("msdyn_order desc")
    .toString();
}
