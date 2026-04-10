import { describe, expect, it } from "vitest";
import { registerListSecurityRoles } from "../list-security-roles.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_security_roles", () => {
  it("uses the default global business unit when business unit is not provided", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
          },
        ],
        roles: [
          {
            roleid: "role-root",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
          {
            roleid: "role-child",
            name: "Salesperson",
            _businessunitid_value: "bu-child",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Child",
            ismanaged: false,
          },
        ],
      },
    });

    registerListSecurityRoles(server as never, config, client);
    const response = await server.getHandler("list_security_roles")({
      environment: "dev",
      nameFilter: "Sales",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Business Unit: Root");
    expect(response.structuredContent?.data.businessUnit).toBe("Root");
    expect(response.structuredContent?.data.count).toBe(1);
    expect(response.structuredContent?.data.items).toEqual([
      expect.objectContaining({
        roleid: "role-root",
        businessUnitName: "Root",
      }),
    ]);
  });

  it("uses the provided business unit when it is set", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        roles: [
          {
            roleid: "role-root",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
          {
            roleid: "role-child",
            name: "Salesperson",
            _businessunitid_value: "bu-child",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Child",
            ismanaged: false,
          },
        ],
      },
    });

    registerListSecurityRoles(server as never, config, client);
    const response = await server.getHandler("list_security_roles")({
      environment: "dev",
      businessUnit: "Child",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Business Unit: Child");
    expect(response.structuredContent?.data.businessUnit).toBe("Child");
    expect(response.structuredContent?.data.count).toBe(1);
    expect(response.structuredContent?.data.items).toEqual([
      expect.objectContaining({
        roleid: "role-child",
        businessUnitName: "Child",
      }),
    ]);
  });
});
