import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import {
  fetchBusinessUnitDetails,
  fetchDefaultGlobalBusinessUnitName,
  listBusinessUnits,
} from "../business-unit-metadata.js";

describe("business unit metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists business units and loads parent-child details", async () => {
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
            _organizationid_value: "org-1",
            "_organizationid_value@OData.Community.Display.V1.FormattedValue": "Contoso",
            isdisabled: false,
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
            isdisabled: false,
            createdon: "2026-04-03T00:00:00Z",
            modifiedon: "2026-04-04T00:00:00Z",
          },
          {
            businessunitid: "bu-sales-east",
            name: "Sales East",
            _parentbusinessunitid_value: "bu-sales",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Sales",
            _organizationid_value: "org-1",
            "_organizationid_value@OData.Community.Display.V1.FormattedValue": "Contoso",
            isdisabled: true,
            createdon: "2026-04-05T00:00:00Z",
            modifiedon: "2026-04-06T00:00:00Z",
          },
        ],
      },
    });

    const businessUnits = await listBusinessUnits(env, client);
    const details = await fetchBusinessUnitDetails(env, client, "Sales");

    expect(businessUnits).toHaveLength(3);
    expect(details.businessUnit.name).toBe("Sales");
    expect(details.parent?.name).toBe("Root");
    expect(details.children).toEqual([
      expect.objectContaining({
        businessunitid: "bu-sales-east",
        name: "Sales East",
      }),
    ]);
    expect(details.path).toEqual(["Root", "Sales"]);
  });

  it("resolves the default global business unit", async () => {
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
          },
        ],
      },
    });

    await expect(fetchDefaultGlobalBusinessUnitName(env, client)).resolves.toBe("Root");
  });
});
