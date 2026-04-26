import { describe, expect, it } from "vitest";
import { handleRunFetchXml } from "../run-fetchxml.js";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";

function createTableMetadataRecord() {
  return {
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
  };
}

describe("run_fetchxml", () => {
  it("runs a gated FetchXML query and applies the configured default limit", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
          defaultLimit: 25,
          maxLimit: 100,
        },
      },
    });
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
        accounts: [
          {
            accountid: "acc-1",
            name: "Acme",
          },
        ],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml: "<fetch><entity name='account'><attribute name='name' /></entity></fetch>",
      },
      { config, client },
    );

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      tool: "run_fetchxml",
      ok: true,
      data: {
        environment: "dev",
        entityName: "account",
        entitySetName: "accounts",
        appliedLimit: 25,
        limitSource: "default",
        returnedCount: 1,
        curatedToolHint: {
          tool: "get_table_record_details",
        },
      },
    });
    expect(response.content[0]?.text).toContain("count='25'");
    expect(response.content[0]?.text).toContain("Curated Alternative");
    expect(response.content[0]?.text).toContain("`get_table_record_details`");
    expect(calls).toContainEqual({
      environment: "dev",
      entitySet: "accounts",
      queryParams:
        "fetchXml=%3Cfetch%20count%3D'25'%3E%3Centity%20name%3D'account'%3E%3Cattribute%20name%3D'name'%20%2F%3E%3C%2Fentity%3E%3C%2Ffetch%3E",
    });
  });

  it("replaces a fetch top attribute with count when a limit is provided", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
          defaultLimit: 25,
          maxLimit: 100,
        },
      },
    });
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
        accounts: [{ accountid: "acc-1", name: "Acme" }],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml:
          "<fetch top='5'><entity name='account'><attribute name='name' /></entity></fetch>",
        limit: 10,
      },
      { config, client },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("<fetch count='10'>");
    expect(response.content[0]?.text).not.toContain("top='");
    expect(calls).toContainEqual({
      environment: "dev",
      entitySet: "accounts",
      queryParams:
        "fetchXml=%3Cfetch%20count%3D'10'%3E%3Centity%20name%3D'account'%3E%3Cattribute%20name%3D'name'%20%2F%3E%3C%2Fentity%3E%3C%2Ffetch%3E",
    });
  });

  it("replaces a fetch top attribute with count when top is the only limit", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
          defaultLimit: 25,
          maxLimit: 100,
        },
      },
    });
    const { client, calls } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
        accounts: [{ accountid: "acc-1", name: "Acme" }],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml:
          "<fetch top='5'><entity name='account'><attribute name='name' /></entity></fetch>",
      },
      { config, client },
    );

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      ok: true,
      data: {
        appliedLimit: 5,
        limitSource: "fetchXml",
      },
    });
    expect(response.content[0]?.text).toContain("<fetch count='5'>");
    expect(response.content[0]?.text).not.toContain("top='");
    expect(calls).toContainEqual({
      environment: "dev",
      entitySet: "accounts",
      queryParams:
        "fetchXml=%3Cfetch%20count%3D'5'%3E%3Centity%20name%3D'account'%3E%3Cattribute%20name%3D'name'%20%2F%3E%3C%2Fentity%3E%3C%2Ffetch%3E",
    });
  });

  it("rejects FetchXML when the environment is not allowlisted", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
          allowedEnvironments: ["prod"],
        },
      },
    });
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml: "<fetch><entity name='account' /></fetch>",
      },
      { config, client },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain(
      "Environment 'dev' is not allowed for run_fetchxml",
    );
  });

  it("suggests list_table_records for simple filtered lists", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
        },
      },
    });
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
        accounts: [
          { accountid: "acc-1", name: "Acme" },
          { accountid: "acc-2", name: "Beta" },
        ],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml:
          "<fetch><entity name='account'><attribute name='name' /><filter><condition attribute='name' operator='like' value='A%' /></filter></entity></fetch>",
      },
      { config, client },
    );

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      ok: true,
      data: {
        curatedToolHint: {
          tool: "list_table_records",
        },
      },
    });
    expect(response.content[0]?.text).toContain("`list_table_records`");
  });

  it("suggests get_view_fetchxml for view-like FetchXML", async () => {
    const config = createTestConfig(["dev"], {
      advancedQueries: {
        fetchXml: {
          enabled: true,
        },
      },
    });
    const { client } = createRecordingClient({
      dev: {
        EntityDefinitions: [createTableMetadataRecord()],
        accounts: [{ accountid: "acc-1", name: "Acme" }],
      },
    });

    const response = await handleRunFetchXml(
      {
        environment: "dev",
        table: "account",
        fetchXml:
          "<fetch><entity name='account'><attribute name='name' /><order attribute='name' descending='false' /><filter><condition attribute='statecode' operator='eq' value='0' /></filter></entity></fetch>",
      },
      { config, client },
    );

    expect(response.isError).not.toBe(true);
    expect(response.structuredContent).toMatchObject({
      ok: true,
      data: {
        curatedToolHint: {
          tool: "get_view_fetchxml",
        },
      },
    });
    expect(response.content[0]?.text).toContain("`get_view_fetchxml`");
  });
});
