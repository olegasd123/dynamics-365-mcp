import { query } from "../utils/odata-builder.js";

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
  return `RetrieveDependentComponents(ObjectId=${toGuidParameter(solutionComponentId)},ComponentType=${componentType})`;
}

export function retrieveRequiredComponentsPath(
  solutionComponentId: string,
  componentType: number,
): string {
  return `RetrieveRequiredComponents(ObjectId=${toGuidParameter(solutionComponentId)},ComponentType=${componentType})`;
}

export function dependencySelectQuery(): string {
  return query().select(DEFAULT_DEPENDENCY_SELECT).toString();
}

function toGuidParameter(value: string): string {
  return value;
}
