import { describe, expect, it } from "vitest";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleListGlobalOptionSets } from "../list-global-option-sets.js";

describe("list_global_option_sets", () => {
  it("lists shared option sets with pagination metadata", async () => {
    const { client } = createRecordingClient({
      dev: {
        GlobalOptionSetDefinitions: [
          {
            MetadataId: "00000000-0000-0000-0000-000000000001",
            Name: "contoso_priority",
            DisplayName: { UserLocalizedLabel: { Label: "Priority" } },
            Description: { UserLocalizedLabel: { Label: "Shared priority choices" } },
            OptionSetType: { Value: "Picklist" },
            IsGlobal: true,
            IsManaged: false,
            IsCustomOptionSet: true,
            ParentOptionSetName: "",
            Options: [{ Value: 1 }, { Value: 2 }, { Value: 3 }],
          },
          {
            MetadataId: "00000000-0000-0000-0000-000000000002",
            Name: "contoso_region",
            DisplayName: { UserLocalizedLabel: { Label: "Region" } },
            Description: { UserLocalizedLabel: { Label: "Shared region choices" } },
            OptionSetType: { Value: "Picklist" },
            IsGlobal: true,
            IsManaged: true,
            IsCustomOptionSet: false,
            ParentOptionSetName: "",
            Options: [{ Value: 1 }, { Value: 2 }],
          },
        ],
      },
    });

    const response = await handleListGlobalOptionSets(
      {
        environment: "dev",
        nameFilter: "contoso",
        limit: 1,
        cursor: undefined,
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("## Global Option Sets in 'dev'");
    expect(response.content[0]?.text).toContain("Showing 1 of 2 global option sets.");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "list_global_option_sets",
      ok: true,
      data: {
        environment: "dev",
        filters: {
          nameFilter: "contoso",
        },
        returnedCount: 1,
        totalCount: 2,
        hasMore: true,
        nextCursor: "1",
        items: [
          {
            name: "contoso_priority",
            displayName: "Priority",
            optionSetType: "Picklist",
            optionCount: 3,
          },
        ],
      },
    });
  });
});
