import { describe, expect, it } from "vitest";
import { listSolutionComponentLayersQuery } from "../solution-layer-queries.js";

describe("solution layer queries", () => {
  it("builds the solution component layers query", () => {
    const componentId = "11111111-1111-1111-1111-111111111111";
    const query = listSolutionComponentLayersQuery(componentId, ["WebResource", "Web Resource"]);

    expect(query).toContain(
      "$select=msdyn_componentlayerid,msdyn_name,msdyn_componentid,msdyn_solutioncomponentname,msdyn_solutionname,msdyn_publishername,msdyn_order,msdyn_overwritetime,msdyn_changes",
    );
    expect(query).toContain(`msdyn_componentid eq ${componentId}`);
    expect(query).toContain("msdyn_solutioncomponentname eq 'WebResource'");
    expect(query).toContain("msdyn_solutioncomponentname eq 'Web Resource'");
    expect(query).toContain("$orderby=msdyn_order desc");
  });
});
