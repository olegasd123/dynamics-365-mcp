import { describe, expect, it } from "vitest";
import { buildQueryString } from "../odata-helpers.js";

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
