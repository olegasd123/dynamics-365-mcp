import { describe, expect, it } from "vitest";
import { listSolutionComponentsQuery, listSolutionsQuery } from "../solution-queries.js";

describe("solution queries", () => {
  it("builds the solutions query", () => {
    const query = listSolutionsQuery();

    expect(query).toContain("$select=solutionid,friendlyname,uniquename,version,ismanaged,publisherid,modifiedon");
    expect(query).toContain("$orderby=friendlyname asc");
  });

  it("adds a filter for display name or unique name", () => {
    const query = listSolutionsQuery("Core");

    expect(query).toContain("contains(friendlyname,'Core')");
    expect(query).toContain("contains(uniquename,'Core')");
  });

  it("builds the solution components query", () => {
    const query = listSolutionComponentsQuery("sol-1");

    expect(query).toContain("$select=solutioncomponentid,objectid,componenttype,rootsolutioncomponentid,rootcomponentbehavior");
    expect(query).toContain("$filter=_solutionid_value eq 'sol-1'");
  });
});
