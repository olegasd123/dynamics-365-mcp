import { describe, expect, it } from "vitest";
import {
  getPersonalChartByIdentityQuery,
  getSystemChartByIdentityQuery,
  listPersonalChartsQuery,
  listSystemChartsByIdsQuery,
  listSystemChartsQuery,
} from "../chart-queries.js";

describe("chart queries", () => {
  const chartId1 = "11111111-1111-1111-1111-111111111111";
  const chartId2 = "22222222-2222-2222-2222-222222222222";

  it("builds the system chart list query", () => {
    const query = listSystemChartsQuery({ table: "account", nameFilter: "Sales" });

    expect(query).toContain(
      "$filter=primaryentitytypecode eq 'account' and contains(name,'Sales')",
    );
    expect(query).toContain("savedqueryvisualizationid");
    expect(query).toContain("$orderby=primaryentitytypecode asc,name asc");
  });

  it("builds the personal chart list query", () => {
    const query = listPersonalChartsQuery({ table: "account" });

    expect(query).toContain("$filter=primaryentitytypecode eq 'account'");
    expect(query).toContain("userqueryvisualizationid");
  });

  it("builds identity queries", () => {
    expect(getSystemChartByIdentityQuery({ table: "account", chartName: "By Industry" })).toContain(
      "$filter=name eq 'By Industry' and primaryentitytypecode eq 'account'",
    );
    expect(
      getPersonalChartByIdentityQuery({ table: "account", chartName: "O'Hara Chart" }),
    ).toContain("$filter=name eq 'O''Hara Chart' and primaryentitytypecode eq 'account'");
  });

  it("builds the bulk system chart query", () => {
    const query = listSystemChartsByIdsQuery([chartId1, chartId2]);

    expect(query).toContain(
      `savedqueryvisualizationid eq ${chartId1} or savedqueryvisualizationid eq ${chartId2}`,
    );
  });
});
