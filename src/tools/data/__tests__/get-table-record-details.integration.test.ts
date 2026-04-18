import { describe, expect, it } from "vitest";
import {
  handleGetTableRecordDetails,
  registerGetTableRecordDetails,
} from "../get-table-record-details.js";
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
  createColumn("new_customfield", "Custom Field", "String"),
  createColumn("jobtitle", "Job Title", "String"),
  createColumn("statecode", "State", "State"),
  createColumn("statuscode", "Status", "Status"),
  createColumn("createdon", "Created On", "DateTime"),
  createColumn("modifiedon", "Modified On", "DateTime"),
];

describe("get_table_record_details tool", () => {
  it("returns a compact field set by default", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
      },
    });

    registerGetTableRecordDetails(server as never, config, client);

    const response = await server.getHandler("get_table_record_details")({
      recordId: "contact-1",
      table: "contact",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Record: Anna Smith");
    expect(response.content[0].text).toContain("anna@example.com");
    expect(response.structuredContent).toMatchObject({
      tool: "get_table_record_details",
      ok: true,
      data: {
        record: {
          recordId: "contact-1",
          label: "Anna Smith",
        },
      },
    });

    const payload = response.structuredContent as {
      data: {
        record: {
          fields: Array<{ logicalName: string; value: string }>;
        };
      };
    };
    expect(response.content[0].text).not.toContain("Custom Field");
    expect(
      payload.data.record.fields.some((field) => field.logicalName === "new_customfield"),
    ).toBe(false);
    expect(payload.data.record.fields.some((field) => field.logicalName === "jobtitle")).toBe(true);
    expect(payload.data.record.fields.length).toBeLessThan(CONTACT_COLUMNS.length);
  });

  it("includes all readable fields when includeAllFields is true", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
      },
    });

    const response = await handleGetTableRecordDetails(
      {
        includeAllFields: true,
        recordId: "contact-1",
        table: "contact",
      },
      { config, client },
    );

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Custom Field");

    const payload = response.structuredContent as {
      data: {
        fieldPage: {
          totalCount: number;
        };
        record: {
          fields: Array<{ logicalName: string }>;
        };
      };
    };
    expect(payload.data.fieldPage.totalCount).toBe(CONTACT_COLUMNS.length);
    expect(
      payload.data.record.fields.some((field) => field.logicalName === "new_customfield"),
    ).toBe(true);
  });

  it("returns structured retry options when a last name is ambiguous", async () => {
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [
          contactRecord("contact-1", "Anna Smith", "anna@example.com"),
          contactRecord("contact-2", "John Smith", "john@example.com"),
        ],
      },
    });

    const response = await handleGetTableRecordDetails(
      {
        lastName: "Smith",
        table: "contact",
      },
      { config, client },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Record 'Smith' is ambiguous");
    expect(response.structuredContent).toMatchObject({
      tool: "get_table_record_details",
      ok: false,
      error: {
        code: "ambiguous_match",
        parameter: "recordId",
        options: [{ value: "contact-1" }, { value: "contact-2" }],
      },
    });
    expect(
      calls.some(
        (call) =>
          call.entitySet === "contacts" &&
          call.queryParams?.includes("lastname eq 'Smith'") &&
          call.queryParams?.includes("statecode eq 0"),
      ),
    ).toBe(true);
  });

  it("supports client-side paging across all readable metadata fields", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
      },
    });

    const firstPage = await handleGetTableRecordDetails(
      {
        includeAllFields: true,
        limit: 2,
        recordId: "contact-1",
        table: "contact",
      },
      { config, client },
    );

    expect(firstPage.isError).toBeUndefined();
    expect(firstPage.content[0].text).toContain("Showing 2 of");

    const firstPayload = firstPage.structuredContent as {
      data: {
        fieldPage: {
          nextCursor: string | null;
          returnedCount: number;
          totalCount: number;
          hasMore: boolean;
        };
        record: {
          fields: Array<{ logicalName: string }>;
        };
      };
    };
    expect(firstPayload.data.fieldPage.returnedCount).toBe(2);
    expect(firstPayload.data.fieldPage.totalCount).toBe(CONTACT_COLUMNS.length);
    expect(firstPayload.data.fieldPage.hasMore).toBe(true);
    expect(firstPayload.data.record.fields).toHaveLength(2);

    const secondPage = await handleGetTableRecordDetails(
      {
        cursor: firstPayload.data.fieldPage.nextCursor || undefined,
        includeAllFields: true,
        limit: 2,
        recordId: "contact-1",
        table: "contact",
      },
      { config, client },
    );

    expect(secondPage.isError).toBeUndefined();
    const secondPayload = secondPage.structuredContent as {
      data: {
        record: {
          fields: Array<{ logicalName: string }>;
        };
      };
    };
    expect(secondPayload.data.record.fields).toHaveLength(2);
  });

  it("rejects field cursors from a different field selection mode", async () => {
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [CONTACT_TABLE],
        "EntityDefinitions(LogicalName='contact')/Attributes": CONTACT_COLUMNS,
        contacts: [contactRecord("contact-1", "Anna Smith", "anna@example.com")],
      },
    });

    const firstPage = await handleGetTableRecordDetails(
      {
        includeAllFields: true,
        limit: 2,
        recordId: "contact-1",
        table: "contact",
      },
      { config, client },
    );

    const firstPayload = firstPage.structuredContent as {
      data: {
        fieldPage: {
          nextCursor: string | null;
        };
      };
    };

    const response = await handleGetTableRecordDetails(
      {
        cursor: firstPayload.data.fieldPage.nextCursor || undefined,
        limit: 2,
        recordId: "contact-1",
        table: "contact",
      },
      { config, client },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("different field selection mode");
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
    new_customfield: "Custom Value",
    statecode: 0,
    [`statecode@OData.Community.Display.V1.FormattedValue`]: "Active",
    statuscode: 1,
    [`statuscode@OData.Community.Display.V1.FormattedValue`]: "Active",
    createdon: "2026-04-01T00:00:00Z",
    modifiedon: "2026-04-02T00:00:00Z",
  };
}
