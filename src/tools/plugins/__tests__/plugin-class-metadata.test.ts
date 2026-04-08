import { describe, expect, it } from "vitest";
import {
  countStepsByPluginTypeId,
  fetchPluginMetadata,
  filterAssembliesByRegistration,
  filterPluginClassesByRegistration,
} from "../plugin-class-metadata.js";
import type { EnvironmentConfig } from "../../../config/types.js";

describe("plugin shared metadata", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("builds one shared inventory with plugin classes and workflow activities", async () => {
    const calls: string[] = [];
    const client = {
      async query<T>(_env: EnvironmentConfig, entitySet: string): Promise<T[]> {
        calls.push(entitySet);

        if (entitySet === "pluginassemblies") {
          return [{ pluginassemblyid: "asm-1", name: "Core.Plugins" }] as T[];
        }

        if (entitySet === "plugintypes") {
          return [
            {
              plugintypeid: "type-1",
              name: "AccountPlugin",
              typename: "Core.Plugins.AccountPlugin",
              isworkflowactivity: false,
              _pluginassemblyid_value: "asm-1",
            },
            {
              plugintypeid: "type-2",
              name: "AccountActivity",
              typename: "Core.Plugins.AccountActivity",
              isworkflowactivity: true,
              _pluginassemblyid_value: "asm-1",
            },
          ] as T[];
        }

        if (entitySet === "sdkmessageprocessingsteps") {
          return [
            {
              sdkmessageprocessingstepid: "step-1",
              _eventhandler_value: "type-1",
              name: "Plugin Step",
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
              name: "Activity Step",
              stage: 40,
              mode: 0,
              rank: 1,
              statecode: 0,
              sdkmessageid: { name: "Update" },
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

    const inventory = await fetchPluginMetadata(env, client, {
      includeSteps: true,
      includeImages: true,
    });

    expect(inventory.assemblies).toHaveLength(1);
    expect(inventory.types).toHaveLength(2);
    expect(inventory.pluginClasses).toHaveLength(1);
    expect(inventory.workflowActivities).toHaveLength(1);
    expect(inventory.steps).toHaveLength(2);
    expect(inventory.images).toHaveLength(1);
    expect(calls).toEqual([
      "pluginassemblies",
      "plugintypes",
      "sdkmessageprocessingsteps",
      "sdkmessageprocessingstepimages",
    ]);
  });

  it("keeps orphan logic consistent for assemblies and plugin classes", () => {
    const assemblies = [
      { pluginassemblyid: "asm-1", name: "Core.Plugins" },
      { pluginassemblyid: "asm-2", name: "Other.Plugins" },
    ];
    const plugins = [
      {
        key: "asm-1|Core.Plugins.AccountPlugin",
        assemblyId: "asm-1",
        assemblyName: "Core.Plugins",
        pluginTypeId: "type-1",
        name: "AccountPlugin",
        fullName: "Core.Plugins.AccountPlugin",
        friendlyName: "",
        isWorkflowActivity: false,
        workflowActivityGroupName: "",
        customWorkflowActivityInfo: "",
      },
      {
        key: "asm-2|Other.Plugins.ContactPlugin",
        assemblyId: "asm-2",
        assemblyName: "Other.Plugins",
        pluginTypeId: "type-2",
        name: "ContactPlugin",
        fullName: "Other.Plugins.ContactPlugin",
        friendlyName: "",
        isWorkflowActivity: false,
        workflowActivityGroupName: "",
        customWorkflowActivityInfo: "",
      },
    ];
    const steps = [
      {
        key: "step-1",
        displayName: "Core.Plugins :: Step 1",
        assemblyId: "asm-1",
        assemblyName: "Core.Plugins",
        pluginTypeId: "type-1",
        pluginTypeName: "AccountPlugin",
        pluginTypeFullName: "Core.Plugins.AccountPlugin",
        name: "Step 1",
        messageName: "Create",
        primaryEntity: "account",
        sdkmessageprocessingstepid: "step-1",
      },
    ];

    expect(filterAssembliesByRegistration(assemblies, steps, "no_steps")).toEqual([
      { pluginassemblyid: "asm-2", name: "Other.Plugins" },
    ]);
    expect(filterPluginClassesByRegistration(plugins, steps, "no_steps")).toEqual([
      {
        key: "asm-2|Other.Plugins.ContactPlugin",
        assemblyId: "asm-2",
        assemblyName: "Other.Plugins",
        pluginTypeId: "type-2",
        name: "ContactPlugin",
        fullName: "Other.Plugins.ContactPlugin",
        friendlyName: "",
        isWorkflowActivity: false,
        workflowActivityGroupName: "",
        customWorkflowActivityInfo: "",
      },
    ]);
    expect(countStepsByPluginTypeId(steps).get("type-1")).toBe(1);
  });
});
