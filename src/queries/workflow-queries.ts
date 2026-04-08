import { buildQueryString, odataEq } from "../utils/odata-helpers.js";

function buildOrFilter(field: string, values: string[]): string {
  return values.map((value) => odataEq(field, value)).join(" or ");
}

const WORKFLOW_CATEGORY = {
  workflow: 0,
  dialog: 1,
  businessrule: 2,
  action: 3,
  bpf: 4,
  modernflow: 5,
} as const;

export type WorkflowCategory = keyof typeof WORKFLOW_CATEGORY;

const WORKFLOW_STATE = {
  draft: 0,
  activated: 1,
  suspended: 2,
} as const;

export type WorkflowState = keyof typeof WORKFLOW_STATE;

export function listWorkflowsQuery(options?: {
  category?: WorkflowCategory;
  status?: WorkflowState;
}): string {
  const filters: string[] = ["type eq 1"]; // Definition only (exclude activations)

  if (options?.category !== undefined) {
    filters.push(`category eq ${WORKFLOW_CATEGORY[options.category]}`);
  }
  if (options?.status !== undefined) {
    filters.push(`statecode eq ${WORKFLOW_STATE[options.status]}`);
  }

  return buildQueryString({
    select: [
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "mode",
      "primaryentity",
      "ismanaged",
      "description",
      "triggeroncreate",
      "triggeronupdateattributelist",
      "createdon",
      "modifiedon",
    ],
    filter: filters.join(" and "),
    orderby: "name asc",
  });
}

export function listActionsQuery(): string {
  return buildQueryString({
    select: [
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "primaryentity",
      "ismanaged",
      "description",
      "triggeroncreate",
      "triggeronupdateattributelist",
      "createdon",
      "modifiedon",
    ],
    filter: "type eq 1 and category eq 3",
    orderby: "name asc",
  });
}

export function listWorkflowsByIdsQuery(workflowIds: string[]): string {
  return buildQueryString({
    select: [
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "mode",
      "primaryentity",
      "ismanaged",
      "description",
      "createdon",
      "modifiedon",
    ],
    filter: buildOrFilter("workflowid", workflowIds),
    orderby: "name asc",
  });
}

export function getWorkflowDetailsQuery(): string {
  return buildQueryString({
    select: [
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "mode",
      "scope",
      "primaryentity",
      "ismanaged",
      "description",
      "xaml",
      "clientdata",
      "triggeroncreate",
      "triggerondelete",
      "triggeronupdateattributelist",
      "inputparameters",
      "createdon",
      "modifiedon",
    ],
  });
}

export function getWorkflowDetailsByIdentityQuery(options: {
  workflowName?: string;
  uniqueName?: string;
}): string {
  const filter = options.uniqueName
    ? `${odataEq("uniquename", options.uniqueName)} and type eq 1`
    : `${odataEq("name", options.workflowName as string)} and type eq 1`;

  return buildQueryString({
    select: [
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "mode",
      "scope",
      "primaryentity",
      "ismanaged",
      "description",
      "xaml",
      "clientdata",
      "triggeroncreate",
      "triggerondelete",
      "triggeronupdateattributelist",
      "inputparameters",
      "createdon",
      "modifiedon",
    ],
    filter,
  });
}

export { WORKFLOW_CATEGORY, WORKFLOW_STATE };
