import { describe, expect, it } from "vitest";
import {
  and,
  buildQueryString,
  contains,
  eq,
  escapeODataString,
  odataContains,
  odataEq,
  odataStringLiteral,
  or,
  query,
} from "../odata-helpers.js";

describe("buildQueryString", () => {
  it("builds an OData query string from all supported parts", () => {
    expect(
      buildQueryString({
        select: ["name", "statecode"],
        filter: "statecode eq 1",
        expand: "ownerid($select=fullname)",
        orderby: "name asc",
        top: 10,
        count: true,
      }),
    ).toBe(
      "$select=name,statecode&$filter=statecode eq 1&$expand=ownerid($select=fullname)&$orderby=name asc&$top=10&$count=true",
    );
  });

  it("returns an empty string when no query parts are provided", () => {
    expect(buildQueryString({})).toBe("");
  });

  it("accepts composable filter objects", () => {
    expect(
      buildQueryString({
        select: ["name", "uniquename"],
        filter: and(eq("type", 1), or(contains("name", "Flow"), contains("uniquename", "Flow"))),
        orderby: "name asc",
      }),
    ).toBe(
      "$select=name,uniquename&$filter=type eq 1 and (contains(name,'Flow') or contains(uniquename,'Flow'))&$orderby=name asc",
    );
  });
});

describe("OData string helpers", () => {
  it("escapes single quotes in string values", () => {
    expect(escapeODataString("O'Hara")).toBe("O''Hara");
    expect(odataStringLiteral("O'Hara")).toBe("'O''Hara'");
  });

  it("builds safe eq and contains expressions", () => {
    expect(odataEq("name", "O'Hara")).toBe("name eq 'O''Hara'");
    expect(odataContains("name", "Bob's")).toBe("contains(name,'Bob''s')");
  });
});

describe("query builder", () => {
  it("builds composable queries fluently", () => {
    expect(
      query()
        .select(["name", "uniquename"])
        .filter(
          and(
            eq("type", 1),
            eq("category", 5),
            or(contains("name", "Active"), contains("uniquename", "Active")),
          ),
        )
        .orderby("name asc")
        .toString(),
    ).toBe(
      "$select=name,uniquename&$filter=type eq 1 and category eq 5 and (contains(name,'Active') or contains(uniquename,'Active'))&$orderby=name asc",
    );
  });
});
