import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";
import { fetchSolutionComponentSets, resolveSolution } from "../solution-inventory.js";

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
            objectid: "wf-1",
            componenttype: 29,
          },
          {
            solutioncomponentid: "sc-3",
            objectid: "wr-1",
            componenttype: 61,
          },
          {
            solutioncomponentid: "sc-4",
            objectid: "form-1",
            componenttype: 24,
          },
          {
            solutioncomponentid: "sc-5",
            objectid: "step-1",
            componenttype: 92,
            rootsolutioncomponentid: "sc-1",
          },
        ],
      },
    });

    const solution = await resolveSolution(env, client, "contoso_core");
    const componentSets = await fetchSolutionComponentSets(env, client, "Core");

    expect(solution.friendlyname).toBe("Core");
    expect(componentSets.pluginAssemblyIds).toEqual(new Set(["asm-1"]));
    expect(componentSets.workflowIds).toEqual(new Set(["wf-1"]));
    expect(componentSets.webResourceIds).toEqual(new Set(["wr-1"]));
    expect(componentSets.unsupportedRootComponents).toHaveLength(1);
    expect(componentSets.childComponents).toHaveLength(1);
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
