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
});
