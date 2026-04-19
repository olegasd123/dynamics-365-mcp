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
      },
    });
    expect(response.content[0]?.text).toContain("count='25'");
    expect(calls).toContainEqual({
      environment: "dev",
      entitySet: "accounts",
      queryParams:
        "fetchXml=%3Cfetch%20count%3D'25'%3E%3Centity%20name%3D'account'%3E%3Cattribute%20name%3D'name'%20%2F%3E%3C%2Fentity%3E%3C%2Ffetch%3E",
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
});
