import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchFormDetails, listForms } from "../form-metadata.js";

describe("form metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("lists forms and builds normalized xml summaries", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "form-1", componenttype: 24 },
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            uniquename: "contoso_account_main",
            formactivationstate: 1,
            isdefault: true,
            ismanaged: false,
            modifiedon: "2026-04-01T00:00:00Z",
            publishedon: "2026-04-01T00:00:00Z",
            formxml:
              "<form><tabs><tab name='general'><columns><column><sections><section name='summary'><rows><row><cell><control id='name' datafieldname='name' /></cell></row></rows></section></sections></column></columns></tab></tabs><events><event><Handlers><Handler functionName='onLoad' libraryName='new_/account.js'/></Handlers><Dependencies><Dependency><Library name='new_/account.js' /></Dependency></Dependencies></event></events></form>",
          },
        ],
      },
    });

    const forms = await listForms(env, client, { solution: "Core" });
    const details = await fetchFormDetails(env, client, "contoso_account_main", {
      solution: "Core",
    });

    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      name: "Account Main",
      objecttypecode: "account",
      typeLabel: "Main",
    });
    expect(details.summary.tabs).toEqual(["general"]);
    expect(details.summary.sections).toEqual(["summary"]);
    expect(details.summary.controls).toContain("name");
    expect(details.summary.libraries).toContain("new_/account.js");
    expect(details.summaryHash).toHaveLength(12);
  });

  it("resolves form details by form id when unique name is empty", async () => {
    const { client } = createRecordingClient({
      dev: {
        systemforms: [
          {
            formid: "form-1",
            name: "Informations",
            objecttypecode: "account",
            type: 2,
            uniquename: "",
            formactivationstate: 1,
            isdefault: false,
            ismanaged: false,
            formxml: "<form />",
          },
          {
            formid: "form-2",
            name: "Informations",
            objecttypecode: "contact",
            type: 2,
            uniquename: "",
            formactivationstate: 1,
            isdefault: false,
            ismanaged: false,
            formxml: "<form />",
          },
        ],
      },
    });

    const details = await fetchFormDetails(env, client, "form-1");

    expect(details.formid).toBe("form-1");
    expect(details.objecttypecode).toBe("account");
  });
});
