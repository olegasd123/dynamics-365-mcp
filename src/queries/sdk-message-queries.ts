import { eq, query } from "../utils/odata-builder.js";

const SDK_MESSAGE_FILTER_SELECT = [
  "sdkmessagefilterid",
  "primaryobjecttypecode",
  "iscustomprocessingstepallowed",
];

export function listSdkMessageFiltersForTableQuery(tableLogicalName: string): string {
  return query()
    .select(SDK_MESSAGE_FILTER_SELECT)
    .filter(eq("primaryobjecttypecode", tableLogicalName))
    .expand("sdkmessageid($select=sdkmessageid,name)")
    .orderby("sdkmessageid/name asc")
    .toString();
}
