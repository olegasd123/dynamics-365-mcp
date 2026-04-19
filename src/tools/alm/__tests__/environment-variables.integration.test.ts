import { describe, expect, it } from "vitest";
import { registerGetEnvironmentVariableDetails } from "../get-environment-variable-details.js";
import { registerListEnvironmentVariables } from "../list-environment-variables.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("environment variable tools", () => {
  it("lists scoped environment variables with current values", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_Core",
            version: "1.0.0.0",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-env-def",
            objectid: "env-def-1",
            componenttype: 380,
          },
        ],
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://default",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://current",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListEnvironmentVariables(server as never, config, client);

    const response = await server.getHandler("list_environment_variables")({
      solution: "Core",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("contoso_BaseUrl");
    expect(response.content[0].text).toContain("https://current");
    expect(response.structuredContent).toMatchObject({
      tool: "list_environment_variables",
      ok: true,
      data: {
        count: 1,
      },
    });
  });

  it("loads one environment variable with value records", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://default",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://current",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerGetEnvironmentVariableDetails(server as never, config, client);

    const response = await server.getHandler("get_environment_variable_details")({
      variableName: "contoso_BaseUrl",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Effective Value: https://current");
    expect(response.structuredContent).toMatchObject({
      tool: "get_environment_variable_details",
      ok: true,
      data: {
        variable: {
          schemaname: "contoso_BaseUrl",
          currentValue: "https://current",
        },
      },
    });
  });

  it("returns structured retry options when the environment variable is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrlA",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
          {
            environmentvariabledefinitionid: "env-def-2",
            schemaname: "contoso_BaseUrlB",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [],
      },
    });

    registerGetEnvironmentVariableDetails(server as never, config, client);

    const response = await server.getHandler("get_environment_variable_details")({
      variableName: "Base URL",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching environment variable");
    expect(response.structuredContent).toMatchObject({
      tool: "get_environment_variable_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "variableName",
        options: [
          { value: "contoso_BaseUrlA", label: "contoso_BaseUrlA (Base URL)" },
          { value: "contoso_BaseUrlB", label: "contoso_BaseUrlB (Base URL)" },
        ],
        retryable: false,
      },
    });
  });
});
