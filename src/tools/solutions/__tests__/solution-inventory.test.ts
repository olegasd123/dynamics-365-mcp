import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import {
  fetchSolutionComponentSets,
  fetchSolutionInventory,
  resolveSolution,
} from "../solution-inventory.js";

describe("solution inventory", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("resolves a solution by unique name and collects supported component ids", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Core",
            uniquename: "contoso_core",
            version: "1.0.0.0",
            ismanaged: false,
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-1",
            objectid: "asm-1",
            componenttype: 91,
          },
          {
            solutioncomponentid: "sc-2",
            objectid: "form-1",
            componenttype: 24,
          },
          {
            solutioncomponentid: "sc-3",
            objectid: "view-1",
            componenttype: 26,
          },
          {
            solutioncomponentid: "sc-4",
            objectid: "wf-1",
            componenttype: 29,
          },
          {
            solutioncomponentid: "sc-5",
            objectid: "wr-1",
            componenttype: 61,
          },
          {
            solutioncomponentid: "sc-6",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
          {
            solutioncomponentid: "sc-7",
            objectid: "img-1",
            componenttype: 93,
            rootsolutioncomponentid: "sc-1",
          },
        ],
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
          },
        ],
        savedqueries: [
          {
            savedqueryid: "view-1",
            name: "Active Accounts",
            returnedtypecode: "account",
          },
        ],
        pluginassemblies: [
          {
            pluginassemblyid: "asm-1",
            name: "Core.Plugins",
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
      },
    });

    const solution = await resolveSolution(env, client, "contoso_core");
    const componentSets = await fetchSolutionComponentSets(env, client, "Core");
    const inventory = await fetchSolutionInventory(env, client, "Core");

    expect(solution.friendlyname).toBe("Core");
    expect(componentSets.pluginAssemblyIds).toEqual(new Set(["asm-1"]));
    expect(componentSets.formIds).toEqual(new Set(["form-1"]));
    expect(componentSets.viewIds).toEqual(new Set(["view-1"]));
    expect(componentSets.workflowIds).toEqual(new Set(["wf-1"]));
    expect(componentSets.webResourceIds).toEqual(new Set(["wr-1"]));
    expect(componentSets.pluginStepIds).toEqual(new Set(["step-1"]));
    expect(componentSets.pluginImageIds).toEqual(new Set(["img-1"]));
    expect(componentSets.unsupportedRootComponents).toHaveLength(0);
    expect(componentSets.childComponents).toHaveLength(2);
    expect(inventory.forms).toHaveLength(1);
    expect(inventory.views).toHaveLength(1);
    expect(inventory.pluginSteps).toHaveLength(1);
    expect(inventory.pluginImages).toHaveLength(1);
  });

  it("throws an ambiguous error when multiple solutions match the same display name", async () => {
    const { client } = createRecordingClient({
      dev: {
        solutions: [
          { solutionid: "sol-1", friendlyname: "Core", uniquename: "core_a" },
          { solutionid: "sol-2", friendlyname: "Core", uniquename: "core_b" },
        ],
      },
    });

    await expect(resolveSolution(env, client, "Core")).rejects.toThrow(
      "Solution 'Core' is ambiguous in 'dev'.",
    );
  });
});
