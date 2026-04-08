import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";
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
  const filters: string[] = ["type eq 1", "category eq 5"];

  if (options?.status) {
    filters.push(`statecode eq ${WORKFLOW_STATE[options.status]}`);
  }
  if (options?.nameFilter) {
    filters.push(
      `(${odataContains("name", options.nameFilter)} or ${odataContains("uniquename", options.nameFilter)})`,
    );
  }

  return buildQueryString({
    select: FLOW_SELECT,
    filter: filters.join(" and "),
    orderby: "name asc",
  });
}

export function getCloudFlowDetailsByIdentityQuery(options: {
  flowName?: string;
  uniqueName?: string;
}): string {
  const identityFilter = options.uniqueName
    ? odataEq("uniquename", options.uniqueName)
    : odataEq("name", options.flowName as string);

  return buildQueryString({
    select: FLOW_SELECT,
    filter: `${identityFilter} and type eq 1 and category eq 5`,
  });
}
