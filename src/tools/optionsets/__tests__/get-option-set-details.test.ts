import { describe, expect, it } from "vitest";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleGetOptionSetDetails } from "../get-option-set-details.js";

describe("get_option_set_details", () => {
  it("returns full details for a boolean global option set", async () => {
    const metadataId = "00000000-0000-0000-0000-000000000010";
    const { client } = createRecordingClient({
      dev: {
        GlobalOptionSetDefinitions: [
          {
            MetadataId: metadataId,
            Name: "contoso_yesno",
            DisplayName: { UserLocalizedLabel: { Label: "Contoso Yes/No" } },
            Description: { UserLocalizedLabel: { Label: "Shared boolean choice" } },
            OptionSetType: { Value: "Boolean" },
            IsGlobal: true,
            IsManaged: false,
            IsCustomOptionSet: true,
            ParentOptionSetName: "",
            Options: [],
          },
        ],
        [`GlobalOptionSetDefinitions(${metadataId})`]: {
          MetadataId: metadataId,
          Name: "contoso_yesno",
          DisplayName: { UserLocalizedLabel: { Label: "Contoso Yes/No" } },
          Description: { UserLocalizedLabel: { Label: "Shared boolean choice" } },
          OptionSetType: { Value: "Boolean" },
          IsGlobal: true,
          IsManaged: false,
          IsCustomOptionSet: true,
          ParentOptionSetName: "",
          TrueOption: {
            MetadataId: "true-opt",
            Value: 1,
            Label: { UserLocalizedLabel: { Label: "Enabled" } },
            Description: { UserLocalizedLabel: { Label: "True branch" } },
            Color: "#00aa00",
            ExternalValue: "enabled",
            IsManaged: false,
          },
          FalseOption: {
            MetadataId: "false-opt",
            Value: 0,
            Label: { UserLocalizedLabel: { Label: "Disabled" } },
            Description: { UserLocalizedLabel: { Label: "False branch" } },
            Color: "#aa0000",
            ExternalValue: "disabled",
            IsManaged: false,
          },
        },
      },
    });

    const response = await handleGetOptionSetDetails(
      {
        environment: "dev",
        optionSet: "contoso_yesno",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("## Global Option Set: contoso_yesno");
    expect(response.content[0]?.text).toContain("### Options");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_option_set_details",
      ok: true,
      data: {
        environment: "dev",
        optionSet: {
          metadataId,
          name: "contoso_yesno",
          displayName: "Contoso Yes/No",
          optionSetType: "Boolean",
          optionCount: 2,
          options: [
            {
              metadataId: "false-opt",
              value: 0,
              label: "Disabled",
            },
            {
              metadataId: "true-opt",
              value: 1,
              label: "Enabled",
            },
          ],
        },
      },
    });
  });

  it("returns structured retry options when the option set is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        GlobalOptionSetDefinitions: [
          {
            MetadataId: "00000000-0000-0000-0000-000000000011",
            Name: "contoso_priority",
            DisplayName: { UserLocalizedLabel: { Label: "Priority" } },
            OptionSetType: { Value: "Picklist" },
            IsGlobal: true,
            IsManaged: false,
            IsCustomOptionSet: true,
            ParentOptionSetName: "",
            Options: [{ Value: 1 }],
          },
          {
            MetadataId: "00000000-0000-0000-0000-000000000012",
            Name: "contoso_priority_level",
            DisplayName: { UserLocalizedLabel: { Label: "Priority" } },
            OptionSetType: { Value: "Picklist" },
            IsGlobal: true,
            IsManaged: false,
            IsCustomOptionSet: true,
            ParentOptionSetName: "",
            Options: [{ Value: 1 }],
          },
        ],
      },
    });

    const response = await handleGetOptionSetDetails(
      {
        environment: "dev",
        optionSet: "Priority",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose an option set and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_option_set_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "optionSet",
        options: [
          {
            value: "00000000-0000-0000-0000-000000000011",
            label: "contoso_priority (Priority) [00000000-0000-0000-0000-000000000011]",
          },
          {
            value: "00000000-0000-0000-0000-000000000012",
            label: "contoso_priority_level (Priority) [00000000-0000-0000-0000-000000000012]",
          },
        ],
        retryable: false,
      },
    });
  });
});
