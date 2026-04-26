import { describe, expect, it } from "vitest";
import { registerGetChartDetails } from "../get-chart-details.js";
import { registerListCharts } from "../list-charts.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const DATA_XML =
  "<datadefinition><fetchcollection><fetch aggregate='true'><entity name='account'><attribute name='industrycode' groupby='true' alias='industry' /><attribute name='accountid' aggregate='count' alias='count' /></entity></fetch></fetchcollection><categorycollection><category alias='industry'><measurecollection><measure alias='count' /></measurecollection></category></categorycollection></datadefinition>";

const PRESENTATION_XML =
  "<visualization><presentationdescription><Chart><Series><Series ChartType='Column' /></Series></Chart></presentationdescription></visualization>";

describe("chart tools", () => {
  it("lists system charts with table and type labels", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        savedqueryvisualizations: [
          {
            savedqueryvisualizationid: "chart-1",
            name: "Accounts by Industry",
            description: "Account chart",
            primaryentitytypecode: "account",
            charttype: 0,
            type: 0,
            isdefault: true,
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListCharts(server as never, config, client);

    const response = await server.getHandler("list_charts")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Accounts by Industry");
    expect(response.content[0].text).toContain("ASP.NET Chart");
    expect(response.structuredContent).toMatchObject({
      data: {
        totalCount: 1,
        items: [{ scope: "system", primaryentitytypecode: "account" }],
      },
    });
  });

  it("lists solution charts without loading full solution inventory", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
            version: "1.0.0.0",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-chart-1",
            objectid: "chart-1",
            componenttype: 59,
            rootsolutioncomponentid: "",
          },
          {
            solutioncomponentid: "sc-view-1",
            objectid: "view-1",
            componenttype: 26,
            rootsolutioncomponentid: "",
          },
        ],
        savedqueryvisualizations: [
          {
            savedqueryvisualizationid: "chart-1",
            name: "Accounts by Industry",
            description: "Account chart",
            primaryentitytypecode: "account",
            charttype: 0,
            type: 0,
            isdefault: true,
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListCharts(server as never, config, client);

    const response = await server.getHandler("list_charts")({
      solution: "Contoso_Core",
      nameFilter: "Industry",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Accounts by Industry");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "solutions",
      "solutioncomponents",
      "savedqueryvisualizations",
    ]);
  });

  it("loads one chart with XML summary", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        savedqueryvisualizations: [
          {
            savedqueryvisualizationid: "chart-1",
            name: "Accounts by Industry",
            description: "Account chart",
            primaryentitytypecode: "account",
            charttype: 0,
            type: 0,
            isdefault: true,
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            datadescription: DATA_XML,
            presentationdescription: PRESENTATION_XML,
          },
        ],
      },
    });

    registerGetChartDetails(server as never, config, client);

    const response = await server.getHandler("get_chart_details")({
      chartName: "Accounts by Industry",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Group By");
    expect(response.content[0].text).toContain("industrycode");
    expect(response.structuredContent).toMatchObject({
      data: {
        chart: {
          name: "Accounts by Industry",
          summary: {
            entityName: "account",
            groupByAttributes: ["industrycode"],
            aggregateAttributes: ["accountid count"],
            measureAliases: ["count"],
            chartTypes: ["Column"],
          },
        },
      },
    });
  });

  it("returns structured retry options when the chart name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        savedqueryvisualizations: [
          {
            savedqueryvisualizationid: "chart-1",
            name: "Activity by Month",
            description: "Account chart",
            primaryentitytypecode: "account",
            charttype: 0,
            type: 0,
            isdefault: false,
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
          {
            savedqueryvisualizationid: "chart-2",
            name: "Activity by Month",
            description: "Contact chart",
            primaryentitytypecode: "contact",
            charttype: 0,
            type: 0,
            isdefault: false,
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerGetChartDetails(server as never, config, client);

    const response = await server.getHandler("get_chart_details")({
      chartName: "Activity by Month",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching chart");
    expect(response.structuredContent).toMatchObject({
      tool: "get_chart_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "chartName",
        options: [
          { value: "chart-1", label: "account/system/Activity by Month (chart-1)" },
          { value: "chart-2", label: "contact/system/Activity by Month (chart-2)" },
        ],
        retryable: false,
      },
    });
  });
});
