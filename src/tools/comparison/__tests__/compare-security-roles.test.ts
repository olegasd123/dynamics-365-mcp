import { describe, expect, it } from "vitest";
import { registerCompareSecurityRoles } from "../compare-security-roles.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_security_roles", () => {
  it("shows privilege drift", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
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
            privilegedepthmask: 2,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-1",
            name: "prvReadAccount",
            accessright: 2,
          },
        ],
      },
      dev: {
        businessunits: [
          {
            businessunitid: "bu-1",
            name: "Root",
          },
        ],
        roles: [
          {
            roleid: "role-2",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-1",
            roleid: "role-2",
            privilegeid: "priv-1",
            privilegedepthmask: 8,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-1",
            name: "prvReadAccount",
            accessright: 2,
          },
        ],
      },
    });

    registerCompareSecurityRoles(server as never, config, client);
    const response = await server.getHandler("compare_security_roles")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      roleName: "Salesperson",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Privileges");
    expect(response.content[0].text).toContain("prvReadAccount");
    expect(response.content[0].text).toContain("depthDisplay");
  });
});
