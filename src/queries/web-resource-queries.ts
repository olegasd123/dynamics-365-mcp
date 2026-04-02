import { buildQueryString, odataContains, odataEq } from "../utils/odata-helpers.js";

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
  const filters: string[] = [];

  if (options?.type) {
    filters.push(`webresourcetype eq ${WEB_RESOURCE_TYPE[options.type]}`);
  }
  if (options?.nameFilter) {
    filters.push(odataContains("name", options.nameFilter));
  }

  return buildQueryString({
    select: [
      "webresourceid",
      "name",
      "displayname",
      "webresourcetype",
      "ismanaged",
      "description",
      "modifiedon",
    ],
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
    orderby: "name asc",
  });
}

export function getWebResourceContentQuery(): string {
  return buildQueryString({
    select: ["webresourceid", "name", "displayname", "webresourcetype", "content"],
  });
}

export function getWebResourceContentByNameQuery(resourceName: string): string {
  return buildQueryString({
    select: ["webresourceid", "name", "displayname", "webresourcetype", "content"],
    filter: odataEq("name", resourceName),
  });
}

export function listWebResourcesWithContentQuery(options?: {
  type?: WebResourceType;
  nameFilter?: string;
}): string {
  const filters: string[] = [];

  if (options?.type) {
    filters.push(`webresourcetype eq ${WEB_RESOURCE_TYPE[options.type]}`);
  }
  if (options?.nameFilter) {
    filters.push(odataContains("name", options.nameFilter));
  }

  return buildQueryString({
    select: [
      "webresourceid",
      "name",
      "displayname",
      "webresourcetype",
      "ismanaged",
      "modifiedon",
      "content",
    ],
    filter: filters.length > 0 ? filters.join(" and ") : undefined,
    orderby: "name asc",
  });
}

export { WEB_RESOURCE_TYPE };
