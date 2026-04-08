import { describe, expect, it } from "vitest";
import { fetchPluginClasses, fetchPluginInventory, fetchPluginSteps } from "../plugin-inventory.js";
import type { EnvironmentConfig } from "../../../config/types.js";

describe("plugin inventory", () => {
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
              plugintypeid: "type-1",
              name: "Type1",
              typename: "Plugins.Type1",
              _pluginassemblyid_value: "asm-1",
            },
            {
              plugintypeid: "type-2",
              name: "Type2",
              typename: "Plugins.Type2",
              _pluginassemblyid_value: "asm-2",
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingsteps") {
          return [
            {
              sdkmessageprocessingstepid: "step-1",
              _eventhandler_value: "type-1",
              name: "Step 1",
              stage: 20,
              mode: 0,
              rank: 1,
              statecode: 0,
              sdkmessageid: { name: "Create" },
              sdkmessagefilterid: { primaryobjecttypecode: "account" },
            },
            {
              sdkmessageprocessingstepid: "step-2",
              _eventhandler_value: "type-2",
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
      { pluginassemblyid: "asm-1", name: "Assembly.One" },
      { pluginassemblyid: "asm-2", name: "Assembly.Two" },
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
              plugintypeid: "type-1",
              name: "Type1",
              typename: "Plugins.Type1",
              _pluginassemblyid_value: "asm-1",
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingsteps") {
          return [
            {
              sdkmessageprocessingstepid: "step-1",
              _eventhandler_value: "type-1",
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
              sdkmessageprocessingstepimageid: "img-1",
              _sdkmessageprocessingstepid_value: "step-1",
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
      { pluginassemblyid: "asm-1", name: "Assembly.One" },
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
              plugintypeid: "type-1",
              name: "AccountPlugin",
              typename: "Plugins.AccountPlugin",
              isworkflowactivity: false,
              _pluginassemblyid_value: "asm-1",
            },
            {
              plugintypeid: "type-2",
              name: "AccountActivity",
              typename: "Plugins.AccountActivity",
              isworkflowactivity: true,
              _pluginassemblyid_value: "asm-1",
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const plugins = await fetchPluginClasses(env, client, [
      { pluginassemblyid: "asm-1", name: "Assembly.One" },
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
              plugintypeid: "type-1",
              name: "AccountPlugin",
              typename: "Plugins.AccountPlugin",
              isworkflowactivity: false,
              _pluginassemblyid_value: "asm-1",
            },
            {
              plugintypeid: "type-2",
              name: "PostVacancyToSap",
              typename: "Masao.Workflows.PostVacancyToSap",
              isworkflowactivity: false,
              workflowactivitygroupname: "Masao Workflows",
              customworkflowactivityinfo: '{"arguments":[]}',
              _pluginassemblyid_value: "asm-1",
            },
          ] as T[];
        }

        return [] as T[];
      },
    } as never;

    const plugins = await fetchPluginClasses(env, client, [
      { pluginassemblyid: "asm-1", name: "Assembly.One" },
    ]);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].fullName).toBe("Plugins.AccountPlugin");
  });
});
