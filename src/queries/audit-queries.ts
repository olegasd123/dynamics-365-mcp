import { and, eq, query, rawFilter, type ODataFilter } from "../utils/odata-builder.js";

export function listAuditHistoryQuery(options: {
  tableLogicalName: string;
  recordId?: string;
  createdAfter?: string;
  createdBefore?: string;
  top: number;
}): string {
  return query()
    .select([
      "auditid",
      "createdon",
      "action",
      "operation",
      "objecttypecode",
      "_objectid_value",
      "_userid_value",
      "_callinguserid_value",
      "changedata",
      "additionalinfo",
      "useradditionalinfo",
      "transactionid",
    ])
    .filter(
      and(
        eq("objecttypecode", options.tableLogicalName),
        options.recordId ? eq("_objectid_value", options.recordId) : undefined,
        buildDateFilter("createdon", "ge", options.createdAfter),
        buildDateFilter("createdon", "le", options.createdBefore),
      ),
    )
    .orderby("createdon desc,auditid desc")
    .top(options.top)
    .count(true)
    .toString();
}

export function getAuditByIdQuery(): string {
  return query()
    .select([
      "auditid",
      "createdon",
      "action",
      "operation",
      "objecttypecode",
      "_objectid_value",
      "_userid_value",
      "_callinguserid_value",
      "changedata",
      "additionalinfo",
      "useradditionalinfo",
      "transactionid",
    ])
    .toString();
}

function buildDateFilter(
  fieldName: string,
  operator: "ge" | "le",
  value: string | undefined,
): ODataFilter | undefined {
  if (!value) {
    return undefined;
  }

  return rawFilter(`${fieldName} ${operator} ${value}`);
}
