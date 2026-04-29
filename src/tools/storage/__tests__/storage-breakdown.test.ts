import { describe, expect, it } from "vitest";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";
import { registerStorageBreakdown } from "../storage-breakdown.js";

describe("storage_breakdown tool", () => {
  it("builds an estimated storage signal report from organization, counts, and columns", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        "RetrieveCurrentOrganization(AccessType=@p1)": {
          Detail: {
            FriendlyName: "Contoso Dev",
            OrganizationId: "org-1",
            EnvironmentId: "env-1",
            OrganizationVersion: "9.2.1.0",
            OrganizationType: { Value: "CustomerTest" },
            Geo: "NAM",
          },
        },
        EntityDefinitions: [
          tableDefinition("table-account", "account", "Account", "Account", "accounts"),
          tableDefinition("table-annotation", "annotation", "Annotation", "Note", "annotations"),
          tableDefinition(
            "table-document",
            "new_document",
            "new_Document",
            "Document",
            "new_documents",
            true,
          ),
          tableDefinition(
            "table-plugintracelog",
            "plugintracelog",
            "PluginTraceLog",
            "Plug-in Trace Log",
            "plugintracelogs",
          ),
        ],
        "RetrieveTotalRecordCount(EntityNames=['account','annotation','new_document','plugintracelog'])":
          {
            EntityRecordCountCollection: {
              Keys: ["account", "annotation", "new_document", "plugintracelog"],
              Values: [20, 1000, 3, 20000],
            },
          },
        "EntityDefinitions(LogicalName='new_document')/Attributes": [
          {
            MetadataId: "column-documentid",
            LogicalName: "new_documentid",
            SchemaName: "new_DocumentId",
            DisplayName: { UserLocalizedLabel: { Label: "Document" } },
            AttributeTypeName: { Value: "UniqueidentifierType" },
          },
          {
            MetadataId: "column-file",
            LogicalName: "new_file",
            SchemaName: "new_File",
            DisplayName: { UserLocalizedLabel: { Label: "File" } },
            AttributeTypeName: { Value: "FileType" },
          },
        ],
      },
    });

    registerStorageBreakdown(server as never, config, client);

    const response = await server.getHandler("storage_breakdown")({
      tables: ["account", "annotation", "new_document", "plugintracelog"],
      includeColumns: true,
      columnScanLimit: 10,
      limit: 10,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Storage Breakdown");
    expect(response.content[0].text).toContain("File And Database");
    expect(response.content[0].text).toContain("new_file");
    expect(response.structuredContent).toMatchObject({
      tool: "storage_breakdown",
      ok: true,
      data: {
        environment: "dev",
        organization: {
          friendlyName: "Contoso Dev",
          organizationType: "CustomerTest",
        },
        analyzedTableCount: 4,
        totalKnownRowCount: 21023,
        columnScan: {
          enabled: true,
          scannedTableCount: 4,
          scanLimit: 10,
        },
        bucketSummary: [
          {
            key: "database",
            tableCount: 1,
            rowCount: 20,
          },
          {
            key: "file_database",
            tableCount: 2,
            rowCount: 1003,
          },
          {
            key: "log",
            tableCount: 1,
            rowCount: 20000,
          },
        ],
        tables: [
          {
            logicalName: "plugintracelog",
            rowCount: 20000,
            storageSignal: "log",
          },
          {
            logicalName: "annotation",
            rowCount: 1000,
            storageSignal: "file_database",
          },
          {
            logicalName: "account",
            rowCount: 20,
            storageSignal: "database",
          },
          {
            logicalName: "new_document",
            rowCount: 3,
            storageSignal: "file_database",
            fileOrImageColumns: [
              {
                logicalName: "new_file",
                attributeType: "File",
              },
            ],
          },
        ],
      },
    });

    expect(calls.map((call) => call.entitySet)).toContain(
      "RetrieveTotalRecordCount(EntityNames=['account','annotation','new_document','plugintracelog'])",
    );
    expect(calls.map((call) => call.entitySet)).toContain(
      "EntityDefinitions(LogicalName='new_document')/Attributes",
    );
  });
});

function tableDefinition(
  metadataId: string,
  logicalName: string,
  schemaName: string,
  displayName: string,
  entitySetName: string,
  isCustomEntity = false,
) {
  return {
    MetadataId: metadataId,
    ObjectTypeCode: logicalName,
    LogicalName: logicalName,
    SchemaName: schemaName,
    DisplayName: { UserLocalizedLabel: { Label: displayName } },
    DisplayCollectionName: { UserLocalizedLabel: { Label: `${displayName}s` } },
    EntitySetName: entitySetName,
    PrimaryIdAttribute: `${logicalName}id`,
    PrimaryNameAttribute: "name",
    OwnershipType: { Value: "UserOwned" },
    IsCustomEntity: isCustomEntity,
    IsManaged: false,
    IsActivity: false,
    IsAuditEnabled: { Value: false },
    IsValidForAdvancedFind: true,
    ChangeTrackingEnabled: false,
  };
}
