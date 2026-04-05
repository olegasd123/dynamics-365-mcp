import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchFlowDetails, listCloudFlows } from "../flow-metadata.js";

describe("flow metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists cloud flows and parses clientdata summary", async () => {
    const clientdata = JSON.stringify({
      schemaVersion: "1.0.0.0",
      properties: {
        connectionReferences: {
          shared_commondataserviceforapps: {},
          shared_office365: {},
        },
        definition: {
          triggers: {
            manual: {},
          },
          actions: {
            List_rows: {},
            Send_email: {},
          },
        },
      },
    });

    const { client } = createRecordingClient({
      dev: {
        workflows: [
          {
            workflowid: "flow-1",
            workflowidunique: "flow-unique-1",
            name: "Account Flow",
            uniquename: "contoso_AccountFlow",
            category: 5,
            statecode: 1,
            statuscode: 2,
            type: 1,
            primaryentity: "none",
            ismanaged: false,
            clientdata,
            connectionreferences: "",
          },
        ],
      },
    });

    const flows = await listCloudFlows(env, client);
    const details = await fetchFlowDetails(env, client, "contoso_AccountFlow");

    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({
      name: "Account Flow",
      stateLabel: "Activated",
      typeLabel: "Definition",
    });
    expect(details.summary.schemaVersion).toBe("1.0.0.0");
    expect(details.summary.triggerNames).toEqual(["manual"]);
    expect(details.summary.actionNames).toEqual(["List_rows", "Send_email"]);
    expect(details.summary.connectionReferenceNames).toEqual([
      "shared_commondataserviceforapps",
      "shared_office365",
    ]);
  });
});
