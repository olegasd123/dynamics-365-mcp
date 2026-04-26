import {
  SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES,
  SYSTEM_JOB_IMPORT_OPERATION_TYPES,
} from "../../queries/system-job-queries.js";

export const SYSTEM_JOB_STATE_LABELS: Record<number, string> = {
  0: "Ready",
  1: "Suspended",
  2: "Locked",
  3: "Completed",
};

export const SYSTEM_JOB_STATUS_LABELS: Record<number, string> = {
  0: "Waiting For Resources",
  10: "Waiting",
  20: "In Progress",
  21: "Pausing",
  22: "Canceling",
  30: "Succeeded",
  31: "Failed",
  32: "Canceled",
};

export const SYSTEM_JOB_OPERATION_LABELS: Record<number, string> = {
  1: "System Event",
  3: "Import File Parse",
  4: "Transform Parse Data",
  5: "Import",
  10: "Workflow",
  13: "Bulk Delete",
  17: "Import Subprocess",
  23: "Bulk Delete Subprocess",
  38: "Import Sample Data",
  54: "Execute Async Request",
  59: "Import Translation",
  75: "Flow Notification",
  93: "Import Solution Metadata",
  94: "Bulk Delete File Attachment",
  101: "Update Modern Flow",
  203: "Import Solution Async Operation",
  210: "ImportTranslation Async Operation",
};

export type SystemJobCategory = "Workflow" | "Plug-in" | "Bulk Delete" | "Import" | "Other";

export function normalizeSystemJob(record: Record<string, unknown>) {
  const operationType = getNumber(record.operationtype);
  const state = getNumber(record.statecode);
  const status = getNumber(record.statuscode);
  const friendlyMessage = normalizeText(record.friendlymessage);
  const message = normalizeText(record.message);
  const effectiveMessage = friendlyMessage || message;
  const owningExtensionId = normalizeId(record._owningextensionid_value);
  const workflowActivationId = normalizeId(record._workflowactivationid_value);

  return {
    asyncOperationId: String(record.asyncoperationid || ""),
    name: String(record.name || ""),
    operationType,
    operationLabel: formatOperationType(operationType),
    category: classifySystemJob(operationType, owningExtensionId, workflowActivationId),
    state,
    stateLabel: state === null ? "-" : (SYSTEM_JOB_STATE_LABELS[state] ?? String(state)),
    status,
    statusLabel: status === null ? "-" : (SYSTEM_JOB_STATUS_LABELS[status] ?? String(status)),
    createdOn: String(record.createdon || ""),
    startedOn: String(record.startedon || ""),
    completedOn: String(record.completedon || ""),
    modifiedOn: String(record.modifiedon || ""),
    messageName: String(record.messagename || ""),
    primaryEntityType: String(record.primaryentitytype || ""),
    correlationId: String(record.correlationid || ""),
    requestId: String(record.requestid || ""),
    errorCode: getNumber(record.errorcode),
    depth: getNumber(record.depth),
    retryCount: getNumber(record.retrycount),
    executionTimeSpan: getNumber(record.executiontimespan),
    dependencyToken: normalizeText(record.dependencytoken),
    postponeUntil: String(record.postponeuntil || ""),
    workflowStageName: normalizeText(record.workflowstagename),
    workload: normalizeText(record.workload),
    subtype: getNumber(record.subtype),
    recurrencePattern: normalizeText(record.recurrencepattern),
    recurrenceStartTime: String(record.recurrencestarttime || ""),
    retainJobHistory: getBoolean(record.retainjobhistory),
    parentPluginExecutionId: String(record.parentpluginexecutionid || ""),
    owningExtensionId,
    workflowActivationId,
    friendlyMessage,
    message,
    effectiveMessage,
    messagePreview: buildPreview(effectiveMessage),
  };
}

export function formatOperationType(operationType: number | null): string {
  if (operationType === null) {
    return "-";
  }

  return SYSTEM_JOB_OPERATION_LABELS[operationType]
    ? `${SYSTEM_JOB_OPERATION_LABELS[operationType]} (${operationType})`
    : `Operation ${operationType}`;
}

export function classifySystemJob(
  operationType: number | null,
  owningExtensionId: string | null,
  workflowActivationId: string | null,
): SystemJobCategory {
  if (
    operationType !== null &&
    SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES.includes(
      operationType as (typeof SYSTEM_JOB_BULK_DELETE_OPERATION_TYPES)[number],
    )
  ) {
    return "Bulk Delete";
  }

  if (
    operationType !== null &&
    SYSTEM_JOB_IMPORT_OPERATION_TYPES.includes(
      operationType as (typeof SYSTEM_JOB_IMPORT_OPERATION_TYPES)[number],
    )
  ) {
    return "Import";
  }

  if (workflowActivationId || operationType === 10) {
    return "Workflow";
  }

  if (owningExtensionId) {
    return "Plug-in";
  }

  return "Other";
}

export function normalizeDateTimeInput(
  value: string | undefined,
  fieldName: string,
): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid date/time string.`);
  }

  return parsed.toISOString();
}

export function buildPreview(value: string | null, maxLength = 80): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

export function normalizeId(value: unknown): string | null {
  const text = String(value || "").trim();
  return text.length > 0 ? text : null;
}

export function getNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === "false" || value === "0" || value === 0) {
    return false;
  }

  return null;
}
