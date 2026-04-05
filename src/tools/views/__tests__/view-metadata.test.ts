import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchViewDetails, listViews } from "../view-metadata.js";

describe("view metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists views and builds fetch/layout summaries", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "core" }],
        solutioncomponents: [{ solutioncomponentid: "sc-1", objectid: "view-1", componenttype: 26 }],
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
            modifiedon: "2026-04-01T00:00:00Z",
            fetchxml:
              "<fetch><entity name='account'><attribute name='name'/><attribute name='accountnumber'/><order attribute='name'/><filter><condition attribute='statecode' operator='eq' value='0' /></filter><link-entity name='contact' from='contactid' to='primarycontactid' /></entity></fetch>",
            layoutxml:
              "<grid><row id='accountid'><cell name='name' width='200' /><cell name='accountnumber' width='100' /></row></grid>",
          },
        ],
      },
    });

    const views = await listViews(env, client, { solution: "Core" });
    const details = await fetchViewDetails(env, client, "Active Accounts", { solution: "Core" });

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      name: "Active Accounts",
      returnedtypecode: "account",
      queryTypeLabel: "Public",
    });
    expect(details.summary.entityName).toBe("account");
    expect(details.summary.attributes).toEqual(["name", "accountnumber"]);
    expect(details.summary.orders).toEqual(["name asc"]);
    expect(details.summary.linkEntities).toEqual(["contact"]);
    expect(details.summary.layoutColumns).toEqual(["name", "accountnumber"]);
    expect(details.fetchSummaryHash).toHaveLength(12);
  });
});
