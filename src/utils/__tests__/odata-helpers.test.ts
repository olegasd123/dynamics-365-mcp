import { describe, expect, it } from "vitest";
import {
  buildQueryString,
  escapeODataString,
  odataContains,
  odataEq,
  odataStringLiteral,
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
