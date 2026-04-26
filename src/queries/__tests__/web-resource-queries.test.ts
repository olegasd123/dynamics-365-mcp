import { describe, expect, it } from "vitest";
import {
  getWebResourceContentByNameQuery,
  getWebResourceContentQuery,
  listWebResourcesQuery,
  listWebResourcesWithContentQuery,
  searchWebResourcesQuery,
} from "../web-resource-queries.js";

describe("web resource queries", () => {
  it("builds the web resources query with filters", () => {
    const query = listWebResourcesQuery({
      type: "js",
      nameFilter: "account",
    });

    expect(query).toContain("$filter=webresourcetype eq 3 and contains(name,'account')");
    expect(query).toContain("$orderby=name asc");
  });

  it("builds the web resource discovery search query", () => {
    const query = searchWebResourcesQuery("candidateCvViewer");

    expect(query).toContain(
      "$filter=contains(name,'candidateCvViewer') or contains(displayname,'candidateCvViewer') or contains(description,'candidateCvViewer')",
    );
    expect(query).toContain("$orderby=name asc");
  });

  it("builds the web resource content query", () => {
    expect(getWebResourceContentQuery()).toBe(
      "$select=webresourceid,name,displayname,webresourcetype,content",
    );
  });

  it("builds the web resource content query by name", () => {
    const query = getWebResourceContentByNameQuery("new_/O'Hara.js");

    expect(query).toContain("$filter=name eq 'new_/O''Hara.js'");
    expect(query).not.toContain("or webresourceid");
  });

  it("builds the web resource content query by id", () => {
    expect(getWebResourceContentByNameQuery("11111111-1111-1111-1111-111111111111")).toContain(
      "$filter=webresourceid eq 11111111-1111-1111-1111-111111111111",
    );
  });

  it("builds the web resources with content query", () => {
    const query = listWebResourcesWithContentQuery({
      type: "js",
      nameFilter: "O'Hara",
    });

    expect(query).toContain(
      "$select=webresourceid,name,displayname,webresourcetype,ismanaged,modifiedon,content",
    );
    expect(query).toContain("$filter=webresourcetype eq 3 and contains(name,'O''Hara')");
  });
});
