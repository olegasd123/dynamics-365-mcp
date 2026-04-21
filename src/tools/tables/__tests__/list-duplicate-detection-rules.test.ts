import { describe, expect, it } from "vitest";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleListDuplicateDetectionRules } from "../list-duplicate-detection-rules.js";

describe("list duplicate detection rules", () => {
  it("lists rules for a table with normalized conditions", async () => {
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
        duplicaterules: [
          {
            duplicateruleid: "rule-1",
            name: "Accounts with same name",
            uniquename: "account_same_name",
            baseentityname: "account",
            matchingentityname: "account",
            statuscode: 2,
            statecode: 1,
            iscasesensitive: false,
            excludeinactiverecords: true,
            ismanaged: false,
            createdon: "2026-04-01T08:00:00Z",
            modifiedon: "2026-04-20T08:00:00Z",
          },
          {
            duplicateruleid: "rule-2",
            name: "Leads matching accounts",
            uniquename: "lead_account_name",
            baseentityname: "lead",
            matchingentityname: "account",
            statuscode: 2,
            statecode: 1,
            iscasesensitive: true,
            excludeinactiverecords: false,
            ismanaged: true,
            createdon: "2026-04-02T08:00:00Z",
            modifiedon: "2026-04-19T08:00:00Z",
          },
        ],
        duplicateruleconditions: [
          {
            duplicateruleconditionid: "condition-1",
            baseattributename: "name",
            matchingattributename: "name",
            operatorcode: 0,
            operatorparam: null,
            ignoreblankvalues: false,
            uniquerulename: "account_same_name_name",
            _regardingobjectid_value: "rule-1",
          },
          {
            duplicateruleconditionid: "condition-2",
            baseattributename: "address1_postalcode",
            matchingattributename: "address1_postalcode",
            operatorcode: 1,
            operatorparam: 4,
            ignoreblankvalues: true,
            uniquerulename: "account_same_name_postal",
            _regardingobjectid_value: "rule-1",
          },
          {
            duplicateruleconditionid: "condition-3",
            baseattributename: "companyname",
            matchingattributename: "name",
            operatorcode: 2,
            operatorparam: 6,
            ignoreblankvalues: false,
            uniquerulename: "lead_account_name_company",
            _regardingobjectid_value: "rule-2",
          },
        ],
      },
    });

    const response = await handleListDuplicateDetectionRules(
      {
        environment: "dev",
        table: "account",
        status: "published",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).not.toBe(true);
    expect(response.content[0]?.text).toContain("## Duplicate Detection Rules");
    expect(response.content[0]?.text).toContain("Accounts with same name");
    expect(response.content[0]?.text).toContain("Leads matching accounts");
    expect(response.content[0]?.text).toContain("Same First Characters");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "list_duplicate_detection_rules",
      ok: true,
      data: {
        environment: "dev",
        table: {
          logicalName: "account",
        },
        status: "published",
        totalCount: 2,
        returnedCount: 2,
        publishedCount: 2,
        items: [
          {
            duplicateRuleId: "rule-1",
            name: "Accounts with same name",
            baseTable: "account",
            matchingTable: "account",
            statusLabel: "Published",
            ignoreCase: true,
            excludeInactiveRecords: true,
            conditions: [
              {
                baseAttributeName: "address1_postalcode",
                matchingAttributeName: "address1_postalcode",
                operatorLabel: "Same First Characters",
                operatorParam: 4,
                ignoreCase: true,
                effectiveIgnoreBlankValues: true,
              },
              {
                baseAttributeName: "name",
                matchingAttributeName: "name",
                operatorLabel: "Exact Match",
                ignoreCase: true,
                effectiveIgnoreBlankValues: false,
              },
            ],
          },
          {
            duplicateRuleId: "rule-2",
            name: "Leads matching accounts",
            baseTable: "lead",
            matchingTable: "account",
            statusLabel: "Published",
            ignoreCase: false,
            isManaged: true,
            conditions: [
              {
                baseAttributeName: "companyname",
                matchingAttributeName: "name",
                operatorLabel: "Same Last Characters",
                operatorParam: 6,
                ignoreCase: false,
                effectiveIgnoreBlankValues: true,
              },
            ],
          },
        ],
      },
    });
    expect(calls.map((call) => call.entitySet)).toEqual([
      "EntityDefinitions",
      "duplicaterules",
      "duplicateruleconditions",
    ]);
    expect(calls[1]?.queryParams).toContain("baseentityname eq 'account'");
    expect(calls[1]?.queryParams).toContain("matchingentityname eq 'account'");
    expect(calls[1]?.queryParams).toContain("statuscode eq 2");
  });

  it("returns an empty list when no rules match", async () => {
    const { client } = createRecordingClient({
      dev: {
        duplicaterules: [],
      },
    });

    const response = await handleListDuplicateDetectionRules(
      {
        environment: "dev",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.content[0]?.text).toContain("No duplicate detection rules found.");
    expect(response.structuredContent).toMatchObject({
      tool: "list_duplicate_detection_rules",
      ok: true,
      data: {
        totalCount: 0,
        returnedCount: 0,
        items: [],
      },
    });
  });
});
