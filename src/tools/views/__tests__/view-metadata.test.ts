import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import {
  createRecordingClient,
  createTestConfig,
  denormalizeFixtureIds,
} from "../../__tests__/tool-test-helpers.js";
import { handleGetViewDetails } from "../get-view-details.js";
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
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "view-1", componenttype: 26 },
        ],
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

  it("returns structured retry options when the view name is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Records",
            returnedtypecode: "account",
            querytype: 0,
            isdefault: true,
            isquickfindquery: false,
            ismanaged: false,
            statecode: 0,
            modifiedon: "2026-04-01T00:00:00Z",
            fetchxml: "<fetch><entity name='account' /></fetch>",
            layoutxml: "<grid><row id='accountid' /></grid>",
          },
          {
            savedqueryid: "view-2",
            name: "Active Records",
            returnedtypecode: "contact",
            querytype: 0,
            isdefault: false,
            isquickfindquery: false,
            ismanaged: false,
            statecode: 0,
            modifiedon: "2026-04-01T00:00:00Z",
            fetchxml: "<fetch><entity name='contact' /></fetch>",
            layoutxml: "<grid><row id='contactid' /></grid>",
          },
        ],
      },
    });

    const response = denormalizeFixtureIds(
      await handleGetViewDetails(
        {
          environment: "dev",
          viewName: "Active Records",
        },
        {
          config: createTestConfig(["dev"]),
          client,
        },
      ),
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching view and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_view_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "viewName",
        options: [
          {
            value: "view-1",
            label: "account/system/Active Records (view-1)",
          },
          {
            value: "view-2",
            label: "contact/system/Active Records (view-2)",
          },
        ],
        retryable: false,
      },
    });
  });
});
