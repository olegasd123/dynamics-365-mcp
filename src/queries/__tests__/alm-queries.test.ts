import { describe, expect, it } from "vitest";
import {
  listAppModulesQuery,
  listAppModuleSitemapComponentsQuery,
  listConnectionReferencesQuery,
  listEnvironmentVariableDefinitionsQuery,
  listEnvironmentVariableValuesForDefinitionsQuery,
  listSitemapsQuery,
} from "../alm-queries.js";

describe("alm queries", () => {
  const definitionId1 = "11111111-1111-1111-1111-111111111111";
  const definitionId2 = "22222222-2222-2222-2222-222222222222";
  const appModuleIdUnique = "33333333-3333-3333-3333-333333333333";

  it("builds the environment variable definition query with a name filter", () => {
    const query = listEnvironmentVariableDefinitionsQuery("Contoso");

    expect(query).toContain("contains(schemaname,'Contoso')");
    expect(query).toContain("contains(displayname,'Contoso')");
    expect(query).toContain("$orderby=schemaname asc");
  });

  it("builds the environment variable values query for definition ids", () => {
    const query = listEnvironmentVariableValuesForDefinitionsQuery([definitionId1, definitionId2]);

    expect(query).toContain(`_environmentvariabledefinitionid_value eq ${definitionId1}`);
    expect(query).toContain(`_environmentvariabledefinitionid_value eq ${definitionId2}`);
    expect(query).toContain("$orderby=modifiedon desc");
  });

  it("builds the connection reference query with a name filter", () => {
    const query = listConnectionReferencesQuery("Office");

    expect(query).toContain("contains(connectionreferencedisplayname,'Office')");
    expect(query).toContain("contains(connectionreferencelogicalname,'Office')");
    expect(query).toContain("$orderby=connectionreferencedisplayname asc");
  });

  it("builds the app module query with a name filter", () => {
    const query = listAppModulesQuery("Sales");

    expect(query).toContain("contains(name,'Sales')");
    expect(query).toContain("contains(uniquename,'Sales')");
  });

  it("builds the sitemap query with a name filter", () => {
    const query = listSitemapsQuery("Sales");

    expect(query).toContain("contains(sitemapname,'Sales')");
    expect(query).toContain("contains(sitemapnameunique,'Sales')");
    expect(query).toContain("$orderby=sitemapname asc");
  });

  it("builds the app module sitemap component query", () => {
    const query = listAppModuleSitemapComponentsQuery(appModuleIdUnique);

    expect(query).toContain(`_appmoduleidunique_value eq ${appModuleIdUnique}`);
    expect(query).toContain("componenttype eq 62");
    expect(query).toContain("$orderby=appmodulecomponentid asc");
  });
});
