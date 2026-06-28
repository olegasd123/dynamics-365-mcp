import { describe, expect, it } from "vitest";
import {
  handleFieldChangeFrequency,
  registerFieldChangeFrequency,
} from "../field-change-frequency.js";
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
  createColumn("emailaddress1", "Email", "String"),
  createColumn("lastname", "Last Name", "String"),
  createColumn("telephone1", "Business Phone", "String"),
];

describe("field_change_frequency tool", () => {
  it("ranks changed fields from audit detail payloads", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        audits: {
          "@odata.count": 3,
          value: [
            auditRecord("audit-1", "contact-1", "Anna Smith", "Update", "Anna Admin"),
            auditRecord("audit-2", "contact-2", "John Smith", "Update", "John Admin"),
            auditRecord("audit-3", "contact-1", "Anna Smith", "Update", "Anna Admin"),
          ],
        },
        "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          emailaddress1: ["old-a@example.com", "new-a@example.com"],
          lastname: ["Smith", "Stone"],
        }),
        "audits(audit-2)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          emailaddress1: ["old-b@example.com", "new-b@example.com"],
        }),
        "audits(audit-3)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          telephone1: ["111", "222"],
        }),
      },
    });

    const response = await handleFieldChangeFrequency(
      {
        table: "contact",
        createdAfter: "2026-04-20T00:00:00Z",
        createdBefore: "2026-04-20T23:59:59Z",
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Field Change Frequency");
    expect(response.content[0].text).toContain("emailaddress1");
    expect(response.content[0].text).toContain("This report depends on Dataverse audit data");
    expect(response.structuredContent).toMatchObject({
      tool: "field_change_frequency",
      ok: true,
      data: {
        scannedAuditRecordCount: 3,
        includedAuditRecordCount: 3,
        entriesWithFieldDiff: 3,
        fields: [
          {
            logicalName: "emailaddress1",
            displayName: "Email",
            changeCount: 2,
            recordsChanged: 2,
            changedByUsers: 2,
            percentageOfFieldDiffEntries: 66.7,
          },
          {
            logicalName: "lastname",
            changeCount: 1,
          },
          {
            logicalName: "telephone1",
            changeCount: 1,
          },
        ],
      },
    });
    expect(
      calls.some(
        (call) =>
          call.entitySet === "audits" &&
          call.queryParams?.includes("objecttypecode eq 'contact'") &&
          call.queryParams?.includes("createdon ge 2026-04-20T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("can exclude likely system and integration user rows", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        audits: {
          "@odata.count": 2,
          value: [
            auditRecord("audit-1", "contact-1", "Anna Smith", "Update", "Anna Admin"),
            auditRecord("audit-2", "contact-2", "John Smith", "Update", "SYSTEM"),
          ],
        },
        "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          emailaddress1: ["old-a@example.com", "new-a@example.com"],
        }),
        "audits(audit-2)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          emailaddress1: ["old-b@example.com", "new-b@example.com"],
        }),
      },
    });

    const response = await handleFieldChangeFrequency(
      {
        table: "contact",
        createdAfter: "2026-04-20T00:00:00Z",
        createdBefore: "2026-04-20T23:59:59Z",
        includeSystemUsers: false,
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Some likely system or integration user rows");
    expect(response.structuredContent).toMatchObject({
      tool: "field_change_frequency",
      ok: true,
      data: {
        scannedAuditRecordCount: 2,
        includedAuditRecordCount: 1,
        fields: [
          {
            logicalName: "emailaddress1",
            changeCount: 1,
            actorBreakdown: {
              human: 1,
              automation: 0,
              unknown: 0,
            },
          },
        ],
      },
    });
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
          value: [auditRecord("audit-1", "contact-1", "Anna Smith", "Update", "Anna Admin")],
        },
        "audits(audit-1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails": auditDetail({
          emailaddress1: ["old@example.com", "new@example.com"],
        }),
      },
    });

    registerFieldChangeFrequency(server as never, config, client);

    const response = await server.getHandler("field_change_frequency")({
      table: "contact",
      createdAfter: "2026-04-20T00:00:00Z",
      createdBefore: "2026-04-20T23:59:59Z",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      tool: "field_change_frequency",
      ok: true,
      data: {
        scannedAuditRecordCount: 1,
        fields: [
          {
            logicalName: "emailaddress1",
            changeCount: 1,
          },
        ],
      },
    });
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

function auditRecord(
  auditid: string,
  objectId: string,
  objectLabel: string,
  operation: string,
  userName: string,
) {
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
    _userid_value: `${userName}-id`,
    [`_userid_value@OData.Community.Display.V1.FormattedValue`]: userName,
    transactionid: `txn-${auditid}`,
  };
}

function auditDetail(changes: Record<string, [string, string]>) {
  return {
    AuditDetail: {
      "@odata.type": "#Microsoft.Dynamics.CRM.AttributeAuditDetail",
      OldValue: {
        "@odata.type": "#Microsoft.Dynamics.CRM.contact",
        ...Object.fromEntries(Object.entries(changes).map(([field, values]) => [field, values[0]])),
      },
      NewValue: {
        "@odata.type": "#Microsoft.Dynamics.CRM.contact",
        ...Object.fromEntries(Object.entries(changes).map(([field, values]) => [field, values[1]])),
      },
    },
  };
}
