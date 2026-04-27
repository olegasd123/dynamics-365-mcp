import { and, contains, eq, guidEq, guidInList, or, query } from "../utils/odata-builder.js";

const DEFAULT_SOLUTION_SELECT = [
  "solutionid",
  "friendlyname",
  "uniquename",
  "version",
  "ismanaged",
  "publisherid",
  "modifiedon",
];

export function listSolutionsQuery(nameFilter?: string): string {
  return query()
    .select(DEFAULT_SOLUTION_SELECT)
    .filter(
      nameFilter
        ? or(contains("friendlyname", nameFilter), contains("uniquename", nameFilter))
        : undefined,
    )
    .orderby("friendlyname asc")
    .toString();
}

export function listSolutionsByPublisherQuery(publisherId: string): string {
  return query()
    .select(DEFAULT_SOLUTION_SELECT)
    .filter(guidEq("_publisherid_value", publisherId))
    .orderby("friendlyname asc")
    .toString();
}

export function listSolutionsByIdsQuery(solutionIds: string[]): string {
  return query()
    .select(DEFAULT_SOLUTION_SELECT)
    .filter(guidInList("solutionid", solutionIds))
    .orderby("friendlyname asc")
    .toString();
}

export function listSolutionComponentsQuery(solutionId: string): string {
  return query()
    .select([
      "solutioncomponentid",
      "_solutionid_value",
      "objectid",
      "componenttype",
      "rootsolutioncomponentid",
      "rootcomponentbehavior",
    ])
    .filter(guidEq("_solutionid_value", solutionId))
    .orderby("componenttype asc")
    .toString();
}

export function listSolutionComponentsByObjectIdsQuery(
  componentType: number,
  objectIds: string[],
): string {
  return query()
    .select([
      "solutioncomponentid",
      "_solutionid_value",
      "objectid",
      "componenttype",
      "rootsolutioncomponentid",
      "rootcomponentbehavior",
    ])
    .filter(and(eq("componenttype", componentType), guidInList("objectid", objectIds)))
    .orderby("solutioncomponentid asc")
    .toString();
}
