type QueryPart = string | { toString(): string };
type FilterInput = ODataFilter | null | undefined | false;
type ODataPrimitive = string | number | boolean | null;

const PRECEDENCE_OR = 1;
const PRECEDENCE_AND = 2;
const PRECEDENCE_ATOM = 3;
const GUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class ODataFilter {
  constructor(
    private readonly expression: string,
    private readonly precedence = PRECEDENCE_ATOM,
  ) {}

  toString(): string {
    return this.expression;
  }

  withParentPrecedence(parentPrecedence: number): string {
    if (this.precedence < parentPrecedence) {
      return `(${this.expression})`;
    }

    return this.expression;
  }
}

function renderQueryPart(value?: QueryPart): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
}

function filterFromValues(
  operator: "and" | "or",
  precedence: number,
  filters: FilterInput[],
): ODataFilter | undefined {
  const parts = filters.filter((filter): filter is ODataFilter => Boolean(filter));

  if (parts.length === 0) {
    return undefined;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return new ODataFilter(
    parts.map((part) => part.withParentPrecedence(precedence)).join(` ${operator} `),
    precedence,
  );
}

function formatODataPrimitive(value: ODataPrimitive): string {
  if (typeof value === "string") {
    return odataStringLiteral(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

/**
 * Internal serializer used by `query().toString()`.
 * Prefer the fluent `query()` builder in calling code.
 */
function serializeQueryString(params: {
  select?: string[];
  filter?: QueryPart;
  expand?: QueryPart;
  orderby?: QueryPart;
  top?: number;
  count?: boolean;
}): string {
  const parts: string[] = [];
  const filter = renderQueryPart(params.filter);
  const expand = renderQueryPart(params.expand);
  const orderby = renderQueryPart(params.orderby);

  if (params.select?.length) {
    parts.push(`$select=${params.select.join(",")}`);
  }
  if (filter) {
    parts.push(`$filter=${filter}`);
  }
  if (expand) {
    parts.push(`$expand=${expand}`);
  }
  if (orderby) {
    parts.push(`$orderby=${orderby}`);
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

export function rawFilter(expression: string): ODataFilter {
  return new ODataFilter(expression);
}

export function eq<Field extends string>(field: Field, value: ODataPrimitive): ODataFilter {
  return rawFilter(`${field} eq ${formatODataPrimitive(value)}`);
}

export function normalizeGuid(value: string): string | null {
  const trimmed = value.trim();
  const withoutBraces =
    trimmed.startsWith("{") && trimmed.endsWith("}") ? trimmed.slice(1, -1) : trimmed;

  if (!GUID_PATTERN.test(withoutBraces)) {
    return null;
  }

  return withoutBraces.toLowerCase();
}

export function guidEq<Field extends string>(field: Field, value: string): ODataFilter {
  const guid = normalizeGuid(value);

  if (!guid) {
    throw new Error(`Value '${value}' is not a GUID.`);
  }

  return rawFilter(`${field} eq ${guid}`);
}

export function contains<Field extends string>(field: Field, value: string): ODataFilter {
  return rawFilter(`contains(${field},${odataStringLiteral(value)})`);
}

export function isNull<Field extends string>(field: Field): ODataFilter {
  return eq(field, null);
}

export function and(...filters: FilterInput[]): ODataFilter | undefined {
  return filterFromValues("and", PRECEDENCE_AND, filters);
}

export function or(...filters: FilterInput[]): ODataFilter | undefined {
  return filterFromValues("or", PRECEDENCE_OR, filters);
}

export function inList<Field extends string>(
  field: Field,
  values: readonly ODataPrimitive[],
): ODataFilter | undefined {
  return or(...values.map((value) => eq(field, value)));
}

export class ODataQueryBuilder<Field extends string = string> {
  private readonly params: {
    select?: Field[];
    filter?: QueryPart;
    expand?: QueryPart;
    orderby?: QueryPart;
    top?: number;
    count?: boolean;
  } = {};

  select(fields: readonly Field[]): this {
    this.params.select = [...fields];
    return this;
  }

  filter(filter?: QueryPart): this {
    this.params.filter = filter;
    return this;
  }

  expand(expand?: QueryPart): this {
    this.params.expand = expand;
    return this;
  }

  orderby(orderby?: QueryPart): this {
    this.params.orderby = orderby;
    return this;
  }

  top(top: number): this {
    this.params.top = top;
    return this;
  }

  count(enabled = true): this {
    this.params.count = enabled;
    return this;
  }

  toString(): string {
    return serializeQueryString(this.params);
  }
}

export function query<Field extends string = string>(): ODataQueryBuilder<Field> {
  return new ODataQueryBuilder<Field>();
}

export function odataEq(field: string, value: string): string {
  return eq(field, value).toString();
}

export function odataContains(field: string, value: string): string {
  return contains(field, value).toString();
}
