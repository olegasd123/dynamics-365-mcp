import { describe, expect, it } from "vitest";
import { handleListTableRecords, registerListTableRecords } from "../list-table-records.js";
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

describe("list_table_records tool", () => {
  it("uses active state by default and keeps pagination on the Dataverse side", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: {
          "@odata.count": 3,
          "@odata.nextLink": "https://next-page",
          value: [
            contactRecord("contact-1", "Anna Smith", "anna@example.com"),
            contactRecord("contact-2", "John Smith", "john@example.com"),
          ],
        },
        "https://next-page": {
          value: [contactRecord("contact-3", "Zoe Stone", "zoe@example.com")],
        },
      },
    });

    const firstPage = await handleListTableRecords(
      {
        limit: 2,
        table: "contact",
      },
      { config, client },
    );

    expect(firstPage.isError).toBeUndefined();
    expect(firstPage.content[0].text).toContain("Showing 2 of 3 records.");
    expect(firstPage.content[0].text).toContain("Anna Smith");
    expect(firstPage.structuredContent).toMatchObject({
      tool: "list_table_records",
      ok: true,
      data: {
        environment: "dev",
        supportsStateFilter: true,
        returnedCount: 2,
        totalCount: 3,
        hasMore: true,
      },
    });

    expect(
      calls.some((call) => call.entitySet === "contacts" && call.queryParams?.includes("$top=2")),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.entitySet === "contacts" && call.queryParams?.includes("$filter=statecode eq 0"),
      ),
    ).toBe(true);

    const nextCursor = (firstPage.structuredContent as { data: { nextCursor: string | null } }).data
      .nextCursor;
    expect(nextCursor).toBeTruthy();

    const secondPage = await handleListTableRecords(
      {
        cursor: nextCursor || undefined,
        limit: 2,
        table: "contact",
      },
      { config, client },
    );

    expect(secondPage.content[0].text).toContain("Zoe Stone");
    expect(calls.some((call) => call.entitySet === "https://next-page")).toBe(true);
  });

  it("registers and returns structured content through the MCP server wrapper", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: {
          "@odata.count": 1,
          value: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
        },
      },
    });

    registerListTableRecords(server as never, config, client);

    const response = await server.getHandler("list_table_records")({ table: "contact" });

    expect(response.isError).toBeUndefined();
    expect(response.structuredContent).toMatchObject({
      tool: "list_table_records",
      ok: true,
      data: {
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
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
    IsAuditEnabled: { Value: false },
    IsValidForAdvancedFind: true,
    IsValidForCreate: true,
    IsValidForRead: true,
    IsValidForUpdate: true,
    IsCustomAttribute: false,
    IsSecured: false,
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
    createdon: "2026-04-01T00:00:00Z",
    modifiedon: "2026-04-02T00:00:00Z",
  };
}
