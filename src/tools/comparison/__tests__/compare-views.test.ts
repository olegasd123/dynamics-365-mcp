import { describe, expect, it } from "vitest";
import { registerCompareViews } from "../compare-views.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_views", () => {
  it("shows view query drift", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
            ismanaged: false,
            statecode: 0,
            fetchxml:
              "<fetch><entity name='account'><attribute name='name' /><order attribute='name' /></entity></fetch>",
            layoutxml: "<grid><row id='accountid'><cell name='name' width='200' /></row></grid>",
          },
        ],
      },
      dev: {
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
            ismanaged: false,
            statecode: 0,
            fetchxml:
              "<fetch><entity name='account'><attribute name='name' /><attribute name='accountnumber' /><order attribute='name' /></entity></fetch>",
            layoutxml:
              "<grid><row id='accountid'><cell name='name' width='200' /><cell name='accountnumber' width='100' /></row></grid>",
          },
        ],
      },
    });

    registerCompareViews(server as never, config, client);
    const response = await server.getHandler("compare_views")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      table: "account",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Active Accounts");
    expect(response.content[0].text).toContain("querySummary");
  });
});
