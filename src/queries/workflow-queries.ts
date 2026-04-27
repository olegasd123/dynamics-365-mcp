import { and, eq, guidInList, identityOrGuidEq, query } from "../utils/odata-builder.js";

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
  return query()
    .select([
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
    ])
    .filter(
      and(
        eq("type", 1), // Definition only (exclude activations)
        options?.category !== undefined
          ? eq("category", WORKFLOW_CATEGORY[options.category])
          : undefined,
        options?.status !== undefined ? eq("statecode", WORKFLOW_STATE[options.status]) : undefined,
      ),
    )
    .orderby("name asc")
    .toString();
}

export function listWorkflowDefinitionSearchQuery(options?: {
  category?: WorkflowCategory;
  status?: WorkflowState;
}): string {
  return query()
    .select([
      "workflowid",
      "name",
      "uniquename",
      "category",
      "statecode",
      "statuscode",
      "mode",
      "primaryentity",
      "ismanaged",
      "modifiedon",
      "xaml",
      "clientdata",
    ])
    .filter(
      and(
        eq("type", 1), // Definition only (exclude activations)
        options?.category !== undefined
          ? eq("category", WORKFLOW_CATEGORY[options.category])
          : undefined,
        options?.status !== undefined ? eq("statecode", WORKFLOW_STATE[options.status]) : undefined,
      ),
    )
    .orderby("name asc")
    .toString();
}

export function listActionsQuery(): string {
  return query()
    .select([
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
    ])
    .filter(and(eq("type", 1), eq("category", 3)))
    .orderby("name asc")
    .toString();
}

export function listWorkflowsByIdsQuery(workflowIds: string[]): string {
  return query()
    .select([
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
    ])
    .filter(guidInList("workflowid", workflowIds))
    .orderby("name asc")
    .toString();
}

export function getWorkflowDetailsQuery(): string {
  return query()
    .select([
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
    ])
    .toString();
}

export function getWorkflowDetailsByIdentityQuery(options: {
  workflowName?: string;
  uniqueName?: string;
}): string {
  return query()
    .select([
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
    ])
    .filter(
      and(
        options.uniqueName
          ? identityOrGuidEq("uniquename", "workflowid", options.uniqueName)
          : eq("name", options.workflowName as string),
        eq("type", 1),
      ),
    )
    .toString();
}

export { WORKFLOW_CATEGORY, WORKFLOW_STATE };
