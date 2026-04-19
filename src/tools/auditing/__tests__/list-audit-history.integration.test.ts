import { describe, expect, it } from "vitest";
import { handleListAuditHistory, registerListAuditHistory } from "../list-audit-history.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const CONTACT_TABLE = {
  MetadataId: "table-contact",
  LogicalName: "contact",
  SchemaName: "Contact",
  DisplayName: { UserLocalizedLabel: { Label: "Contact" } },
  DisplayCollectionName: { UserLocalizedLabel: { Label: "Contacts" } },
  Description: { UserLocalizedLabel: { Label: "Main contact table" } },
  EntitySetName: "contacts",
  PrimaryIdAttribute: "contactid",
  PrimaryNameAttribute: "fullname",
  OwnershipType: { Value: "UserOwned" },
  IsCustomEntity: false,
  IsManaged: true,
  IsActivity: false,
  IsAuditEnabled: { Value: true },
  IsValidForAdvancedFind: true,
  ChangeTrackingEnabled: false,
};

const CONTACT_COLUMNS = [
  createColumn("contactid", "Contact", "Uniqueidentifier", { isPrimaryId: true }),
  createColumn("fullname", "Full Name", "String", { isPrimaryName: true }),
  createColumn("firstname", "First Name", "String"),
  createColumn("lastname", "Last Name", "String"),
  createColumn("emailaddress1", "Email", "String"),
  createColumn("statecode", "State", "State"),
  createColumn("statuscode", "Status", "Status"),
  createColumn("createdon", "Created On", "DateTime"),
  createColumn("modifiedon", "Modified On", "DateTime"),
];

describe("list_audit_history tool", () => {
  it("lists table audit history over a time window and keeps Dataverse paging", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        audits: {
          "@odata.count": 2,
          "@odata.nextLink": "https://next-audits",
          value: [auditRecord("audit-1", "contact-1", "Anna Smith", "Update")],
        },
        "https://next-audits": {
          value: [auditRecord("audit-2", "contact-2", "John Smith", "Create")],
        },
      },
    });

    const firstPage = await handleListAuditHistory(
      {
        table: "contact",
        createdAfter: "2026-04-20T08:00:00Z",
        limit: 1,
      },
      { config, client },
    );

    expect(firstPage.isError).toBeUndefined();
    expect(firstPage.content[0].text).toContain("## Audit History for Table 'contact'");
    expect(firstPage.content[0].text).toContain("Showing 1 of 2 audit entries.");
    expect(firstPage.structuredContent).toMatchObject({
      tool: "list_audit_history",
      ok: true,
      data: {
        returnedCount: 1,
        totalCount: 2,
        hasMore: true,
      },
    });
    expect(
      calls.some(
        (call) =>
          call.entitySet === "audits" &&
          call.queryParams?.includes("objecttypecode eq 'contact'") &&
          call.queryParams?.includes("createdon ge 2026-04-20T08:00:00.000Z"),
      ),
    ).toBe(true);

    const nextCursor = (firstPage.structuredContent as { data: { nextCursor: string | null } }).data
      .nextCursor;
    const secondPage = await handleListAuditHistory(
      {
        table: "contact",
        createdAfter: "2026-04-20T08:00:00Z",
        limit: 1,
        cursor: nextCursor || undefined,
      },
      { config, client },
    );

    expect(secondPage.isError).toBeUndefined();
    expect(secondPage.content[0].text).toContain("John Smith");
    expect(calls.some((call) => call.entitySet === "https://next-audits")).toBe(true);
  });

  it("loads changed fields for a single record audit page", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
        audits: {
          "@odata.count": 1,
          value: [auditRecord("audit-1", "contact-1", "Anna Smith", "Update")],
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

    const response = await handleListAuditHistory(
      {
        table: "contact",
        recordId: "contact-1",
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Audit History for Record 'Anna Smith'");
    expect(response.content[0].text).toContain("emailaddress1");
    expect(
      calls.some(
        (call) => call.entitySet === "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails",
      ),
    ).toBe(true);
  });

  it("registers through the MCP server wrapper", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        audits: {
          "@odata.count": 1,
          value: [auditRecord("audit-1", "contact-1", "Anna Smith", "Update")],
        },
      },
    });

    registerListAuditHistory(server as never, config, client);

    const response = await server.getHandler("list_audit_history")({
      table: "contact",
      createdAfter: "2026-04-20T08:00:00Z",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      tool: "list_audit_history",
      ok: true,
      data: {
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
      },
    });
  });

  it("rejects cursor reuse when the page limit changes", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        audits: {
          "@odata.count": 2,
          "@odata.nextLink": "https://next-audits",
          value: [auditRecord("audit-1", "contact-1", "Anna Smith", "Update")],
        },
      },
    });

    const firstPage = await handleListAuditHistory(
      {
        table: "contact",
        createdAfter: "2026-04-20T08:00:00Z",
        limit: 1,
      },
      { config, client },
    );
    const nextCursor = (firstPage.structuredContent as { data: { nextCursor: string | null } }).data
      .nextCursor;

    const response = await handleListAuditHistory(
      {
        table: "contact",
        createdAfter: "2026-04-20T08:00:00Z",
        limit: 2,
        cursor: nextCursor || undefined,
      },
      { config, client },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("same limit value");
  });
});

function createColumn(
  logicalName: string,
  label: string,
  attributeType: string,
  options?: {
    isPrimaryId?: boolean;
    isPrimaryName?: boolean;
  },
) {
  return {
    MetadataId: `${logicalName}-meta`,
    LogicalName: logicalName,
    SchemaName: logicalName,
    DisplayName: { UserLocalizedLabel: { Label: label } },
    Description: { UserLocalizedLabel: { Label: `${label} field` } },
    AttributeType: attributeType,
    AttributeTypeName: { Value: attributeType },
    RequiredLevel: { Value: "None" },
    IsPrimaryId: Boolean(options?.isPrimaryId),
    IsPrimaryName: Boolean(options?.isPrimaryName),
    IsAuditEnabled: { Value: true },
    IsValidForAdvancedFind: true,
    IsValidForCreate: true,
    IsValidForRead: true,
    IsValidForUpdate: true,
    IsCustomAttribute: false,
    IsSecured: false,
  };
}

function auditRecord(auditid: string, objectId: string, objectLabel: string, operation: string) {
  return {
    auditid,
    createdon: "2026-04-20T08:15:00Z",
    operation: 2,
    [`operation@OData.Community.Display.V1.FormattedValue`]: operation,
    action: 2,
    [`action@OData.Community.Display.V1.FormattedValue`]: operation,
    objecttypecode: "contact",
    _objectid_value: objectId,
    [`_objectid_value@OData.Community.Display.V1.FormattedValue`]: objectLabel,
    _userid_value: "user-1",
    [`_userid_value@OData.Community.Display.V1.FormattedValue`]: "Adele Vance",
    changedata: `${operation} row`,
    transactionid: `txn-${auditid}`,
  };
}

function contactRecord(contactid: string, fullname: string, emailaddress1: string) {
  return {
    contactid,
    fullname,
    firstname: fullname.split(" ")[0],
    lastname: fullname.split(" ")[1] || "",
    emailaddress1,
    statecode: 0,
    [`statecode@OData.Community.Display.V1.FormattedValue`]: "Active",
    statuscode: 1,
    [`statuscode@OData.Community.Display.V1.FormattedValue`]: "Active",
    createdon: "2026-04-01T10:00:00Z",
    modifiedon: "2026-04-20T11:00:00Z",
  };
}
