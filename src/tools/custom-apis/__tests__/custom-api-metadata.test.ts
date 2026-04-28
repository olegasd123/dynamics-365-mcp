import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import type { DynamicsClient } from "../../../client/dynamics-client.js";
import { createRecordingClient, createTestConfig } from "../../__tests__/tool-test-helpers.js";
import { handleGetCustomApiDetails } from "../get-custom-api-details.js";
import {
  fetchCustomApiDetails,
  fetchCustomApiInventory,
  listCustomApis,
  type CustomApiRecord,
} from "../custom-api-metadata.js";

describe("custom api metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists custom apis and resolves request and response metadata", async () => {
    const { client } = createRecordingClient({
      dev: {
        customapis: [
          {
            customapiid: "api-1",
            name: "Do Thing",
            uniquename: "contoso_DoThing",
            displayname: "Do Thing",
            bindingtype: 0,
            isfunction: false,
            isprivate: false,
            allowedcustomprocessingsteptype: 2,
            workflowsdkstepenabled: true,
            ismanaged: false,
            statecode: 0,
          },
        ],
        customapirequestparameters: [
          {
            customapirequestparameterid: "req-1",
            _customapiid_value: "api-1",
            name: "Target",
            uniquename: "contoso_Target",
            type: 5,
            isoptional: false,
            logicalentityname: "account",
            ismanaged: false,
            statecode: 0,
          },
        ],
        customapiresponseproperties: [
          {
            customapiresponsepropertyid: "resp-1",
            _customapiid_value: "api-1",
            name: "ResultId",
            uniquename: "contoso_ResultId",
            type: 12,
            logicalentityname: "",
            ismanaged: false,
            statecode: 0,
          },
        ],
      },
    });

    const apis = await listCustomApis(env, client);
    const details = await fetchCustomApiDetails(env, client, "contoso_DoThing");

    expect(apis).toHaveLength(1);
    expect(apis[0]).toMatchObject({
      name: "Do Thing",
      bindingTypeLabel: "Global",
      allowedProcessingStepLabel: "Sync And Async",
    });
    expect(details.requestParameters).toEqual([
      expect.objectContaining({
        name: "Target",
        typeLabel: "EntityReference",
        isoptional: false,
      }),
    ]);
    expect(details.responseProperties).toEqual([
      expect.objectContaining({
        name: "ResultId",
        typeLabel: "Guid",
      }),
    ]);
  });

  it("chunks child metadata queries for many custom apis", async () => {
    const apis = Array.from({ length: 30 }, (_, index) => ({
      customapiid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `API ${index + 1}`,
      uniquename: `contoso_Api${index + 1}`,
    })) as CustomApiRecord[];

    const requestRecords = apis.map((api) => ({
      customapirequestparameterid: `req-${api.customapiid}`,
      _customapiid_value: api.customapiid,
      name: `Request ${api.customapiid}`,
      uniquename: `Request_${api.customapiid}`,
      type: 10,
      isoptional: false,
      logicalentityname: "",
      ismanaged: false,
      statecode: 0,
    }));
    const responseRecords = apis.map((api) => ({
      customapiresponsepropertyid: `resp-${api.customapiid}`,
      _customapiid_value: api.customapiid,
      name: `Response ${api.customapiid}`,
      uniquename: `Response_${api.customapiid}`,
      type: 10,
      logicalentityname: "",
      ismanaged: false,
      statecode: 0,
    }));

    const requestQueries: string[] = [];
    const responseQueries: string[] = [];
    const client = {
      async query<T>(_: EnvironmentConfig, entitySet: string, queryParams?: string): Promise<T[]> {
        const apiIds = extractQuotedIds(queryParams);

        if (entitySet === "customapirequestparameters") {
          requestQueries.push(String(queryParams || ""));
          return requestRecords.filter((record) =>
            apiIds.includes(record._customapiid_value),
          ) as T[];
        }

        if (entitySet === "customapiresponseproperties") {
          responseQueries.push(String(queryParams || ""));
          return responseRecords.filter((record) =>
            apiIds.includes(record._customapiid_value),
          ) as T[];
        }

        return [];
      },
    } as DynamicsClient;

    const inventory = await fetchCustomApiInventory(env, client, apis);

    expect(inventory.requestParameters).toHaveLength(30);
    expect(inventory.responseProperties).toHaveLength(30);
    expect(requestQueries).toHaveLength(2);
    expect(responseQueries).toHaveLength(2);
    expect(countFilterTerms(requestQueries[0])).toBeLessThanOrEqual(25);
    expect(countFilterTerms(requestQueries[1])).toBeLessThanOrEqual(25);
    expect(countFilterTerms(responseQueries[0])).toBeLessThanOrEqual(25);
    expect(countFilterTerms(responseQueries[1])).toBeLessThanOrEqual(25);
  });

  it("returns structured retry options when the custom api name is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        customapis: [
          {
            customapiid: "api-1",
            name: "Do Thing",
            uniquename: "contoso_DoThing_A",
          },
          {
            customapiid: "api-2",
            name: "Do Thing",
            uniquename: "contoso_DoThing_B",
          },
        ],
      },
    });

    const response = await handleGetCustomApiDetails(
      {
        environment: "dev",
        apiName: "Do Thing",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a custom API and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_custom_api_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "apiName",
        options: [
          { value: "contoso_DoThing_A", label: "Do Thing (contoso_DoThing_A)" },
          { value: "contoso_DoThing_B", label: "Do Thing (contoso_DoThing_B)" },
        ],
        retryable: false,
      },
    });
  });
});

function extractQuotedIds(queryParams?: string): string[] {
  return [...String(queryParams || "").matchAll(/_customapiid_value eq ([0-9a-f-]+)/g)].map(
    (match) => match[1],
  );
}

function countFilterTerms(queryParams: string): number {
  return (queryParams.match(/_customapiid_value eq/g) || []).length;
}
