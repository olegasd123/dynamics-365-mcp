import { describe, expect, it } from "vitest";
import {
  dependencySelectQuery,
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../dependency-queries.js";

describe("dependency queries", () => {
  it("builds the retrieve dependent components path", () => {
    expect(retrieveDependentComponentsPath("sc-1", 91)).toBe(
      "RetrieveDependentComponents(ObjectId=guid'sc-1',ComponentType=91)",
    );
  });

  it("builds the retrieve required components path", () => {
    expect(retrieveRequiredComponentsPath("sc-1", 29)).toBe(
      "RetrieveRequiredComponents(ObjectId=guid'sc-1',ComponentType=29)",
    );
  });

  it("builds the dependency select query", () => {
    const query = dependencySelectQuery();

    expect(query).toContain(
      "$select=dependencyid,dependencytype,requiredcomponentobjectid,requiredcomponenttype,requiredcomponentparentid,dependentcomponentobjectid,dependentcomponenttype,dependentcomponentparentid",
    );
  });
});
