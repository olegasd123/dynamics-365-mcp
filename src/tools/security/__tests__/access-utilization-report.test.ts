import { describe, expect, it } from "vitest";
import { registerAccessUtilizationReport } from "../access-utilization-report.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("access_utilization_report", () => {
  it("reports direct, team, and audit-active users for a security role", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        businessunits: [{ businessunitid: "bu-root", name: "Root" }],
        roles: [
          {
            roleid: "role-sales",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
        ],
        "roles(role-sales)/systemuserroles_association": [
          user("user-adele", "Adele Vance"),
          user("user-ben", "Ben Smith", { isdisabled: true }),
        ],
        "roles(role-sales)/teamroles_association": [
          {
            teamid: "team-east",
            name: "East Sales",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
        ],
        "teams(team-east)/teammembership_association": [user("user-cara", "Cara Green")],
        audits: [
          {
            auditid: "audit-1",
            _userid_value: "user-adele",
            createdon: "2026-04-01T00:00:00.000Z",
          },
          {
            auditid: "audit-2",
            _userid_value: "user-cara",
            createdon: "2026-04-02T00:00:00.000Z",
          },
        ],
      },
    });

    registerAccessUtilizationReport(server as never, config, client);
    const response = await server.getHandler("access_utilization_report")({
      environment: "dev",
      roleName: "Salesperson",
      activeWithinDays: 365,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("User activity depends on Dataverse audit data");
    expect(response.structuredContent?.data.counts).toMatchObject({
      assignedUsers: 3,
      disabledUsers: 1,
      directRoleUsers: 2,
      teamRoleUsers: 1,
      activeUsers: 2,
      noRecentAuditActivityUsers: 1,
      auditAvailable: true,
    });
  });

  it("expands app module roles to role family users", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        appmodules: [
          {
            appmoduleid: "app-sales",
            appmoduleidunique: "app-sales-unique",
            name: "Sales Hub",
            uniquename: "contoso_sales",
            statecode: 0,
          },
        ],
        "appmodules(app-sales)/appmoduleroles_association": [
          {
            roleid: "role-root",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            _parentrootroleid_value: "role-root",
          },
        ],
        roles: [
          {
            roleid: "role-root",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
            _parentrootroleid_value: "role-root",
          },
          {
            roleid: "role-child",
            name: "Salesperson",
            _businessunitid_value: "bu-child",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Child",
            _parentrootroleid_value: "role-root",
          },
        ],
        "roles(role-root)/systemuserroles_association": [user("user-root", "Root User")],
        "roles(role-root)/teamroles_association": [],
        "roles(role-child)/systemuserroles_association": [user("user-child", "Child User")],
        "roles(role-child)/teamroles_association": [],
        audits: [],
      },
    });

    registerAccessUtilizationReport(server as never, config, client);
    const response = await server.getHandler("access_utilization_report")({
      environment: "dev",
      appName: "Sales Hub",
      activeWithinDays: 365,
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent?.data.target).toMatchObject({
      type: "app_module",
      name: "Sales Hub",
    });
    expect(response.structuredContent?.data.counts).toMatchObject({
      assignedUsers: 2,
      directRoleUsers: 2,
      activeUsers: 0,
      noRecentAuditActivityUsers: 2,
    });
  });

  it("marks activity as unknown when audit cannot be read", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        businessunits: [{ businessunitid: "bu-root", name: "Root" }],
        roles: [
          {
            roleid: "role-sales",
            name: "Salesperson",
            _businessunitid_value: "bu-root",
            "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
          },
        ],
        "roles(role-sales)/systemuserroles_association": [user("user-adele", "Adele Vance")],
        "roles(role-sales)/teamroles_association": [],
      },
    });
    const failingAuditClient = client as unknown as {
      query: (
        env: never,
        entitySet: string,
        queryParams?: string,
        options?: unknown,
      ) => Promise<Record<string, unknown>[]>;
    };
    const originalQuery = failingAuditClient.query.bind(failingAuditClient);
    failingAuditClient.query = async (env, entitySet, queryParams, options) => {
      if (entitySet === "audits") {
        throw new Error("Audit is disabled");
      }

      return originalQuery(env, entitySet, queryParams, options);
    };

    registerAccessUtilizationReport(server as never, config, client);
    const response = await server.getHandler("access_utilization_report")({
      environment: "dev",
      roleName: "Salesperson",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Audit activity could not be read");
    expect(response.structuredContent?.data.counts).toMatchObject({
      activeUsers: null,
      noRecentAuditActivityUsers: null,
      unknownActivityUsers: 1,
      auditAvailable: false,
    });
  });
});

function user(
  systemuserid: string,
  fullname: string,
  options: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    systemuserid,
    fullname,
    domainname: `${fullname.toLowerCase().replace(/\s+/g, ".")}@contoso.com`,
    internalemailaddress: `${fullname.toLowerCase().replace(/\s+/g, ".")}@contoso.com`,
    _businessunitid_value: "bu-root",
    "_businessunitid_value@OData.Community.Display.V1.FormattedValue": "Root",
    isdisabled: false,
    islicensed: true,
    accessmode: 0,
    ...options,
  };
}
