import { describe, expect, it } from "vitest";
import { registerCompareCustomApis } from "../compare-custom-apis.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_custom_apis", () => {
  it("shows custom api and parameter drift", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        customapis: [
          {
            customapiid: "api-prod-1",
            name: "Do Thing",
            uniquename: "contoso_DoThing",
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
            _customapiid_value: "api-prod-1",
            name: "Target",
            uniquename: "contoso_Target",
            type: 5,
            isoptional: false,
            logicalentityname: "account",
            ismanaged: false,
            statecode: 0,
          },
        ],
        customapiresponseproperties: [],
      },
      dev: {
        customapis: [
          {
            customapiid: "api-dev-1",
            name: "Do Thing",
            uniquename: "contoso_DoThing",
            bindingtype: 0,
            isfunction: false,
            isprivate: false,
            allowedcustomprocessingsteptype: 2,
            workflowsdkstepenabled: false,
            ismanaged: false,
            statecode: 0,
          },
        ],
        customapirequestparameters: [
          {
            customapirequestparameterid: "req-1",
            _customapiid_value: "api-dev-1",
            name: "Target",
            uniquename: "contoso_Target",
            type: 5,
            isoptional: true,
            logicalentityname: "account",
            ismanaged: false,
            statecode: 0,
          },
        ],
        customapiresponseproperties: [],
      },
    });

    registerCompareCustomApis(server as never, config, client);
    const response = await server.getHandler("compare_custom_apis")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      apiName: "Do Thing",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("workflowsdkstepenabled");
    expect(response.content[0].text).toContain("Request Parameters");
    expect(response.content[0].text).toContain("isoptional");
  });
});
