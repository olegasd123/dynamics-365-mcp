import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchCustomApiDetails, listCustomApis } from "../custom-api-metadata.js";

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
});
