import { describe, expect, it } from "vitest";
import {
  getWorkflowDetailsQuery,
  getWorkflowDetailsByIdentityQuery,
  listActionsQuery,
  listWorkflowDefinitionSearchQuery,
  listWorkflowsByIdsQuery,
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

  it("builds the workflow definition search query", () => {
    const query = listWorkflowDefinitionSearchQuery({
      category: "workflow",
      status: "activated",
    });

    expect(query).toContain("$filter=type eq 1 and category eq 0 and statecode eq 1");
    expect(query).toContain("$select=workflowid,name,uniquename,category,statecode,statuscode");
    expect(query).toContain("xaml");
    expect(query).toContain("clientdata");
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
    expect(query).not.toContain("workflowid eq");
    expect(query).toContain("triggeronupdateattributelist");
  });

  it("builds the workflow details query by workflow id", () => {
    const query = getWorkflowDetailsByIdentityQuery({
      uniqueName: "{11111111-AAAA-bbbb-CCCC-111111111111}",
    });

    expect(query).toContain(
      "$filter=(uniquename eq '{11111111-AAAA-bbbb-CCCC-111111111111}' or workflowid eq 11111111-aaaa-bbbb-cccc-111111111111) and type eq 1",
    );
    expect(query).toContain("triggeronupdateattributelist");
  });

  it("builds workflow id list filters with GUID literals", () => {
    const query = listWorkflowsByIdsQuery([
      "11111111-1111-1111-1111-111111111111",
      "{22222222-2222-2222-2222-222222222222}",
    ]);

    expect(query).toContain(
      "$filter=workflowid eq 11111111-1111-1111-1111-111111111111 or workflowid eq 22222222-2222-2222-2222-222222222222",
    );
  });
});
