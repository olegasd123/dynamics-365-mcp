import { describe, expect, it } from "vitest";
import {
  listAppModulesQuery,
  listConnectionReferencesQuery,
  listEnvironmentVariableDefinitionsQuery,
  listEnvironmentVariableValuesForDefinitionsQuery,
} from "../alm-queries.js";

describe("alm queries", () => {
  it("builds the environment variable definition query with a name filter", () => {
    const query = listEnvironmentVariableDefinitionsQuery("Contoso");

    expect(query).toContain("contains(schemaname,'Contoso')");
    expect(query).toContain("contains(displayname,'Contoso')");
    expect(query).toContain("$orderby=schemaname asc");
  });

  it("builds the environment variable values query for definition ids", () => {
    const query = listEnvironmentVariableValuesForDefinitionsQuery(["def-1", "def-2"]);

    expect(query).toContain("_environmentvariabledefinitionid_value eq 'def-1'");
    expect(query).toContain("_environmentvariabledefinitionid_value eq 'def-2'");
    expect(query).toContain("$orderby=modifiedon desc");
  });

  it("builds the connection reference query with a name filter", () => {
    const query = listConnectionReferencesQuery("Office");

    expect(query).toContain("contains(displayname,'Office')");
    expect(query).toContain("contains(connectionreferencelogicalname,'Office')");
  });

  it("builds the app module query with a name filter", () => {
    const query = listAppModulesQuery("Sales");

    expect(query).toContain("contains(name,'Sales')");
    expect(query).toContain("contains(uniquename,'Sales')");
  });
});
