import { describe, expect, it } from "vitest";
import {
  getWorkflowDetailsQuery,
  getWorkflowDetailsByIdentityQuery,
  listActionsQuery,
  listWorkflowsQuery,
} from "../workflow-queries.js";

describe("workflow queries", () => {
  it("builds the workflows query with category and status filters", () => {
    const query = listWorkflowsQuery({
      category: "action",
      status: "activated",
    });

    expect(query).toContain("$filter=type eq 1 and category eq 3 and statecode eq 1");
    expect(query).toContain("$orderby=name asc");
    expect(query).toContain("triggeroncreate");
  });

  it("builds the actions query", () => {
    const query = listActionsQuery();

    expect(query).toContain("$filter=type eq 1 and category eq 3");
    expect(query).toContain("$select=workflowid,name,uniquename,category,statecode,statuscode");
    expect(query).toContain("triggeroncreate");
  });

  it("builds the workflow details query", () => {
    const query = getWorkflowDetailsQuery();

    expect(query).toContain("$select=workflowid,name,uniquename,category,statecode,statuscode");
    expect(query).toContain("triggeronupdateattributelist");
    expect(query).toContain("inputparameters");
  });

  it("builds the workflow details query by unique name", () => {
    const query = getWorkflowDetailsByIdentityQuery({ uniqueName: "contoso_O'Hara" });

    expect(query).toContain("$filter=uniquename eq 'contoso_O''Hara' and type eq 1");
    expect(query).toContain("triggeronupdateattributelist");
  });
});
