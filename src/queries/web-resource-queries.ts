import { and, contains, eq, inList, or, query } from "../utils/odata-builder.js";

const WEB_RESOURCE_TYPE: Record<string, number> = {
  html: 1,
  css: 2,
  js: 3,
  xml: 4,
  png: 5,
  jpg: 6,
  gif: 7,
  xap: 8,
  xsl: 9,
  ico: 10,
  svg: 11,
  resx: 12,
};

export type WebResourceType = keyof typeof WEB_RESOURCE_TYPE;

export function listWebResourcesQuery(options?: {
  type?: WebResourceType;
  nameFilter?: string;
}): string {
  return query()
    .select([
      "webresourceid",
      "name",
      "displayname",
      "webresourcetype",
      "ismanaged",
      "description",
      "modifiedon",
    ])
    .filter(
      and(
        options?.type ? eq("webresourcetype", WEB_RESOURCE_TYPE[options.type]) : undefined,
        options?.nameFilter ? contains("name", options.nameFilter) : undefined,
      ),
    )
    .orderby("name asc")
    .toString();
}

export function getWebResourceContentQuery(): string {
  return query()
    .select(["webresourceid", "name", "displayname", "webresourcetype", "content"])
    .toString();
}

export function getWebResourceContentByNameQuery(resourceName: string): string {
  return query()
    .select(["webresourceid", "name", "displayname", "webresourcetype", "content"])
    .filter(or(eq("name", resourceName), eq("webresourceid", resourceName)))
    .toString();
}

export function listWebResourcesByIdsQuery(resourceIds: string[]): string {
  return query()
    .select([
      "webresourceid",
      "name",
      "displayname",
      "webresourcetype",
      "ismanaged",
      "description",
      "modifiedon",
    ])
    .filter(inList("webresourceid", resourceIds))
    .orderby("name asc")
    .toString();
}

export function listWebResourcesWithContentQuery(options?: {
  type?: WebResourceType;
  nameFilter?: string;
}): string {
  return query()
    .select([
      "webresourceid",
      "name",
      "displayname",
      "webresourcetype",
      "ismanaged",
      "modifiedon",
      "content",
    ])
    .filter(
      and(
        options?.type ? eq("webresourcetype", WEB_RESOURCE_TYPE[options.type]) : undefined,
        options?.nameFilter ? contains("name", options.nameFilter) : undefined,
      ),
    )
    .orderby("name asc")
    .toString();
}

export { WEB_RESOURCE_TYPE };
