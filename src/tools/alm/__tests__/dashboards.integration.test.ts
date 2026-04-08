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
