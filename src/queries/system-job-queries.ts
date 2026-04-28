import {
  and,
  contains,
  eq,
  guidEq,
  inList,
  or,
  query,
  rawFilter,
  type ODataFilter,
} from "../utils/odata-builder.js";

const SYSTEM_JOB_IMPORT_OPERATION_TYPES = [3, 4, 5, 17, 38] as const;
const SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES = [13, 23, 94] as const;

export type SystemJobStatus =
  | "waiting"
  | "inprogress"
  | "succeeded"
  | "failed"
  | "canceled"
  | "suspended";

export type SystemJobType = "workflow" | "plugin" | "bulkdelete" | "import";

export function listSystemJobsQuery(options?: {
  status?: SystemJobStatus;
  jobType?: SystemJobType;
  nameFilter?: string;
  correlationId?: string;
  createdAfter?: string;
  createdBefore?: string;
  completedAfter?: string;
  completedBefore?: string;
  failedOnly?: boolean;
  top?: number;
}): string {
  return query()
    .select([
      "asyncoperationid",
      "name",
      "operationtype",
      "statecode",
      "statuscode",
      "createdon",
      "startedon",
      "completedon",
      "messagename",
      "primaryentitytype",
      "friendlymessage",
      "message",
      "correlationid",
      "errorcode",
      "depth",
      "retrycount",
      "executiontimespan",
      "_owningextensionid_value",
      "_workflowactivationid_value",
    ])
    .filter(
      and(
        buildSystemJobTypeFilter(options?.jobType),
        buildSystemJobStatusFilter(options?.status),
        options?.nameFilter ? contains("name", options.nameFilter) : undefined,
        options?.correlationId ? guidEq("correlationid", options.correlationId) : undefined,
        options?.createdAfter ? rawFilter(`createdon ge ${options.createdAfter}`) : undefined,
        options?.createdBefore ? rawFilter(`createdon le ${options.createdBefore}`) : undefined,
        options?.completedAfter
          ? rawFilter(`completedon ne null and completedon ge ${options.completedAfter}`)
          : undefined,
        options?.completedBefore
          ? rawFilter(`completedon ne null and completedon le ${options.completedBefore}`)
          : undefined,
        options?.failedOnly ? eq("statuscode", 31) : undefined,
      ),
    )
    .orderby("createdon desc")
    .top(options?.top ?? 50)
    .count(true)
    .toString();
}

export function summarizeSystemJobsQuery(options: {
  status?: SystemJobStatus;
  jobType?: SystemJobType;
  createdAfter: string;
  createdBefore: string;
  top: number;
}): string {
  return query()
    .select([
      "asyncoperationid",
      "name",
      "operationtype",
      "statecode",
      "statuscode",
      "createdon",
      "startedon",
      "completedon",
      "messagename",
      "primaryentitytype",
      "friendlymessage",
      "message",
      "errorcode",
      "retrycount",
      "executiontimespan",
      "_owningextensionid_value",
      "_workflowactivationid_value",
    ])
    .filter(
      and(
        buildSystemJobTypeFilter(options.jobType),
        buildSystemJobStatusFilter(options.status),
        rawFilter(`createdon ge ${options.createdAfter}`),
        rawFilter(`createdon le ${options.createdBefore}`),
      ),
    )
    .orderby("createdon asc")
    .top(options.top)
    .count(true)
    .toString();
}

export function getSystemJobByIdQuery(): string {
  return query()
    .select([
      "asyncoperationid",
      "name",
      "operationtype",
      "statecode",
      "statuscode",
      "createdon",
      "startedon",
      "completedon",
      "modifiedon",
      "messagename",
      "primaryentitytype",
      "friendlymessage",
      "message",
      "correlationid",
      "requestid",
      "errorcode",
      "depth",
      "retrycount",
      "executiontimespan",
      "dependencytoken",
      "postponeuntil",
      "workflowstagename",
      "workload",
      "subtype",
      "recurrencepattern",
      "recurrencestarttime",
      "retainjobhistory",
      "parentpluginexecutionid",
      "_owningextensionid_value",
      "_workflowactivationid_value",
    ])
    .toString();
}

export function getWorkflowForSystemJobQuery(): string {
  return query()
    .select(["workflowid", "name", "uniquename", "category", "statecode", "mode", "primaryentity"])
    .toString();
}

export function getPluginStepForSystemJobQuery(): string {
  return query()
    .select([
      "sdkmessageprocessingstepid",
      "name",
      "stage",
      "mode",
      "statecode",
      "statuscode",
      "asyncautodelete",
    ])
    .expand("sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)")
    .toString();
}

export function listBulkDeleteOperationsForSystemJobQuery(systemJobId: string): string {
  return query()
    .select([
      "bulkdeleteoperationid",
      "name",
      "createdon",
      "modifiedon",
      "statecode",
      "statuscode",
      "successcount",
      "failurecount",
      "isrecurring",
      "nextrun",
      "processingqeindex",
    ])
    .filter(guidEq("_asyncoperationid_value", systemJobId))
    .toString();
}

function buildSystemJobStatusFilter(status: SystemJobStatus | undefined): ODataFilter | undefined {
  switch (status) {
    case "waiting":
      return or(eq("statuscode", 0), eq("statuscode", 10));
    case "inprogress":
      return or(eq("statuscode", 20), eq("statuscode", 21), eq("statuscode", 22));
    case "succeeded":
      return eq("statuscode", 30);
    case "failed":
      return eq("statuscode", 31);
    case "canceled":
      return eq("statuscode", 32);
    case "suspended":
      return eq("statecode", 1);
    default:
      return undefined;
  }
}

function buildSystemJobTypeFilter(jobType: SystemJobType | undefined): ODataFilter | undefined {
  switch (jobType) {
    case "workflow":
      return or(eq("operationtype", 10), rawFilter("_workflowactivationid_value ne null"));
    case "plugin":
      return rawFilter("_owningextensionid_value ne null");
    case "bulkdelete":
      return inList("operationtype", SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES);
    case "import":
      return inList("operationtype", SYSTEM_JOB_IMPORT_OPERATION_TYPES);
    default:
      return undefined;
  }
}

export { SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES, SYSTEM_JOB_IMPORT_OPERATION_TYPES };
