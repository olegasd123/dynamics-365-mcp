import { describe, expect, it } from "vitest";
import { registerGetBpfDetails } from "../get-bpf-details.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("get_bpf_details tool", () => {
  it("renders BPF details including fields, stages, backing table, and runtime state", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "bpf-1",
            name: "Opportunity Sales Process",
            uniquename: "contoso_opportunitysalesprocess",
            category: 4,
            statecode: 1,
            mode: 0,
            scope: 4,
            primaryentity: "account",
            ismanaged: false,
            description: "Tracks the sales journey",
            clientdata: JSON.stringify({
              stages: [
                {
                  id: "stage-1",
                  stageName: "Qualify",
                  entityName: "account",
                  steps: [{ attributeName: "name" }, { attributeName: "budgetamount" }],
                },
                {
                  id: "stage-2",
                  stageName: "Develop",
                  entityName: "opportunity",
                  steps: [{ attributeName: "estimatedclosedate" }],
                },
              ],
            }),
            createdon: "2026-01-01T12:00:00Z",
            modifiedon: "2026-02-01T12:00:00Z",
          },
        ],
        processstages: [
          {
            processstageid: "stage-1",
            stagename: "Qualify",
            stagecategory: 0,
            primaryentitytypecode: "account",
            _processid_value: "bpf-1",
          },
          {
            processstageid: "stage-2",
            stagename: "Develop",
            stagecategory: 1,
            primaryentitytypecode: "opportunity",
            _processid_value: "bpf-1",
            _parentprocessstageid_value: "stage-1",
          },
        ],
        EntityDefinitions: [
          {
            MetadataId: "table-bpf",
            LogicalName: "contoso_opportunitysalesprocess",
            SchemaName: "contoso_opportunitysalesprocess",
            DisplayName: { UserLocalizedLabel: { Label: "Opportunity Sales Process" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Opportunity Sales Processes" } },
            Description: { UserLocalizedLabel: { Label: "BPF instance table" } },
            EntitySetName: "contoso_opportunitysalesprocesses",
            PrimaryIdAttribute: "contoso_opportunitysalesprocessid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: true,
            IsManaged: false,
            IsActivity: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
          {
            MetadataId: "table-account",
            LogicalName: "account",
            SchemaName: "Account",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
            Description: { UserLocalizedLabel: { Label: "Account" } },
            EntitySetName: "accounts",
            PrimaryIdAttribute: "accountid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: false,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
          {
            MetadataId: "table-opportunity",
            LogicalName: "opportunity",
            SchemaName: "Opportunity",
            DisplayName: { UserLocalizedLabel: { Label: "Opportunity" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Opportunities" } },
            Description: { UserLocalizedLabel: { Label: "Opportunity" } },
            EntitySetName: "opportunities",
            PrimaryIdAttribute: "opportunityid",
            PrimaryNameAttribute: "name",
            OwnershipType: { Value: "UserOwned" },
            IsCustomEntity: false,
            IsManaged: false,
            IsActivity: false,
            IsAuditEnabled: { Value: true },
            IsValidForAdvancedFind: true,
            ChangeTrackingEnabled: false,
          },
        ],
        "EntityDefinitions(LogicalName='contoso_opportunitysalesprocess')/Attributes": [
          {
            MetadataId: "col-name",
            LogicalName: "name",
            SchemaName: "Name",
            DisplayName: { UserLocalizedLabel: { Label: "Name" } },
            Description: { UserLocalizedLabel: { Label: "Name" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: true,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-stage",
            LogicalName: "activestageid",
            SchemaName: "ActiveStageId",
            DisplayName: { UserLocalizedLabel: { Label: "Active Stage" } },
            Description: { UserLocalizedLabel: { Label: "Active Stage" } },
            AttributeType: "Lookup",
            AttributeTypeName: { Value: "LookupType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-path",
            LogicalName: "traversedpath",
            SchemaName: "TraversedPath",
            DisplayName: { UserLocalizedLabel: { Label: "Traversed Path" } },
            Description: { UserLocalizedLabel: { Label: "Traversed Path" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-account",
            LogicalName: "bpf_accountid",
            SchemaName: "bpf_accountid",
            DisplayName: { UserLocalizedLabel: { Label: "Account" } },
            Description: { UserLocalizedLabel: { Label: "Account" } },
            AttributeType: "Lookup",
            AttributeTypeName: { Value: "LookupType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-state",
            LogicalName: "statecode",
            SchemaName: "StateCode",
            DisplayName: { UserLocalizedLabel: { Label: "State" } },
            Description: { UserLocalizedLabel: { Label: "State" } },
            AttributeType: "State",
            AttributeTypeName: { Value: "StateType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-status",
            LogicalName: "statuscode",
            SchemaName: "StatusCode",
            DisplayName: { UserLocalizedLabel: { Label: "Status" } },
            Description: { UserLocalizedLabel: { Label: "Status" } },
            AttributeType: "Status",
            AttributeTypeName: { Value: "StatusType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "col-modified",
            LogicalName: "modifiedon",
            SchemaName: "ModifiedOn",
            DisplayName: { UserLocalizedLabel: { Label: "Modified On" } },
            Description: { UserLocalizedLabel: { Label: "Modified On" } },
            AttributeType: "DateTime",
            AttributeTypeName: { Value: "DateTimeType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: false,
            IsValidForRead: true,
            IsValidForUpdate: false,
            IsCustomAttribute: false,
            IsSecured: false,
          },
        ],
        "EntityDefinitions(LogicalName='contoso_opportunitysalesprocess')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata":
          [
            {
              MetadataId: "col-stage",
              LogicalName: "activestageid",
              Targets: ["processstage"],
            },
            {
              MetadataId: "col-account",
              LogicalName: "bpf_accountid",
              Targets: ["account"],
            },
          ],
        "EntityDefinitions(LogicalName='account')/Attributes": [
          {
            MetadataId: "account-name",
            LogicalName: "name",
            SchemaName: "Name",
            DisplayName: { UserLocalizedLabel: { Label: "Account Name" } },
            Description: { UserLocalizedLabel: { Label: "Account Name" } },
            AttributeType: "String",
            AttributeTypeName: { Value: "StringType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: true,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
          {
            MetadataId: "account-budgetamount",
            LogicalName: "budgetamount",
            SchemaName: "BudgetAmount",
            DisplayName: { UserLocalizedLabel: { Label: "Budget Amount" } },
            Description: { UserLocalizedLabel: { Label: "Budget Amount" } },
            AttributeType: "Money",
            AttributeTypeName: { Value: "MoneyType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
        ],
        "EntityDefinitions(LogicalName='opportunity')/Attributes": [
          {
            MetadataId: "opp-estimatedclosedate",
            LogicalName: "estimatedclosedate",
            SchemaName: "EstimatedCloseDate",
            DisplayName: { UserLocalizedLabel: { Label: "Estimated Close Date" } },
            Description: { UserLocalizedLabel: { Label: "Estimated Close Date" } },
            AttributeType: "DateTime",
            AttributeTypeName: { Value: "DateTimeType" },
            RequiredLevel: { Value: "None" },
            IsPrimaryId: false,
            IsPrimaryName: false,
            IsAuditEnabled: { Value: false },
            IsValidForAdvancedFind: true,
            IsValidForCreate: true,
            IsValidForRead: true,
            IsValidForUpdate: true,
            IsCustomAttribute: false,
            IsSecured: false,
          },
        ],
        contoso_opportunitysalesprocesses: {
          value: [
            {
              contoso_opportunitysalesprocessid: "inst-1",
              name: "Opportunity Sales Process #1",
              _activestageid_value: "stage-2",
              "_activestageid_value@OData.Community.Display.V1.FormattedValue": "Develop",
              traversedpath: "stage-1,stage-2",
              statecode: 0,
              "statecode@OData.Community.Display.V1.FormattedValue": "Active",
              statuscode: 1,
              "statuscode@OData.Community.Display.V1.FormattedValue": "Active",
              modifiedon: "2026-02-15T12:00:00Z",
            },
          ],
          "@odata.count": 1,
        },
      },
    });

    registerGetBpfDetails(server as never, config, client);

    const response = await server.getHandler("get_bpf_details")({
      uniqueName: "contoso_opportunitysalesprocess",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Business Process Flow: Opportunity Sales Process");
    expect(text).toContain("Backing BPF Table");
    expect(text).toContain("### Fields Used");
    expect(text).toContain("budgetamount");
    expect(text).toContain("estimatedclosedate");
    expect(text).toContain("### Stages");
    expect(text).toContain("Qualify");
    expect(text).toContain("Develop");
    expect(text).toContain("### Runtime Behavior");
    expect(text).toContain("Opportunity Sales Process #1");
    expect(text).toContain("Qualify -> Develop");

    expect(response.structuredContent).toMatchObject({
      tool: "get_bpf_details",
      ok: true,
      data: {
        environment: "dev",
        found: true,
        bpf: {
          name: "Opportunity Sales Process",
          uniqueName: "contoso_opportunitysalesprocess",
          primaryEntity: "account",
          backingTable: {
            logicalName: "contoso_opportunitysalesprocess",
          },
          fieldsUsed: expect.arrayContaining([
            expect.objectContaining({ logicalName: "budgetamount" }),
            expect.objectContaining({ logicalName: "estimatedclosedate" }),
          ]),
          stages: expect.arrayContaining([
            expect.objectContaining({ stageName: "Qualify" }),
            expect.objectContaining({ stageName: "Develop" }),
          ]),
          runtimeSummary: expect.objectContaining({
            totalCount: 1,
          }),
        },
      },
    });
  });

  it("returns an error when the matched workflow is not a BPF", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            category: 3,
          },
        ],
      },
    });

    registerGetBpfDetails(server as never, config, client);

    const response = await server.getHandler("get_bpf_details")({
      uniqueName: "contoso_AccountSync",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("is not a business process flow");
  });
});
