import { and, contains, or, query } from "../utils/odata-builder.js";

const PUBLISHER_SELECT = [
  "publisherid",
  "friendlyname",
  "uniquename",
  "customizationprefix",
  "customizationoptionvalueprefix",
  "description",
  "emailaddress",
  "supportingwebsiteurl",
  "isreadonly",
  "modifiedon",
  "versionnumber",
];

export function listPublishersQuery(nameFilter?: string, prefixFilter?: string): string {
  return query()
    .select(PUBLISHER_SELECT)
    .filter(
      and(
        nameFilter
          ? or(contains("friendlyname", nameFilter), contains("uniquename", nameFilter))
          : undefined,
        prefixFilter ? contains("customizationprefix", prefixFilter) : undefined,
      ),
    )
    .orderby("friendlyname asc")
    .toString();
}
