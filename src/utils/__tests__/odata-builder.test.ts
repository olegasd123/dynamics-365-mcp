import { describe, expect, it } from "vitest";
import {
  and,
  contains,
  eq,
  escapeODataString,
  guidEq,
  normalizeGuid,
  odataContains,
  odataEq,
  odataStringLiteral,
  or,
  query,
} from "../odata-builder.js";

describe("OData string helpers", () => {
  it("escapes single quotes in string values", () => {
    expect(escapeODataString("O'Hara")).toBe("O''Hara");
    expect(odataStringLiteral("O'Hara")).toBe("'O''Hara'");
  });

  it("builds safe eq and contains expressions", () => {
    expect(odataEq("name", "O'Hara")).toBe("name eq 'O''Hara'");
    expect(odataContains("name", "Bob's")).toBe("contains(name,'Bob''s')");
  });

  it("normalizes GUID values for Dataverse filters", () => {
    expect(normalizeGuid("{11111111-AAAA-bbbb-CCCC-111111111111}")).toBe(
      "11111111-aaaa-bbbb-cccc-111111111111",
    );
    expect(normalizeGuid("not-a-guid")).toBeNull();
    expect(guidEq("webresourceid", "11111111-1111-1111-1111-111111111111").toString()).toBe(
      "webresourceid eq 11111111-1111-1111-1111-111111111111",
    );
  });
});

describe("query builder", () => {
  it("returns an empty string when no query parts are provided", () => {
    expect(query().toString()).toBe("");
  });

  it("serializes all supported query parts", () => {
    expect(
      query()
        .select(["name", "statecode"])
        .filter("statecode eq 1")
        .expand("ownerid($select=fullname)")
        .orderby("name asc")
        .top(10)
        .count()
        .toString(),
    ).toBe(
      "$select=name,statecode&$filter=statecode eq 1&$expand=ownerid($select=fullname)&$orderby=name asc&$top=10&$count=true",
    );
  });

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

  it("accepts composable filter objects", () => {
    expect(
      query()
        .select(["name", "uniquename"])
        .filter(and(eq("type", 1), or(contains("name", "Flow"), contains("uniquename", "Flow"))))
        .orderby("name asc")
        .toString(),
    ).toBe(
      "$select=name,uniquename&$filter=type eq 1 and (contains(name,'Flow') or contains(uniquename,'Flow'))&$orderby=name asc",
    );
  });
});
