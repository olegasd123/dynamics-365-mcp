import { buildQueryString, odataStringLiteral } from "../utils/odata-helpers.js";

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
  const filter = nameFilter
    ? `(contains(friendlyname,${odataStringLiteral(nameFilter)}) or contains(uniquename,${odataStringLiteral(nameFilter)}))`
    : undefined;

  return buildQueryString({
    select: DEFAULT_SOLUTION_SELECT,
    filter,
    orderby: "friendlyname asc",
  });
}

export function listSolutionComponentsQuery(solutionId: string): string {
  return buildQueryString({
    select: [
      "solutioncomponentid",
      "objectid",
      "componenttype",
      "rootsolutioncomponentid",
      "rootcomponentbehavior",
    ],
    filter: `_solutionid_value eq ${odataStringLiteral(solutionId)}`,
    orderby: "componenttype asc",
  });
}
