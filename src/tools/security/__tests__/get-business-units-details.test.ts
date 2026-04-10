import { describe, expect, it } from "vitest";
import { registerGetBusinessUnitsDetails } from "../get-business-units-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_business_units_details", () => {
  it("returns one business unit with child context", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
            _organizationid_value: "org-1",
            "_organizationid_value@OData.Community.Display.V1.FormattedValue": "Contoso",
            createdon: "2026-04-01T00:00:00Z",
            modifiedon: "2026-04-02T00:00:00Z",
          },
          {
            businessunitid: "bu-sales",
            name: "Sales",
            _parentbusinessunitid_value: "bu-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            _organizationid_value: "org-1",
            "_organizationid_value@OData.Community.Display.V1.FormattedValue": "Contoso",
            createdon: "2026-04-03T00:00:00Z",
            modifiedon: "2026-04-04T00:00:00Z",
          },
          {
            businessunitid: "bu-sales-east",
            name: "Sales East",
            _parentbusinessunitid_value: "bu-sales",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Sales",
            createdon: "2026-04-05T00:00:00Z",
            modifiedon: "2026-04-06T00:00:00Z",
          },
        ],
      },
    });

    registerGetBusinessUnitsDetails(server as never, config, client);
    const response = await server.getHandler("get_business_units_details")({
      environment: "dev",
      businessUnitName: "Sales",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("## Business Unit: Sales");
    expect(response.content[0]?.text).toContain("Path: Root > Sales");
    expect(response.structuredContent?.data.parent).toEqual(
      expect.objectContaining({
        businessunitid: "bu-root",
        name: "Root",
      }),
    );
    expect(response.structuredContent?.data.directChildren).toEqual([
      expect.objectContaining({
        businessunitid: "bu-sales-east",
        name: "Sales East",
      }),
    ]);
  });
});
