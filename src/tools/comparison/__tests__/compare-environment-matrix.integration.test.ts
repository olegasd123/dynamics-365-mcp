import { describe, expect, it } from "vitest";
import { registerCompareEnvironmentMatrix } from "../compare-environment-matrix.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_environment_matrix tool", () => {
  it("renders plugin assembly, step, and image drift across environments", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev", "test"]);
    const { client } = createRecordingClient({
      prod: {
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
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
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
      },
      dev: {
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
            version: "1.1.0",
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
            filteringattributes: "name,accountnumber",
            supporteddeployment: 0,
            asyncautodelete: false,
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
            attributes: "name,accountnumber",
            messagepropertyname: "Target",
          },
        ],
      },
      test: {
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
            filteringattributes: "name",
            supporteddeployment: 0,
            asyncautodelete: false,
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
      },
    });

    registerCompareEnvironmentMatrix(server as never, config, client);

    const response = await server.getHandler("compare_environment_matrix")({
      baselineEnvironment: "prod",
      targetEnvironments: ["dev", "test"],
      componentType: "plugins",
      pluginName: "Core.Plugins",
    });

    const text = response.content[0].text;

    expect(response.isError).toBeUndefined();
    expect(text).toContain("## Environment Matrix");
    expect(text).toContain("### Plugin Assemblies");
    expect(text).toContain("### Plugin Steps");
    expect(text).toContain("### Plugin Images");
    expect(text).toContain("Core.Plugins");
    expect(text).toContain("dev: version");
    expect(text).toContain("dev: filteringattributes");
    expect(text).toContain("dev: attributes");
    expect(text).toContain("test");
    expect(text).toContain("Aligned");
  });
});
