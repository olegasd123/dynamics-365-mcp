import { describe, expect, it } from "vitest";
import { DynamicsApiError } from "../../../client/dynamics-client.js";
import { registerGetSolutionDependencies } from "../get-solution-dependencies.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";
import {
  retrieveDependentComponentsPath,
  retrieveRequiredComponentsPath,
} from "../../../queries/dependency-queries.js";

describe("get_solution_dependencies tool", () => {
  it("shows required and dependent rows for supported solution components", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-asm", objectid: "asm-1", componenttype: 91 },
          {
            solutioncomponentid: "sc-step",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-asm",
          },
          {
            solutioncomponentid: "sc-img",
            objectid: "img-1",
            componenttype: 93,
            rootsolutioncomponentid: "sc-asm",
          },
          { solutioncomponentid: "sc-wr", objectid: "wr-1", componenttype: 61 },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
          },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Create",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [
          {
            sdkmessageprocessingstepimageid: "img-1",
            _sdkmessageprocessingstepid_value: "step-1",
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name",
            messagepropertyname: "Target",
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            ismanaged: false,
          },
          {
            webresourceid: "wr-2",
            name: "contoso_/scripts/shared.js",
            webresourcetype: 3,
            ismanaged: false,
          },
        ],
        workflows: [
          {
            workflowid: "wf-2",
            name: "External Flow",
            uniquename: "contoso_ExternalFlow",
            category: 0,
            statecode: 1,
            statuscode: 2,
            mode: 0,
            ismanaged: false,
          },
        ],
        [retrieveRequiredComponentsPath("sc-step", 92)]: [
          {
            dependencyid: "dep-1",
            dependencytype: 2,
            requiredcomponentobjectid: "wr-2",
            requiredcomponenttype: 61,
            dependentcomponentobjectid: "step-1",
            dependentcomponenttype: 92,
          },
        ],
        [retrieveDependentComponentsPath("sc-step", 92)]: [
          {
            dependencyid: "dep-2",
            dependencytype: 2,
            requiredcomponentobjectid: "step-1",
            requiredcomponenttype: 92,
            dependentcomponentobjectid: "wf-2",
            dependentcomponenttype: 29,
          },
        ],
      },
    });

    registerGetSolutionDependencies(server as never, config, client);

    const response = await server.getHandler("get_solution_dependencies")({
      solution: "Core",
      componentType: "plugin_step",
      componentName: "Account Create",
    });

    const text = response.content[0].text;
    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Solution Dependencies");
    expect(text).toContain("**Components Scanned**: 1");
    expect(text).toContain("Requires");
    expect(text).toContain("Used By");
    expect(text).toContain("contoso_/scripts/shared.js");
    expect(text).toContain("External Flow");
    expect(text).toContain("No");
    expect(text).toContain("Published");
  });

  it("returns a clear error when component filter is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-step-1",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-asm",
          },
          {
            solutioncomponentid: "sc-step-2",
            objectid: "step-2",
            componenttype: 92,
            rootsolutioncomponentid: "sc-asm",
          },
          { solutioncomponentid: "sc-asm", objectid: "asm-1", componenttype: 91 },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.0.0",
            isolationmode: 2,
            ismanaged: false,
          },
        ],
        plugintypes: [
          {
            plugintypeid: "type-1",
            name: "AccountPlugin",
            typename: "Core.Plugins.AccountPlugin",
            _pluginassemblyid_value: "asm-1",
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
            _eventhandler_value: "type-1",
            name: "Account Create",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
          {
            sdkmessageprocessingstepid: "step-2",
            _eventhandler_value: "type-1",
            name: "Account Create Audit",
            stage: 20,
            mode: 0,
            rank: 1,
            statecode: 0,
            sdkmessageid: { name: "Create" },
            sdkmessagefilterid: { primaryobjecttypecode: "account" },
          },
        ],
        sdkmessageprocessingstepimages: [],
      },
    });

    registerGetSolutionDependencies(server as never, config, client);

    const response = await server.getHandler("get_solution_dependencies")({
      solution: "Core",
      componentType: "plugin_step",
      componentName: "Account",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Choose a matching component and try again");
    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "get_solution_dependencies",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "componentName",
        options: [
          {
            value: "sc-step-1",
            label: "Core.Plugins :: Account Create [Create/account] [Core.Plugins] (Plugin Step)",
          },
          {
            value: "sc-step-2",
            label:
              "Core.Plugins :: Account Create Audit [Create/account] [Core.Plugins] (Plugin Step)",
          },
        ],
        retryable: false,
      },
    });
  });

  it("supports milestone 2 component groups in dependency lookups", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-env-def", objectid: "env-def-1", componenttype: 380 },
          { solutioncomponentid: "sc-conn", objectid: "conn-1", componenttype: 371 },
        ],
        EntityDefinitions: [],
        environmentvariabledefinitions: [
          {
            environmentvariabledefinitionid: "env-def-1",
            schemaname: "contoso_BaseUrl",
            displayname: "Base URL",
            type: 100000000,
            defaultvalue: "https://example.test",
            ismanaged: false,
          },
        ],
        environmentvariablevalues: [],
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_internal",
            displayname: "Internal Connection",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "connection-1",
            ismanaged: false,
            statecode: 0,
          },
          {
            connectionreferenceid: "conn-2",
            connectionreferencelogicalname: "contoso_sharedoffice365",
            displayname: "Shared Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "connection-2",
            ismanaged: false,
            statecode: 0,
          },
        ],
        [retrieveRequiredComponentsPath("sc-env-def", 380)]: [
          {
            dependencyid: "dep-1",
            dependencytype: 2,
            requiredcomponentobjectid: "conn-2",
            requiredcomponenttype: 371,
            dependentcomponentobjectid: "env-def-1",
            dependentcomponenttype: 380,
          },
        ],
        [retrieveDependentComponentsPath("sc-env-def", 380)]: [],
      },
    });

    registerGetSolutionDependencies(server as never, config, client);

    const response = await server.getHandler("get_solution_dependencies")({
      solution: "Core",
      componentType: "environment_variable_definition",
      componentName: "contoso_BaseUrl",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("contoso_BaseUrl");
    expect(response.content[0].text).toContain("Shared Office 365");
    expect(response.content[0].text).toContain("Connection Reference");
  });

  it("skips components without dependency nodes", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        solutions: [{ solutionid: "sol-1", friendlyname: "Core", uniquename: "contoso_core" }],
        solutioncomponents: [
          { solutioncomponentid: "sc-app", objectid: "app-1", componenttype: 80 },
          { solutioncomponentid: "sc-wr", objectid: "wr-1", componenttype: 61 },
        ],
        EntityDefinitions: [],
        appmodules: [
          {
            appmoduleid: "app-1",
            name: "Sales Hub",
            uniquename: "contoso_saleshub",
            statecode: 0,
            ismanaged: false,
          },
        ],
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "contoso_/scripts/app.js",
            webresourcetype: 3,
            ismanaged: false,
          },
        ],
      },
    });

    const originalQuery = client.query.bind(client);
    client.query = (async (env, entitySet, queryParams, options) => {
      if (
        entitySet === retrieveDependentComponentsPath("sc-app", 80) ||
        entitySet === retrieveRequiredComponentsPath("sc-app", 80)
      ) {
        throw new DynamicsApiError(
          env.name,
          400,
          undefined,
          "There must be one DependencyNode for the given Id(app-1), ComponentType(AppModule) in the database. Count = 0",
        );
      }

      return originalQuery(env, entitySet, queryParams, options);
    }) as typeof client.query;

    registerGetSolutionDependencies(server as never, config, client);

    const response = await server.getHandler("get_solution_dependencies")({
      solution: "Core",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("## Solution Dependencies");
  });
});
