import { describe, expect, it } from "vitest";
import { registerListBusinessUnits } from "../list-business-units.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_business_units", () => {
  it("lists business units with parent context", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
            modifiedon: "2026-04-02T00:00:00Z",
          },
          {
            businessunitid: "bu-sales",
            name: "Sales",
            _parentbusinessunitid_value: "bu-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            modifiedon: "2026-04-04T00:00:00Z",
          },
        ],
      },
    });

    registerListBusinessUnits(server as never, config, client);
    const response = await server.getHandler("list_business_units")({
      environment: "dev",
      nameFilter: "Sale",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Business Units in 'dev' (filter='Sale')");
    expect(response.structuredContent?.data.count).toBe(2);
    expect(response.structuredContent?.data.items).toEqual([
      expect.objectContaining({
        businessunitid: "bu-root",
        name: "Root",
      }),
      expect.objectContaining({
        businessunitid: "bu-sales",
        parentBusinessUnitName: "Root",
      }),
    ]);
  });
});
