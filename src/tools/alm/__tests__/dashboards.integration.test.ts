import { describe, expect, it } from "vitest";
import { registerGetDashboardDetails } from "../get-dashboard-details.js";
import { registerListDashboards } from "../list-dashboards.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("dashboard tools", () => {
  it("lists dashboards with table and type labels", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        systemforms: [
          {
            formid: "dash-1",
            name: "Sales Dashboard",
            description: "Main dashboard",
            objecttypecode: "account",
            type: 0,
            ismanaged: false,
            publishedon: "2025-01-01T00:00:00Z",
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListDashboards(server as never, config, client);

    const response = await server.getHandler("list_dashboards")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Sales Dashboard");
    expect(response.content[0].text).toContain("Dashboard");
  });

  it("lists solution dashboards without loading full solution inventory", async () => {
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
            solutioncomponentid: "sc-dash-1",
            objectid: "dash-1",
            componenttype: 60,
            rootsolutioncomponentid: "",
          },
          {
            solutioncomponentid: "sc-column-1",
            objectid: "column-1",
            componenttype: 2,
            rootsolutioncomponentid: "",
          },
        ],
        systemforms: [
          {
            formid: "dash-1",
            name: "Sales Dashboard",
            description: "Main dashboard",
            objecttypecode: "account",
            type: 0,
            ismanaged: false,
            publishedon: "2025-01-01T00:00:00Z",
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListDashboards(server as never, config, client);

    const response = await server.getHandler("list_dashboards")({
      solution: "Contoso_Core",
      nameFilter: "Sales",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Sales Dashboard");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "solutions",
      "solutioncomponents",
      "systemforms",
    ]);
  });

  it("loads one dashboard", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        systemforms: [
          {
            formid: "dash-1",
            name: "Sales Dashboard",
            description: "Main dashboard",
            objecttypecode: "account",
            type: 0,
            ismanaged: false,
            publishedon: "2025-01-01T00:00:00Z",
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerGetDashboardDetails(server as never, config, client);

    const response = await server.getHandler("get_dashboard_details")({
      dashboardName: "Sales Dashboard",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Table: account");
    expect(response.structuredContent).toMatchObject({
      data: {
        dashboard: {
          name: "Sales Dashboard",
          typeLabel: "Dashboard",
        },
      },
    });
  });
});
