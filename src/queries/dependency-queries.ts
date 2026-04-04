import { buildQueryString } from "../utils/odata-helpers.js";

const DEFAULT_DEPENDENCY_SELECT = [
  "dependencyid",
  "dependencytype",
  "requiredcomponentobjectid",
  "requiredcomponenttype",
  "requiredcomponentparentid",
  "dependentcomponentobjectid",
  "dependentcomponenttype",
  "dependentcomponentparentid",
];

export function retrieveDependentComponentsPath(
  solutionComponentId: string,
  componentType: number,
): string {
  return `RetrieveDependentComponents(ObjectId=${toGuidLiteral(solutionComponentId)},ComponentType=${componentType})`;
}

export function retrieveRequiredComponentsPath(
  solutionComponentId: string,
  componentType: number,
): string {
  return `RetrieveRequiredComponents(ObjectId=${toGuidLiteral(solutionComponentId)},ComponentType=${componentType})`;
}

export function dependencySelectQuery(): string {
  return buildQueryString({
    select: DEFAULT_DEPENDENCY_SELECT,
  });
}

function toGuidLiteral(value: string): string {
  return `guid'${value}'`;
}
