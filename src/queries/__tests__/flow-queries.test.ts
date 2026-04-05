import { describe, expect, it } from "vitest";
import {
  getCloudFlowDetailsByIdentityQuery,
  listCloudFlowsQuery,
} from "../flow-queries.js";

describe("flow queries", () => {
  it("builds the cloud flow list query", () => {
    const query = listCloudFlowsQuery({ status: "activated", nameFilter: "Account" });

    expect(query).toContain("$filter=type eq 1 and category eq 5 and statecode eq 1");
    expect(query).toContain("contains(name,'Account')");
    expect(query).toContain("workflowidunique");
  });

  it("builds the cloud flow identity query", () => {
    const query = getCloudFlowDetailsByIdentityQuery({ uniqueName: "contoso_Flow" });

    expect(query).toContain("$filter=uniquename eq 'contoso_Flow' and type eq 1 and category eq 5");
    expect(query).toContain("connectionreferences");
  });
});
