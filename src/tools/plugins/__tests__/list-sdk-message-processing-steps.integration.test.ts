import { describe, expect, it } from "vitest";
import { registerListSdkMessageProcessingSteps } from "../list-sdk-message-processing-steps.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("list_sdk_message_processing_steps tool", () => {
  it("lists org-wide steps for one message and table with images", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        sdkmessages: [
          {
            sdkmessageid: "11111111-1111-1111-1111-111111111111",
            name: "Update",
          },
        ],
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
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Update Pre",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            filteringattributes: "name,emailaddress1",
            sdkmessageid: { sdkmessageid: "msg-1", name: "Update" },
            sdkmessagefilterid: {
              sdkmessagefilterid: "filter-1",
              primaryobjecttypecode: "account",
            },
            eventhandler_plugintype: {
              plugintypeid: "type-1",
              name: "AccountPlugin",
              typename: "Core.Plugins.AccountPlugin",
              pluginassemblyid: {
                pluginassemblyid: "asm-1",
                name: "Core.Plugins",
              },
            },
            impersonatinguserid: {
              systemuserid: "user-1",
              fullname: "Integration User",
            },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-2",
            name: "Account Update Workflow Activity",
            stage: 40,
            mode: 1,
            rank: 2,
            statecode: 0,
            filteringattributes: "",
            sdkmessageid: { sdkmessageid: "msg-1", name: "Update" },
            sdkmessagefilterid: {
              sdkmessagefilterid: "filter-1",
              primaryobjecttypecode: "account",
            },
            eventhandler_plugintype: {
              plugintypeid: "type-2",
              name: "AccountWorkflowActivity",
              typename: "Core.Workflow.AccountWorkflowActivity",
              isworkflowactivity: true,
              pluginassemblyid: {
                pluginassemblyid: "asm-2",
                name: "Core.Workflow",
              },
            },
          },
          {
            sdkmessageprocessingstepid: "step-3",
            name: "Orphaned Account Update",
            stage: 40,
            mode: 0,
            rank: 3,
            statecode: 0,
            sdkmessageid: { sdkmessageid: "msg-1", name: "Update" },
            sdkmessagefilterid: {
              sdkmessagefilterid: "filter-1",
              primaryobjecttypecode: "account",
            },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "image-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name",
            messagepropertyname: "Target",
          },
        ],
      },
    });

    registerListSdkMessageProcessingSteps(server as never, config, client);

    const response = await server.getHandler("list_sdk_message_processing_steps")({
      message: "Update",
      primaryEntity: "account",
      statecode: "enabled",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("Found 3 step(s)");
    expect(response.content[0]?.text).toContain("Core.Plugins");
    expect(response.content[0]?.text).toContain("Workflow Activity");
    expect(response.content[0]?.text).toContain("(unknown assembly)");
    expect(response.content[0]?.text).toContain("PreImage");
    const payload = response.structuredContent as { data: { count: number } };
    expect(payload.data.count).toBe(3);
    expect(calls.map((call) => call.entitySet)).toEqual([
      "EntityDefinitions",
      "sdkmessages",
      "sdkmessageprocessingsteps",
      "sdkmessageprocessingstepimages",
    ]);
  });

  it("defaults to enabled steps and can skip images", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        sdkmessages: [
          {
            sdkmessageid: "22222222-2222-2222-2222-222222222222",
            name: "Create",
          },
        ],
        sdkmessageprocessingsteps: [],
      },
    });

    registerListSdkMessageProcessingSteps(server as never, config, client);

    const response = await server.getHandler("list_sdk_message_processing_steps")({
      message: "Create",
      includeImages: false,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain("No SDK message processing steps found");
    expect(calls).toHaveLength(2);
    expect(calls[0]?.entitySet).toBe("sdkmessages");
    expect(calls[1]?.queryParams).toContain("statecode eq 0");
    expect(calls[1]?.queryParams).toContain("_sdkmessageid_value eq");
    expect(calls[1]?.queryParams).not.toContain("tolower(sdkmessageid/name)");
  });

  it("does not compare the message id column with a message name", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            LogicalName: "mso_facturation",
            SchemaName: "mso_Facturation",
            DisplayName: { UserLocalizedLabel: { Label: "Facturation" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Facturations" } },
            EntitySetName: "mso_facturations",
            PrimaryIdAttribute: "mso_facturationid",
            PrimaryNameAttribute: "mso_name",
          },
        ],
        sdkmessages: [
          {
            sdkmessageid: "22222222-2222-2222-2222-222222222222",
            name: "Create",
          },
        ],
        sdkmessageprocessingsteps: [],
      },
    });

    registerListSdkMessageProcessingSteps(server as never, config, client);

    const response = await server.getHandler("list_sdk_message_processing_steps")({
      message: "Create",
      primaryEntity: "mso_facturation",
      includeImages: false,
    });

    expect(response.isError).toBeUndefined();
    expect(calls[0]?.entitySet).toBe("EntityDefinitions");
    expect(calls[1]?.entitySet).toBe("sdkmessages");
    expect(calls[2]?.queryParams).toContain("_sdkmessageid_value eq");
    expect(calls[2]?.queryParams).toContain(
      "sdkmessagefilterid/primaryobjecttypecode eq 'mso_facturation'",
    );
    expect(calls[2]?.queryParams).not.toContain("tolower(sdkmessageid/name)");
  });
});
