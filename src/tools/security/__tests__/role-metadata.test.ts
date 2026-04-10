import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchRolePrivileges, listSecurityRoles } from "../role-metadata.js";

describe("role metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists roles and resolves privilege details", async () => {
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-1",
            name: "Root",
          },
        ],
        roles: [
          {
            roleid: "role-1",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-1",
            roleid: "role-1",
            privilegeid: "priv-1",
            privilegedepthmask: 8,
            ismanaged: false,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-1",
            name: "prvReadAccount",
            accessright: 2,
            canbebasic: true,
            canbelocal: true,
            canbedeep: true,
            canbeglobal: true,
          },
        ],
      },
    });

    const roles = await listSecurityRoles(env, client);
    const details = await fetchRolePrivileges(env, client, "Salesperson");

    expect(roles).toEqual([
      expect.objectContaining({
        name: "Salesperson",
        businessUnitName: "Root",
      }),
    ]);
    expect(details.privileges).toEqual([
      expect.objectContaining({
        privilegeName: "prvReadAccount",
        accessRightLabel: "Read",
        depthDisplay: "Global",
      }),
    ]);
  });

  it("chunks privilege detail requests for large roles", async () => {
    const privilegeCount = 41;
    const { client, calls } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-1",
            name: "Root",
          },
        ],
        roles: [
          {
            roleid: "role-1",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: Array.from({ length: privilegeCount }, (_, index) => ({
          roleprivilegeid: `rp-${index + 1}`,
          roleid: "role-1",
          privilegeid: `priv-${index + 1}`,
          privilegedepthmask: 8,
          ismanaged: false,
        })),
        privileges: Array.from({ length: privilegeCount }, (_, index) => ({
          privilegeid: `priv-${index + 1}`,
          name: `prv-${index + 1}`,
          accessright: 2,
          canbeglobal: true,
        })),
      },
    });

    const details = await fetchRolePrivileges(env, client, "Salesperson");
    const privilegeCalls = calls.filter((call) => call.entitySet === "privileges");

    expect(details.privileges).toHaveLength(privilegeCount);
    expect(privilegeCalls).toHaveLength(2);
    expect(privilegeCalls[0]?.queryParams).toContain("privilegeid eq 'priv-1'");
    expect(privilegeCalls[1]?.queryParams).toContain("privilegeid eq 'priv-41'");
  });

  it("uses the default global business unit when business unit is not provided", async () => {
    const { client, calls } = createRecordingClient({
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
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-1",
            roleid: "role-root",
            privilegeid: "priv-1",
            privilegedepthmask: 8,
            ismanaged: false,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-1",
            name: "prvReadAccount",
            accessright: 2,
            canbeglobal: true,
          },
        ],
      },
    });

    const details = await fetchRolePrivileges(env, client, "Salesperson");

    expect(details.role.roleid).toBe("role-root");
    expect(details.role.businessUnitName).toBe("Root");
    expect(calls).toContainEqual(
      expect.objectContaining({
        environment: "dev",
        entitySet: "businessunits",
      }),
    );
  });
});
