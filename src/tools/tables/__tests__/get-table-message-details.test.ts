import { describe, expect, it } from "vitest";
import {
  createRecordingClient,
  createTestConfig,
  denormalizeFixtureIds,
} from "../../__tests__/tool-test-helpers.js";
import { handleGetTableMessageDetails } from "../get-table-message-details.js";

describe("get table message details", () => {
  it("returns one SDK message with raw sdkmessagefilter context", async () => {
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
          },
        ],
        sdkmessagefilters: [
          {
            sdkmessagefilterid: "filter-1",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: false,
            sdkmessageid: {
              sdkmessageid: "msg-1",
              name: "Update",
            },
          },
          {
            sdkmessagefilterid: "filter-2",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-1",
              name: "Update",
            },
          },
          {
            sdkmessagefilterid: "filter-3",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-2",
              name: "Create",
            },
          },
        ],
      },
    });

    const response = denormalizeFixtureIds(
      await handleGetTableMessageDetails(
        {
          environment: "dev",
          table: "account",
          messageName: "Update",
        },
        {
          config: createTestConfig(["dev"]),
          client,
        },
      ),
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("## Table Message: Update");
    expect(response.content[0]?.text).toContain("### SDK Message Filters");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_table_message_details",
      ok: true,
      data: {
        environment: "dev",
        table: {
          logicalName: "account",
        },
        message: {
          name: "Update",
          sdkmessageid: "msg-1",
          customProcessingStepAllowed: true,
          filterIds: ["filter-1", "filter-2"],
        },
        filters: [
          {
            sdkmessagefilterid: "filter-1",
            primaryobjecttypecode: "account",
            sdkmessageid: "msg-1",
            messageName: "Update",
            customProcessingStepAllowed: false,
          },
          {
            sdkmessagefilterid: "filter-2",
            primaryobjecttypecode: "account",
            sdkmessageid: "msg-1",
            messageName: "Update",
            customProcessingStepAllowed: true,
          },
        ],
      },
    });
  });

  it("returns structured retry options when the SDK message is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
          },
        ],
        sdkmessagefilters: [
          {
            sdkmessagefilterid: "filter-1",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-1",
              name: "Associate",
            },
          },
          {
            sdkmessagefilterid: "filter-2",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-2",
              name: "Associate",
            },
          },
        ],
      },
    });

    const response = denormalizeFixtureIds(
      await handleGetTableMessageDetails(
        {
          environment: "dev",
          table: "account",
          messageName: "Associate",
        },
        {
          config: createTestConfig(["dev"]),
          client,
        },
      ),
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a message and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_table_message_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "messageName",
        options: [
          { value: "msg-1", label: "Associate (msg-1)" },
          { value: "msg-2", label: "Associate (msg-2)" },
        ],
        retryable: false,
      },
    });
  });
});
