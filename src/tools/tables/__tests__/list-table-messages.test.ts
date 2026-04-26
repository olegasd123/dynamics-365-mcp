import { describe, expect, it } from "vitest";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleListTableMessages } from "../list-table-messages.js";

describe("list table messages", () => {
  it("lists platform SDK messages, bound actions, and bound custom APIs for a table", async () => {
    const { client, calls } = createRecordingClient({
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
              name: "Create",
            },
          },
          {
            sdkmessagefilterid: "filter-2",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-2",
              name: "Update",
            },
          },
          {
            sdkmessagefilterid: "filter-3",
            primaryobjecttypecode: "account",
            iscustomprocessingstepallowed: false,
            sdkmessageid: {
              sdkmessageid: "msg-3",
              name: "Retrieve",
            },
          },
          {
            sdkmessagefilterid: "filter-4",
            primaryobjecttypecode: "contact",
            iscustomprocessingstepallowed: true,
            sdkmessageid: {
              sdkmessageid: "msg-4",
              name: "Delete",
            },
          },
        ],
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Submit",
            uniquename: "contoso_AccountSubmit",
            category: 3,
            statecode: 1,
            primaryentity: "account",
            ismanaged: false,
            modifiedon: "2026-04-20T08:00:00Z",
          },
          {
            workflowid: "wf-2",
            name: "Contact Submit",
            uniquename: "contoso_ContactSubmit",
            category: 3,
            statecode: 1,
            primaryentity: "contact",
            ismanaged: false,
            modifiedon: "2026-04-20T08:00:00Z",
          },
        ],
        customapis: [
          {
            customapiid: "api-1",
            name: "Recalculate Account Score",
            uniquename: "contoso_RecalculateAccountScore",
            bindingtype: 1,
            boundentitylogicalname: "account",
            isfunction: false,
            isprivate: false,
            allowedcustomprocessingsteptype: 2,
            workflowsdkstepenabled: true,
            ismanaged: false,
            statecode: 0,
            modifiedon: "2026-04-20T08:00:00Z",
          },
          {
            customapiid: "api-2",
            name: "List Account Signals",
            uniquename: "contoso_ListAccountSignals",
            bindingtype: 2,
            boundentitylogicalname: "account",
            isfunction: true,
            isprivate: false,
            allowedcustomprocessingsteptype: 1,
            workflowsdkstepenabled: false,
            ismanaged: false,
            statecode: 0,
            modifiedon: "2026-04-20T08:00:00Z",
          },
          {
            customapiid: "api-3",
            name: "Global Utility",
            uniquename: "contoso_GlobalUtility",
            bindingtype: 0,
            boundentitylogicalname: "",
            isfunction: false,
            isprivate: false,
            allowedcustomprocessingsteptype: 0,
            workflowsdkstepenabled: false,
            ismanaged: false,
            statecode: 0,
            modifiedon: "2026-04-20T08:00:00Z",
          },
        ],
      },
    });

    const response = await handleListTableMessages(
      {
        environment: "dev",
        table: "account",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("## Table Messages: account");
    expect(response.content[0]?.text).toContain("### Platform SDK Messages");
    expect(response.content[0]?.text).toContain("### Bound Custom Actions");
    expect(response.content[0]?.text).toContain("### Bound Custom APIs");
    expect(response.content[0]?.text).toContain("Retrieve");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "list_table_messages",
      ok: true,
      data: {
        environment: "dev",
        table: {
          logicalName: "account",
        },
        counts: {
          sdkMessages: 3,
          customActions: 1,
          customApis: 2,
        },
        sdkMessages: [
          {
            name: "Create",
            customProcessingStepAllowed: true,
          },
          {
            name: "Retrieve",
            customProcessingStepAllowed: false,
          },
          {
            name: "Update",
            customProcessingStepAllowed: true,
          },
        ],
        customActions: [
          {
            name: "Account Submit",
            uniquename: "contoso_AccountSubmit",
            stateLabel: "Activated",
          },
        ],
        customApis: [
          {
            name: "List Account Signals",
            bindingTypeLabel: "Entity Collection",
            stateLabel: "Active",
          },
          {
            name: "Recalculate Account Score",
            bindingTypeLabel: "Entity",
            stateLabel: "Active",
          },
        ],
      },
    });
    expect(calls.map((call) => call.entitySet)).toEqual([
      "EntityDefinitions",
      "sdkmessagefilters",
      "workflows",
      "customapis",
    ]);
  });

  it("aggregates duplicate sdk message filters into one message row", async () => {
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
        ],
        workflows: [],
        customapis: [],
      },
    });

    const response = await handleListTableMessages(
      {
        environment: "dev",
        table: "account",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.structuredContent).toMatchObject({
      tool: "list_table_messages",
      ok: true,
      data: {
        counts: {
          sdkMessages: 1,
          customActions: 0,
          customApis: 0,
        },
        sdkMessages: [
          {
            name: "Update",
            filterIds: ["filter-1", "filter-2"],
            customProcessingStepAllowed: true,
          },
        ],
      },
    });
  });
});
