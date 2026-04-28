import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import {
  createRecordingClient,
  createTestConfig,
  fixtureGuid,
} from "../../__tests__/tool-test-helpers.js";
import { handleGetFormDetails } from "../get-form-details.js";
import { fetchFormDetails, listForms, resolveForm } from "../form-metadata.js";

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

    const details = await fetchFormDetails(env, client, fixtureGuid("form-1"));

    expect(details.formid).toBe(fixtureGuid("form-1"));
    expect(details.objecttypecode).toBe("account");
  });

  it("matches solution forms by resolved table metadata when object type code differs", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-1", objectid: "form-1", componenttype: 60 },
          { solutioncomponentid: "sc-2", objectid: "table-1", componenttype: 1 },
        ],
        EntityDefinitions: [
          {
            MetadataId: "table-1",
            ObjectTypeCode: 10042,
            LogicalName: "mso_candidat",
            SchemaName: "mso_Candidat",
            DisplayName: { UserLocalizedLabel: { Label: "Candidat" } },
            DisplayCollectionName: { UserLocalizedLabel: { Label: "Candidats" } },
            EntitySetName: "mso_candidats",
          },
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Candidat",
            objecttypecode: "10042",
            type: 2,
            uniquename: "mso_candidat_main",
            formactivationstate: 1,
            isdefault: true,
            ismanaged: false,
            formxml: "<form />",
          },
        ],
      },
    });

    const forms = await listForms(env, client, { solution: "Core", table: "mso_candidat" });

    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      name: "Candidat",
      objecttypecode: "10042",
    });
  });

  it("falls back to a global exact match before solution partial matches", async () => {
    const client = {
      async query<T>(
        _env: EnvironmentConfig,
        entitySet: string,
        queryParams?: string,
      ): Promise<T[]> {
        if (entitySet === "solutions") {
          return [
            { solutionid: fixtureGuid("sol-1"), friendlyname: "Core", uniquename: "core" },
          ] as T[];
        }

        if (entitySet === "solutioncomponents") {
          return [
            {
              solutioncomponentid: fixtureGuid("sc-1"),
              objectid: fixtureGuid("form-old"),
              componenttype: 60,
            },
            {
              solutioncomponentid: fixtureGuid("sc-2"),
              objectid: fixtureGuid("form-old-2"),
              componenttype: 60,
            },
          ] as T[];
        }

        if (entitySet === "systemforms") {
          if (queryParams?.includes("formid eq")) {
            return [
              {
                formid: fixtureGuid("form-old"),
                name: "Old_Candidat",
                objecttypecode: "mso_candidat",
                type: 2,
                uniquename: "",
                formactivationstate: 1,
                isdefault: false,
                ismanaged: false,
              },
              {
                formid: fixtureGuid("form-old-2"),
                name: "Archive Candidat",
                objecttypecode: "mso_candidat",
                type: 2,
                uniquename: "",
                formactivationstate: 1,
                isdefault: false,
                ismanaged: false,
              },
            ] as T[];
          }

          return [
            {
              formid: "form-current",
              name: "Candidat",
              objecttypecode: "mso_candidat",
              type: 2,
              uniquename: "",
              formactivationstate: 1,
              isdefault: true,
              ismanaged: false,
            },
          ] as T[];
        }

        if (entitySet === "EntityDefinitions") {
          return [
            {
              MetadataId: "table-1",
              ObjectTypeCode: 10042,
              LogicalName: "mso_candidat",
              SchemaName: "mso_candidat",
              DisplayName: { UserLocalizedLabel: { Label: "Candidat" } },
              DisplayCollectionName: { UserLocalizedLabel: { Label: "Candidats" } },
              EntitySetName: "mso_candidats",
            },
          ] as T[];
        }

        return [] as T[];
      },
      async queryPath<T>(): Promise<T[]> {
        return [] as T[];
      },
      async getPath<T>(): Promise<T | null> {
        return null;
      },
    } as never;

    const form = await resolveForm(env, client, "Candidat", {
      solution: "Core",
      table: "mso_candidat",
    });

    expect(form.formid).toBe("form-current");
    expect(form.name).toBe("Candidat");
  });

  it("returns structured retry options when the form name is ambiguous", async () => {
    const { client } = createRecordingClient({
      dev: {
        systemforms: [
          {
            formid: "form-1",
            name: "Informations",
            objecttypecode: "account",
            type: 2,
            uniquename: "account_information_main",
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
            uniquename: "contact_information_main",
            formactivationstate: 1,
            isdefault: false,
            ismanaged: false,
            formxml: "<form />",
          },
        ],
      },
    });

    const response = await handleGetFormDetails(
      {
        environment: "dev",
        formName: "Informations",
      },
      {
        config: createTestConfig(["dev"]),
        client,
      },
    );

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching form and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_form_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "formName",
        options: [
          {
            value: "account_information_main",
            label: "account/Main/Informations (account_information_main)",
          },
          {
            value: "contact_information_main",
            label: "contact/Main/Informations (contact_information_main)",
          },
        ],
        retryable: false,
      },
    });
  });
});
