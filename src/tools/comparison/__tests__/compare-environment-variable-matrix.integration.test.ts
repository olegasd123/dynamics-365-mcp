import { describe, expect, it } from "vitest";
import { registerCompareEnvironmentVariableMatrix } from "../compare-environment-variable-matrix.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_environment_variable_matrix tool", () => {
  it("renders definition, current value, and effective value drift across environments", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev", "test"]);
    const { client } = createRecordingClient({
      prod: {
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://prod",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
          {
            environmentvariabledefinitionid: "env-def-2",
            schemaname: "contoso_FeatureFlag",
            displayname: "Feature Flag",
            type: 100000000,
            defaultvalue: "off",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://prod-current",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
      dev: {
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://dev",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
          {
            environmentvariabledefinitionid: "env-def-2",
            schemaname: "contoso_FeatureFlag",
            displayname: "Feature Flag",
            type: 100000000,
            defaultvalue: "off",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
          {
            environmentvariabledefinitionid: "env-def-3",
            schemaname: "contoso_Extra",
            displayname: "Extra Variable",
            type: 100000000,
            defaultvalue: "x",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://dev-current",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
          {
            environmentvariablevalueid: "env-val-2",
            _environmentvariabledefinitionid_value: "env-def-2",
            value: "on",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
      test: {
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://prod",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
          {
            environmentvariabledefinitionid: "env-def-2",
            schemaname: "contoso_FeatureFlag",
            displayname: "Feature Flag",
            type: 100000000,
            defaultvalue: "off",
            valueschema: "",
            ismanaged: false,
            modifiedon: "2025-01-01T00:00:00Z",
          },
        ],
        environmentvariablevalues: [
          {
            environmentvariablevalueid: "env-val-1",
            _environmentvariabledefinitionid_value: "env-def-1",
            value: "https://prod-current",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerCompareEnvironmentVariableMatrix(server as never, config, client);

    const response = await server.getHandler("compare_environment_variable_matrix")({
      baselineEnvironment: "prod",
      targetEnvironments: ["dev", "test"],
      compareMode: "all",
    });

    const text = response.content[0].text;

    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Environment Variable Matrix");
    expect(text).toContain("### Definitions");
    expect(text).toContain("### Current Values");
    expect(text).toContain("### Effective Values");
    expect(text).toContain("contoso_BaseUrl");
    expect(text).toContain("defaultvalue (https://prod -> https://dev)");
    expect(text).toContain("currentValue ((empty) -> on)");
    expect(text).toContain("effectiveValue (off -> on)");
    expect(text).toContain("Aligned");
    expect(response.structuredContent).toMatchObject({
      tool: "compare_environment_variable_matrix",
      ok: true,
      data: {
        baselineEnvironment: "prod",
        targetEnvironments: ["dev", "test"],
        compareModes: ["definitions", "values", "effective"],
      },
    });

    const payload = response.structuredContent as {
      data: {
        sections: Array<{
          mode: string;
          title: string;
          report: { summaries: Array<{ environment: string }> };
        }>;
      };
    };
    expect(payload.data.sections[0].mode).toBe("definitions");
    expect(payload.data.sections[1].title).toBe("Current Values");
    expect(payload.data.sections[0].report.summaries[0].environment).toBe("dev");
  });

  it("returns an error when no target environments remain after filtering", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod"]);
    const { client } = createRecordingClient({
      prod: {
        environmentvariabledefinitions: [],
        environmentvariablevalues: [],
      },
    });

    registerCompareEnvironmentVariableMatrix(server as never, config, client);

    const response = await server.getHandler("compare_environment_variable_matrix")({
      baselineEnvironment: "prod",
      targetEnvironments: ["prod"],
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("No target environments found for baseline 'prod'.");
    expect(response.structuredContent).toMatchObject({
      tool: "compare_environment_variable_matrix",
      ok: false,
      error: {
        message: "No target environments found for baseline 'prod'.",
      },
    });
  });

  it("returns an error when the client query fails", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const client = {
      async query(): Promise<never[]> {
        throw new Error("Dynamics API error [prod] (429): Rate limit exceeded");
      },
    } as never;

    registerCompareEnvironmentVariableMatrix(server as never, config, client);

    const response = await server.getHandler("compare_environment_variable_matrix")({
      baselineEnvironment: "prod",
      targetEnvironments: ["dev"],
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "Dynamics API error [prod] (429): Rate limit exceeded",
    );
    expect(response.structuredContent).toMatchObject({
      tool: "compare_environment_variable_matrix",
      ok: false,
      error: {
        message: "Dynamics API error [prod] (429): Rate limit exceeded",
      },
    });
  });
});
