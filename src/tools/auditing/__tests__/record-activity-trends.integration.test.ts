import { describe, expect, it } from "vitest";
import {
  handleRecordActivityTrends,
  registerRecordActivityTrends,
} from "../record-activity-trends.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const CONTACT_TABLE = createTable("contact", "Contact", "Contacts", true);
const ACCOUNT_TABLE = createTable("account", "Account", "Accounts", false);

describe("record_activity_trends tool", () => {
  it("reports daily created, modified, and deleted audit activity by table", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE, ACCOUNT_TABLE],
        audits: {
          "@odata.count": 4,
          value: [
            auditRecord("audit-1", "2026-04-20T08:15:00Z", "contact", 1, "Create"),
            auditRecord("audit-2", "2026-04-20T09:15:00Z", "contact", 2, "Update"),
            auditRecord("audit-3", "2026-04-21T10:15:00Z", "contact", 3, "Delete"),
            auditRecord("audit-4", "2026-04-21T11:15:00Z", "account", 2, "Update"),
          ],
        },
      },
    });

    const response = await handleRecordActivityTrends(
      {
        tables: ["contact", "account"],
        createdAfter: "2026-04-20T00:00:00Z",
        createdBefore: "2026-04-21T23:59:59Z",
        includeEmptyDays: true,
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "This report mostly depends on Dataverse audit data",
    );
    expect(response.content[0].text).toContain("Audit is disabled in table metadata for: account.");
    expect(response.content[0].text).toContain("## Record Activity Trends");
    expect(response.structuredContent).toMatchObject({
      tool: "record_activity_trends",
      ok: true,
      data: {
        scannedAuditRecordCount: 4,
        totalAuditRecordCount: 4,
        hasMore: false,
        summaries: [
          {
            tableLogicalName: "contact",
            created: 1,
            modified: 1,
            deleted: 1,
            total: 3,
            activeDays: 2,
          },
          {
            tableLogicalName: "account",
            created: 0,
            modified: 1,
            deleted: 0,
            total: 1,
            activeDays: 1,
          },
        ],
        dailyRows: expect.arrayContaining([
          expect.objectContaining({
            date: "2026-04-20",
            tableLogicalName: "contact",
            created: 1,
            modified: 1,
            deleted: 0,
            total: 2,
          }),
          expect.objectContaining({
            date: "2026-04-21",
            tableLogicalName: "contact",
            created: 0,
            modified: 0,
            deleted: 1,
            total: 1,
          }),
          expect.objectContaining({
            date: "2026-04-20",
            tableLogicalName: "account",
            total: 0,
          }),
        ]),
      },
    });
    expect(
      calls.some(
        (call) =>
          call.entitySet === "audits" &&
          call.queryParams?.includes("objecttypecode eq 'contact'") &&
          call.queryParams?.includes("objecttypecode eq 'account'") &&
          call.queryParams?.includes("createdon ge 2026-04-20T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("marks the report as truncated when maxRecords stops the audit scan", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        audits: {
          "@odata.count": 2,
          "@odata.nextLink": "https://next-audits",
          value: [auditRecord("audit-1", "2026-04-20T08:15:00Z", "contact", 1, "Create")],
        },
      },
    });

    const response = await handleRecordActivityTrends(
      {
        tables: ["contact"],
        createdAfter: "2026-04-20T00:00:00Z",
        createdBefore: "2026-04-20T23:59:59Z",
        maxRecords: 1,
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("The scan reached maxRecords=1");
    expect(response.structuredContent).toMatchObject({
      tool: "record_activity_trends",
      ok: true,
      data: {
        scannedAuditRecordCount: 1,
        totalAuditRecordCount: 2,
        hasMore: true,
      },
    });
  });

  it("registers through the MCP server wrapper", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        audits: {
          "@odata.count": 1,
          value: [auditRecord("audit-1", "2026-04-20T08:15:00Z", "contact", 1, "Create")],
        },
      },
    });

    registerRecordActivityTrends(server as never, config, client);

    const response = await server.getHandler("record_activity_trends")({
      tables: ["contact"],
      createdAfter: "2026-04-20T00:00:00Z",
      createdBefore: "2026-04-20T23:59:59Z",
    });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      tool: "record_activity_trends",
      ok: true,
      data: {
        scannedAuditRecordCount: 1,
      },
    });
  });
});

function createTable(
  logicalName: string,
  schemaName: string,
  collectionName: string,
  isAuditEnabled: boolean,
) {
  return {
    MetadataId: `table-${logicalName}`,
    LogicalName: logicalName,
    SchemaName: schemaName,
    DisplayName: { UserLocalizedLabel: { Label: schemaName } },
    DisplayCollectionName: { UserLocalizedLabel: { Label: collectionName } },
    Description: { UserLocalizedLabel: { Label: `${schemaName} table` } },
    EntitySetName: collectionName.toLowerCase(),
    PrimaryIdAttribute: `${logicalName}id`,
    PrimaryNameAttribute: "name",
    OwnershipType: { Value: "UserOwned" },
    IsCustomEntity: false,
    IsManaged: true,
    IsActivity: false,
    IsAuditEnabled: { Value: isAuditEnabled },
    IsValidForAdvancedFind: true,
    ChangeTrackingEnabled: false,
  };
}

function auditRecord(
  auditid: string,
  createdon: string,
  objecttypecode: string,
  operation: number,
  operationLabel: string,
) {
  return {
    auditid,
    createdon,
    operation,
    [`operation@OData.Community.Display.V1.FormattedValue`]: operationLabel,
    action: operation,
    [`action@OData.Community.Display.V1.FormattedValue`]: operationLabel,
    objecttypecode,
  };
}
