import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleGetRolePrivileges } from "../get-role-privileges.js";
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
    expect(privilegeCalls[0]?.queryParams).toContain("privilegeid eq ");
    expect(privilegeCalls[1]?.queryParams).toContain("privilegeid eq ");
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

  it("loads Managers from the root business unit when no business unit is provided", async () => {
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
            name: "Managers",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
          {
            roleid: "role-child",
            name: "Managers",
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

    const response = await handleGetRolePrivileges(
      {
        environment: "dev",
        roleName: "Managers",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("## Security Role: Managers");
    expect(response.content[0]?.text).toContain("- Business Unit: Root");
    expect(response.structuredContent).toMatchObject({
      tool: "get_role_privileges",
      ok: true,
      data: {
        businessUnit: "Root",
        role: {
          roleid: "role-root",
          name: "Managers",
          businessUnitName: "Root",
        },
      },
    });
  });

  it("accepts a business unit id when resolving role privileges", async () => {
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root",
            name: "Root",
          },
          {
            businessunitid: "bu-child",
            name: "Duplicate",
            _parentbusinessunitid_value: "bu-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
          {
            businessunitid: "bu-child-2",
            name: "Duplicate",
            _parentbusinessunitid_value: "bu-root",
            "_parentbusinessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
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
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Duplicate",
            ismanaged: false,
          },
          {
            roleid: "role-child-2",
            name: "Salesperson",
            _businessunitid_value: "bu-child-2",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Duplicate",
            ismanaged: false,
          },
        ],
        roleprivilegescollection: [
          {
            roleprivilegeid: "rp-1",
            roleid: "role-child-2",
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

    const details = await fetchRolePrivileges(env, client, "Salesperson", "bu-child-2");

    expect(details.role.roleid).toBe("role-child-2");
    expect(details.role.businessUnitName).toBe("Duplicate");
  });

  it("returns structured retry options when the role name is ambiguous", async () => {
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
          {
            roleid: "role-2",
            name: "Salesperson",
            _businessunitid_value: "bu-1",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            ismanaged: false,
          },
        ],
      },
    });

    const response = await handleGetRolePrivileges(
      {
        environment: "dev",
        roleName: "Salesperson",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a role and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_role_privileges",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "roleName",
        options: [
          { value: "role-1", label: "Salesperson [Root] (role-1)" },
          { value: "role-2", label: "Salesperson [Root] (role-2)" },
        ],
        retryable: false,
      },
    });
  });

  it("returns structured retry options when the default business unit is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        businessunits: [
          {
            businessunitid: "bu-root-1",
            name: "Root One",
          },
          {
            businessunitid: "bu-root-2",
            name: "Root Two",
          },
        ],
        roles: [],
      },
    });

    const response = await handleGetRolePrivileges(
      {
        environment: "dev",
        roleName: "Salesperson",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Default global business unit is ambiguous");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_role_privileges",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "businessUnit",
        options: [
          { value: "bu-root-1", label: "Root One" },
          { value: "bu-root-2", label: "Root Two" },
        ],
        retryable: false,
      },
    });
  });
});
