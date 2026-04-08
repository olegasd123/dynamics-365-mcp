import { describe, expect, it } from "vitest";
import { listDashboardsQuery } from "../dashboard-queries.js";

describe("dashboard queries", () => {
  it("builds the dashboard list query", () => {
    const query = listDashboardsQuery("Sales");

    expect(query).toContain("$filter=type eq 0 and contains(name,'Sales')");
    expect(query).toContain(
      "$select=formid,name,description,objecttypecode,type,ismanaged,publishedon,modifiedon",
    );
    expect(query).toContain("$orderby=name asc");
  });
});
