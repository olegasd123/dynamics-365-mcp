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

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

export function odataStringLiteral(value: string): string {
  return `'${escapeODataString(value)}'`;
}

export function odataEq(field: string, value: string): string {
  return `${field} eq ${odataStringLiteral(value)}`;
}

export function odataContains(field: string, value: string): string {
  return `contains(${field},${odataStringLiteral(value)})`;
}
