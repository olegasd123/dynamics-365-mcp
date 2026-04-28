import { describe, expect, it } from "vitest";
import {
  listSolutionComponentsByObjectIdsQuery,
  listSolutionComponentsQuery,
  listSolutionsByIdsQuery,
  listSolutionsByPublisherQuery,
  listSolutionsQuery,
} from "../solution-queries.js";

describe("solution queries", () => {
  const publisherId = "11111111-1111-1111-1111-111111111111";
  const solutionId1 = "22222222-2222-2222-2222-222222222222";
  const solutionId2 = "33333333-3333-3333-3333-333333333333";
  const objectId1 = "44444444-4444-4444-4444-444444444444";
  const objectId2 = "55555555-5555-5555-5555-555555555555";

  it("builds the solutions query", () => {
    const query = listSolutionsQuery();

    expect(query).toContain(
      "$select=solutionid,friendlyname,uniquename,version,ismanaged,publisherid,modifiedon",
    );
    expect(query).toContain("$orderby=friendlyname asc");
  });

  it("adds a filter for display name or unique name", () => {
    const query = listSolutionsQuery("Core");

    expect(query).toContain("contains(friendlyname,'Core')");
    expect(query).toContain("contains(uniquename,'Core')");
  });

  it("builds the solutions-by-publisher query", () => {
    const query = listSolutionsByPublisherQuery(publisherId);

    expect(query).toContain(
      "$select=solutionid,friendlyname,uniquename,version,ismanaged,publisherid,modifiedon",
    );
    expect(query).toContain(`$filter=_publisherid_value eq ${publisherId}`);
  });

  it("builds the solutions-by-ids query", () => {
    const query = listSolutionsByIdsQuery([solutionId1, solutionId2]);

    expect(query).toContain(`solutionid eq ${solutionId1}`);
    expect(query).toContain(`solutionid eq ${solutionId2}`);
  });

  it("builds the solution components query", () => {
    const query = listSolutionComponentsQuery(solutionId1);

    expect(query).toContain(
      "$select=solutioncomponentid,_solutionid_value,objectid,componenttype,rootsolutioncomponentid,rootcomponentbehavior",
    );
    expect(query).toContain(`$filter=_solutionid_value eq ${solutionId1}`);
  });

  it("builds the object-based solution component query", () => {
    const query = listSolutionComponentsByObjectIdsQuery(91, [objectId1, objectId2]);

    expect(query).toContain("componenttype eq 91");
    expect(query).toContain(`objectid eq ${objectId1}`);
    expect(query).toContain(`objectid eq ${objectId2}`);
  });
});
