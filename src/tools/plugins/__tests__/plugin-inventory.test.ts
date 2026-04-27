import { describe, expect, it } from "vitest";
import { fetchPluginClasses, fetchPluginInventory, fetchPluginSteps } from "../plugin-inventory.js";
import type { EnvironmentConfig } from "../../../config/types.js";
import { fixtureGuid } from "../../__tests__/tool-test-helpers.js";

describe("plugin inventory", () => {
  const assemblyId1 = fixtureGuid("asm-1");
  const assemblyId2 = fixtureGuid("asm-2");
  const typeId1 = fixtureGuid("type-1");
  const typeId2 = fixtureGuid("type-2");
  const stepId1 = fixtureGuid("step-1");
  const stepId2 = fixtureGuid("step-2");
  const imageId1 = fixtureGuid("img-1");

  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("fetches steps with bulk queries instead of per-assembly loops", async () => {
    const calls: string[] = [];
    const client = {
      async query<T>(_env: EnvironmentConfig, entitySet: string): Promise<T[]> {
        calls.push(entitySet);

        if (entitySet === "plugintypes") {
          return [
            {
              plugintypeid: typeId1,
              name: "Type1",
              typename: "Plugins.Type1",
              _pluginassemblyid_value: assemblyId1,
            },
            {
              plugintypeid: typeId2,
              name: "Type2",
              typename: "Plugins.Type2",
              _pluginassemblyid_value: assemblyId2,
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingsteps") {
          return [
            {
              sdkmessageprocessingstepid: stepId1,
              _eventhandler_value: typeId1,
              name: "Step 1",
              stage: 20,
              mode: 0,
              rank: 1,
              statecode: 0,
              sdkmessageid: { name: "Create" },
              sdkmessagefilterid: { primaryobjecttypecode: "account" },
            },
            {
              sdkmessageprocessingstepid: stepId2,
              _eventhandler_value: typeId2,
              name: "Step 2",
              stage: 40,
              mode: 1,
              rank: 1,
              statecode: 0,
              sdkmessageid: { name: "Update" },
              sdkmessagefilterid: { primaryobjecttypecode: "contact" },
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const steps = await fetchPluginSteps(env, client, [
      { pluginassemblyid: assemblyId1, name: "Assembly.One" },
      { pluginassemblyid: assemblyId2, name: "Assembly.Two" },
    ]);

    expect(steps).toHaveLength(2);
    expect(calls).toEqual(["plugintypes", "sdkmessageprocessingsteps"]);
  });

  it("fetches images in one bulk step query path", async () => {
    const calls: string[] = [];
    const client = {
      async query<T>(_env: EnvironmentConfig, entitySet: string): Promise<T[]> {
        calls.push(entitySet);

        if (entitySet === "plugintypes") {
          return [
            {
              plugintypeid: typeId1,
              name: "Type1",
              typename: "Plugins.Type1",
              _pluginassemblyid_value: assemblyId1,
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingsteps") {
          return [
            {
              sdkmessageprocessingstepid: stepId1,
              _eventhandler_value: typeId1,
              name: "Step 1",
              stage: 20,
              mode: 0,
              rank: 1,
              statecode: 0,
              sdkmessageid: { name: "Create" },
              sdkmessagefilterid: { primaryobjecttypecode: "account" },
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingstepimages") {
          return [
            {
              sdkmessageprocessingstepimageid: imageId1,
              _sdkmessageprocessingstepid_value: stepId1,
              name: "PreImage",
              entityalias: "pre",
              imagetype: 0,
              attributes: "name",
              messagepropertyname: "Target",
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const inventory = await fetchPluginInventory(env, client, [
      { pluginassemblyid: assemblyId1, name: "Assembly.One" },
    ]);

    expect(inventory.steps).toHaveLength(1);
    expect(inventory.images).toHaveLength(1);
    expect(calls).toEqual([
      "plugintypes",
      "sdkmessageprocessingsteps",
      "sdkmessageprocessingstepimages",
    ]);
  });

  it("filters workflow activities from plugin classes by default", async () => {
    const client = {
      async query<T>(_env: EnvironmentConfig, entitySet: string): Promise<T[]> {
        if (entitySet === "plugintypes") {
          return [
            {
              plugintypeid: typeId1,
              name: "AccountPlugin",
              typename: "Plugins.AccountPlugin",
              isworkflowactivity: false,
              _pluginassemblyid_value: assemblyId1,
            },
            {
              plugintypeid: typeId2,
              name: "AccountActivity",
              typename: "Plugins.AccountActivity",
              isworkflowactivity: true,
              _pluginassemblyid_value: assemblyId1,
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const plugins = await fetchPluginClasses(env, client, [
      { pluginassemblyid: assemblyId1, name: "Assembly.One" },
    ]);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].fullName).toBe("Plugins.AccountPlugin");
  });

  it("filters CodeActivity records even when isworkflowactivity is false", async () => {
    const client = {
      async query<T>(_env: EnvironmentConfig, entitySet: string): Promise<T[]> {
        if (entitySet === "plugintypes") {
          return [
            {
              plugintypeid: typeId1,
              name: "AccountPlugin",
              typename: "Plugins.AccountPlugin",
              isworkflowactivity: false,
              _pluginassemblyid_value: assemblyId1,
            },
            {
              plugintypeid: typeId2,
              name: "PostVacancyToSap",
              typename: "Masao.Workflows.PostVacancyToSap",
              isworkflowactivity: false,
              workflowactivitygroupname: "Masao Workflows",
              customworkflowactivityinfo: '{"arguments":[]}',
              _pluginassemblyid_value: assemblyId1,
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const plugins = await fetchPluginClasses(env, client, [
      { pluginassemblyid: assemblyId1, name: "Assembly.One" },
    ]);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].fullName).toBe("Plugins.AccountPlugin");
  });
});
