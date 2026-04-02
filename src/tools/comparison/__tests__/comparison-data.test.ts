import { describe, expect, it } from "vitest";
import { comparePluginsData } from "../comparison-data.js";
import type { AppConfig } from "../../../config/types.js";

describe("comparePluginsData", () => {
  it("compares plugin assemblies, steps, and images when child components are enabled", async () => {
    const config: AppConfig = {
      environments: [
        {
          name: "prod",
          url: "https://prod.crm.dynamics.com",
          tenantId: "tenant",
          clientId: "client",
          clientSecret: "secret",
        },
        {
          name: "dev",
          url: "https://dev.crm.dynamics.com",
          tenantId: "tenant",
          clientId: "client",
          clientSecret: "secret",
        },
      ],
      defaultEnvironment: "prod",
    };

    const datasets: Record<string, Record<string, Record<string, unknown>[]>> = {
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
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
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
          },
        ],
        sdkmessageprocessingsteps: [
          {
            sdkmessageprocessingstepid: "step-1",
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
            name: "PreImage",
            entityalias: "pre",
            imagetype: 0,
            attributes: "name,accountnumber",
            messagepropertyname: "Target",
          },
        ],
      },
    };

    const client = {
      async query<T>(env: { name: string }, entitySet: string): Promise<T[]> {
        return (datasets[env.name]?.[entitySet] || []) as T[];
      },
    } as never;

    const result = await comparePluginsData(config, client, "prod", "dev", {
      pluginName: "Core.Plugins",
      includeChildComponents: true,
    });

    expect(result.result.differences).toHaveLength(1);
    expect(result.stepResult?.differences).toEqual([
      expect.objectContaining({
        changedFields: expect.arrayContaining([
          expect.objectContaining({ field: "filteringattributes" }),
        ]),
      }),
    ]);
    expect(result.imageResult?.differences).toEqual([
      expect.objectContaining({
        changedFields: expect.arrayContaining([expect.objectContaining({ field: "attributes" })]),
      }),
    ]);
  });
});
