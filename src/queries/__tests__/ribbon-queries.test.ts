import { describe, expect, it } from "vitest";
import { buildRetrieveEntityRibbonPath } from "../ribbon-queries.js";

describe("ribbon queries", () => {
  it("builds the retrieve entity ribbon path", () => {
    expect(buildRetrieveEntityRibbonPath("account")).toBe(
      "RetrieveEntityRibbon(EntityName='account',RibbonLocationFilter=Microsoft.Dynamics.CRM.RibbonLocationFilters'All')",
    );
  });

  it("escapes entity names and maps the location enum", () => {
    expect(buildRetrieveEntityRibbonPath("team's table", "homepageGrid")).toBe(
      "RetrieveEntityRibbon(EntityName='team''s table',RibbonLocationFilter=Microsoft.Dynamics.CRM.RibbonLocationFilters'HomepageGrid')",
    );
  });
});
