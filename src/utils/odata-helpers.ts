export function buildQueryString(params: {
  select?: string[];
  filter?: string;
  expand?: string;
  orderby?: string;
  top?: number;
  count?: boolean;
}): string {
  const parts: string[] = [];

  if (params.select?.length) {
    parts.push(`$select=${params.select.join(",")}`);
  }
  if (params.filter) {
    parts.push(`$filter=${params.filter}`);
  }
  if (params.expand) {
    parts.push(`$expand=${params.expand}`);
  }
  if (params.orderby) {
    parts.push(`$orderby=${params.orderby}`);
  }
  if (params.top !== undefined) {
    parts.push(`$top=${params.top}`);
  }
  if (params.count) {
    parts.push("$count=true");
  }

  return parts.join("&");
}
