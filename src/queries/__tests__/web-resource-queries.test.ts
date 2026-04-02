import { describe, expect, it } from "vitest";
import { getWebResourceContentQuery, listWebResourcesQuery } from "../web-resource-queries.js";

describe("web resource queries", () => {
  it("builds the web resources query with filters", () => {
    const query = listWebResourcesQuery({
      type: "js",
      nameFilter: "account",
    });

    expect(query).toContain("$filter=webresourcetype eq 3 and contains(name,'account')");
    expect(query).toContain("$orderby=name asc");
  });

  it("builds the web resource content query", () => {
    expect(getWebResourceContentQuery()).toBe(
      "$select=webresourceid,name,displayname,webresourcetype,content",
    );
  });
});
