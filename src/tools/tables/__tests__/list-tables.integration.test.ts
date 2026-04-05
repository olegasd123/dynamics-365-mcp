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
        count: 1,
      },
    });

    const payload = response.structuredContent as {
      data: { items: Array<{ logicalName: string; flags: string }> };
    };
    expect(payload.data.items[0].logicalName).toBe("account");
    expect(payload.data.items[0].flags).toContain("Managed");
  });
});
