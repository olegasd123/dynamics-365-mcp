import { describe, expect, it } from "vitest";
import { handleGetAuditDetails, registerGetAuditDetails } from "../get-audit-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_audit_details tool", () => {
  it("returns attribute change details with old and new values", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        "audits(audit-1)": {
          auditid: "audit-1",
          createdon: "2026-04-20T08:15:00Z",
          objecttypecode: "contact",
          _objectid_value: "contact-1",
          [`_objectid_value@OData.Community.Display.V1.FormattedValue`]: "Anna Smith",
          action: 2,
          [`action@OData.Community.Display.V1.FormattedValue`]: "Update",
          operation: 2,
          [`operation@OData.Community.Display.V1.FormattedValue`]: "Update",
          _userid_value: "user-1",
          [`_userid_value@OData.Community.Display.V1.FormattedValue`]: "Adele Vance",
          changedata: "emailaddress1 changed",
          transactionid: "txn-1",
        },
        "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": {
          AuditDetail: {
            "@odata.type": "#Microsoft.Dynamics.CRM.AttributeAuditDetail",
            OldValue: {
              "@odata.type": "#Microsoft.Dynamics.CRM.contact",
              emailaddress1: "old@example.com",
            },
            NewValue: {
              "@odata.type": "#Microsoft.Dynamics.CRM.contact",
              emailaddress1: "new@example.com",
            },
          },
        },
      },
    });

    const response = await handleGetAuditDetails(
      {
        auditId: "audit-1",
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Audit Record: audit-1");
    expect(response.content[0].text).toContain("### Changed Fields");
    expect(response.content[0].text).toContain("emailaddress1");
    expect(response.content[0].text).toContain("new@example.com");
    expect(response.structuredContent).toMatchObject({
      tool: "get_audit_details",
      ok: true,
      data: {
        audit: {
          auditId: "audit-1",
          tableLogicalName: "contact",
        },
        detail: {
          detailType: "AttributeAuditDetail",
          changedFields: [{ logicalName: "emailaddress1" }],
        },
      },
    });
    expect(
      calls.some(
        (call) => call.entitySet === "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails",
      ),
    ).toBe(true);
  });

  it("returns relationship detail sections", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        "audits(audit-2)": {
          auditid: "audit-2",
          createdon: "2026-04-20T08:15:00Z",
          objecttypecode: "account",
          action: 1,
          [`action@OData.Community.Display.V1.FormattedValue`]: "Associate",
          operation: 1,
          [`operation@OData.Community.Display.V1.FormattedValue`]: "Associate",
        },
        "audits(audit-2)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": {
          AuditDetail: {
            "@odata.type": "#Microsoft.Dynamics.CRM.RelationshipAuditDetail",
            RelationshipName: "account_primary_contact",
            TargetRecords: [
              {
                "@odata.type": "#Microsoft.Dynamics.CRM.contact",
                fullname: "Anna Smith",
              },
            ],
          },
        },
      },
    });

    const response = await handleGetAuditDetails(
      {
        auditId: "audit-2",
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("### Relationship");
    expect(response.content[0].text).toContain("account_primary_contact");
    expect(response.content[0].text).toContain("Anna Smith (contact)");
    expect(response.structuredContent).toMatchObject({
      tool: "get_audit_details",
      ok: true,
      data: {
        detail: {
          detailType: "RelationshipAuditDetail",
        },
      },
    });
  });

  it("registers through the MCP server wrapper", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        "audits(audit-1)": {
          auditid: "audit-1",
          createdon: "2026-04-20T08:15:00Z",
          objecttypecode: "contact",
          action: 2,
          [`action@OData.Community.Display.V1.FormattedValue`]: "Update",
          operation: 2,
          [`operation@OData.Community.Display.V1.FormattedValue`]: "Update",
        },
        "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": {
          AuditDetail: {
            "@odata.type": "#Microsoft.Dynamics.CRM.UserAccessAuditDetail",
            AccessTime: "2026-04-20T08:00:00Z",
            Interval: 4,
          },
        },
      },
    });

    registerGetAuditDetails(server as never, config, client);

    const response = await server.getHandler("get_audit_details")({
      auditId: "audit-1",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      tool: "get_audit_details",
      ok: true,
      data: {
        detail: {
          detailType: "UserAccessAuditDetail",
        },
      },
    });
  });
});
