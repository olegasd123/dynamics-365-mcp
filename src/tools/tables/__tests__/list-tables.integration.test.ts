import { describe, expect, it } from "vitest";
import { registerListTables } from "../list-tables.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_tables tool", () => {
  it("returns text and structured content", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            Description: { UserLocalizedLabel: { Label: "Main account table" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: true,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
        ],
      },
    });

    registerListTables(server as never, config, client);

    const response = await server.getHandler("list_tables")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Tables in 'dev'");
    expect(response.content[0].text).toContain("account");

    expect(response.structuredContent).toMatchObject({
      tool: "list_tables",
      ok: true,
      data: {
        environment: "dev",
        limit: 50,
        cursor: null,
        returnedCount: 1,
        totalCount: 1,
        hasMore: false,
        nextCursor: null,
      },
    });

    const payload = response.structuredContent as {
      data: {
        items: Array<{ logicalName: string; flags: string }>;
        returnedCount: number;
        totalCount: number;
      };
    };
    expect(payload.data.returnedCount).toBe(1);
    expect(payload.data.totalCount).toBe(1);
    expect(payload.data.items[0].logicalName).toBe("account");
    expect(payload.data.items[0].flags).toContain("Managed");
  });

  it("filters tables in code when nameFilter is provided", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            Description: { UserLocalizedLabel: { Label: "Main account table" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: true,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
          {
            MetadataId: "table-2",
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
          },
        ],
      },
    });

    registerListTables(server as never, config, client);

    const response = await server.getHandler("list_tables")({ nameFilter: "contact" });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("contact");
    expect(response.content[0].text).not.toContain("account");

    const payload = response.structuredContent as {
      data: { returnedCount: number; totalCount: number; items: Array<{ logicalName: string }> };
    };
    expect(payload.data.returnedCount).toBe(1);
    expect(payload.data.totalCount).toBe(1);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]?.logicalName).toBe("contact");
  });

  it("supports paging with limit and cursor", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            Description: { UserLocalizedLabel: { Label: "Account table" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: true,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
          {
            MetadataId: "table-2",
            LogicalName: "contact",
            SchemaName: "Contact",
            DisplayName: { UserLocalizedLabel: { Label: "Contact" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Contacts" } },
            Description: { UserLocalizedLabel: { Label: "Contact table" } },
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
          },
          {
            MetadataId: "table-3",
            LogicalName: "lead",
            SchemaName: "Lead",
            DisplayName: { UserLocalizedLabel: { Label: "Lead" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Leads" } },
            Description: { UserLocalizedLabel: { Label: "Lead table" } },
            EntitySetName: "leads",
            PrimaryIdAttribute: "leadid",
            PrimaryNameAttribute: "subject",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: true,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
        ],
      },
    });

    registerListTables(server as never, config, client);

    const firstPageResponse = await server.getHandler("list_tables")({ limit: 2 });
    const firstPagePayload = firstPageResponse.structuredContent as {
      data: {
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ logicalName: string }>;
      };
    };

    expect(firstPageResponse.content[0].text).toContain("Showing 2 of 3 tables.");
    expect(firstPagePayload.data.returnedCount).toBe(2);
    expect(firstPagePayload.data.totalCount).toBe(3);
    expect(firstPagePayload.data.hasMore).toBe(true);
    expect(firstPagePayload.data.nextCursor).toBe("2");
    expect(firstPagePayload.data.items.map((item) => item.logicalName)).toEqual([
      "account",
      "contact",
    ]);

    const secondPageResponse = await server.getHandler("list_tables")({
      limit: 2,
      cursor: "2",
    });
    const secondPagePayload = secondPageResponse.structuredContent as {
      data: {
        cursor: string | null;
        returnedCount: number;
        totalCount: number;
        hasMore: boolean;
        nextCursor: string | null;
        items: Array<{ logicalName: string }>;
      };
    };

    expect(secondPagePayload.data.cursor).toBe("2");
    expect(secondPagePayload.data.returnedCount).toBe(1);
    expect(secondPagePayload.data.totalCount).toBe(3);
    expect(secondPagePayload.data.hasMore).toBe(false);
    expect(secondPagePayload.data.nextCursor).toBeNull();
    expect(secondPagePayload.data.items.map((item) => item.logicalName)).toEqual(["lead"]);
  });
});
