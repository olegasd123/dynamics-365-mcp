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

  it("returns structured retry options when the source role is ambiguous", async () => {
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
            roleid: "role-1",
            privilegeid: "priv-2",
            privilegedepthmask: 8,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-2",
            name: "prvWriteAccount",
            accessright: 3,
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
            roleid: "role-3",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-3",
            roleid: "role-3",
            privilegeid: "priv-2",
            privilegedepthmask: 8,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-2",
            name: "prvWriteAccount",
            accessright: 3,
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

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Choose a role and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "compare_security_roles",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "sourceRoleName",
        options: [
          { value: "role-1", label: "Salesperson [Root] (role-1)" },
          { value: "role-2", label: "Salesperson [Root] (role-2)" },
        ],
        retryable: false,
      },
    });
  });

  it("returns structured retry options when the source business unit is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        businessunits: [
          {
            businessunitid: "bu-1",
            name: "Root One",
          },
          {
            businessunitid: "bu-2",
            name: "Root Two",
          },
        ],
        roles: [],
        roleprivilegescollection: [],
        privileges: [],
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
            roleid: "role-3",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-3",
            roleid: "role-3",
            privilegeid: "priv-2",
            privilegedepthmask: 8,
          },
        ],
        privileges: [
          {
            privilegeid: "priv-2",
            name: "prvWriteAccount",
            accessright: 3,
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

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Default global business unit is ambiguous");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "compare_security_roles",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "sourceBusinessUnit",
        options: [
          { value: "bu-1", label: "Root One" },
          { value: "bu-2", label: "Root Two" },
        ],
        retryable: false,
      },
    });
  });

  it("uses business unit ids to disambiguate duplicate business unit names", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        businessunits: [
          {
            businessunitid: "prod-root",
            name: "Root",
          },
        ],
        roles: [
          {
            roleid: "prod-role",
            name: "Salesperson",
            _businessunitid_value: "prod-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [],
        privileges: [],
      },
      dev: {
        businessunits: [
          {
            businessunitid: "dev-root",
            name: "Root",
          },
          {
            businessunitid: "dev-duplicate-1",
            name: "Duplicate",
            _parentbusinessunitid_value: "dev-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
          {
            businessunitid: "dev-duplicate-2",
            name: "Duplicate",
            _parentbusinessunitid_value: "dev-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
        ],
        roles: [
          {
            roleid: "dev-role-1",
            name: "Salesperson",
            _businessunitid_value: "dev-duplicate-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Duplicate",
            ismanaged: false,
          },
          {
            roleid: "dev-role-2",
            name: "Salesperson",
            _businessunitid_value: "dev-duplicate-2",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Duplicate",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [],
        privileges: [],
      },
    });

    registerCompareSecurityRoles(server as never, config, client);
    const response = await server.getHandler("compare_security_roles")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      roleName: "Salesperson",
      targetBusinessUnit: "dev-duplicate-2",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      ok: true,
      data: {
        targetBusinessUnit: "Duplicate",
        roleComparison: {
          differences: [
            expect.objectContaining({
              target: expect.objectContaining({
                roleid: "dev-role-2",
                businessunitid: "dev-duplicate-2",
              }),
            }),
          ],
        },
      },
    });
  });
});
