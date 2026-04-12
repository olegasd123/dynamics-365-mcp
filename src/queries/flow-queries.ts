import { and, contains, eq, or, query } from "../utils/odata-helpers.js";
import type { WorkflowState } from "./workflow-queries.js";
import { WORKFLOW_STATE } from "./workflow-queries.js";

const FLOW_SELECT = [
  "workflowid",
  "workflowidunique",
  "name",
  "uniquename",
  "category",
  "statecode",
  "statuscode",
  "type",
  "primaryentity",
  "description",
  "ismanaged",
  "clientdata",
  "connectionreferences",
  "createdon",
  "modifiedon",
  "_createdby_value",
  "_modifiedby_value",
  "_ownerid_value",
];

export function listCloudFlowsQuery(options?: {
  status?: WorkflowState;
  nameFilter?: string;
}): string {
  return query()
    .select(FLOW_SELECT)
    .filter(
      and(
        eq("type", 1),
        eq("category", 5),
        options?.status ? eq("statecode", WORKFLOW_STATE[options.status]) : undefined,
        options?.nameFilter
          ? or(contains("name", options.nameFilter), contains("uniquename", options.nameFilter))
          : undefined,
      ),
    )
    .orderby("name asc")
    .toString();
}

export function getCloudFlowDetailsByIdentityQuery(options: {
  flowName?: string;
  uniqueName?: string;
}): string {
  return query()
    .select(FLOW_SELECT)
    .filter(
      and(
        options.uniqueName
          ? eq("uniquename", options.uniqueName)
          : eq("name", options.flowName as string),
        eq("type", 1),
        eq("category", 5),
      ),
    )
    .toString();
}
