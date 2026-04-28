import { describe, expect, it } from "vitest";
import {
  comparePluginAssembliesData,
  compareWebResourcesData,
  compareWorkflowsData,
} from "../comparison-data.js";
import type { AppConfig } from "../../../config/types.js";
import { createRecordingClient } from "../../__tests__/tool-test-helpers.js";

describe("comparePluginAssembliesData", () => {
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
    };

    const client = createComparisonClient(datasets);

    const result = await comparePluginAssembliesData(config, client, "prod", "dev", {
      assemblyName: "Core.Plugins",
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

describe("compareWorkflowsData", () => {
  it("filters workflow names before diffing", async () => {
    const config = createComparisonConfig();
    const datasets: Record<string, Record<string, Record<string, unknown>[]>> = {
      prod: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            statecode: 1,
            statuscode: 2,
            category: 0,
            mode: 0,
            ismanaged: false,
          },
          {
            workflowid: "wf-2",
            name: "Contact Sync",
            uniquename: "contoso_ContactSync",
            statecode: 1,
            statuscode: 2,
            category: 0,
            mode: 0,
            ismanaged: false,
          },
        ],
      },
      dev: {
        workflows: [
          {
            workflowid: "wf-1",
            name: "Account Sync",
            uniquename: "contoso_AccountSync",
            statecode: 2,
            statuscode: 2,
            category: 0,
            mode: 0,
            ismanaged: false,
          },
          {
            workflowid: "wf-2",
            name: "Contact Sync",
            uniquename: "contoso_ContactSync",
            statecode: 1,
            statuscode: 2,
            category: 0,
            mode: 0,
            ismanaged: false,
          },
        ],
      },
    };

    const client = createComparisonClient(datasets);
    const result = await compareWorkflowsData(config, client, "prod", "dev", {
      workflowName: "Account",
    });

    expect(result.sourceItems).toHaveLength(1);
    expect(result.targetItems).toHaveLength(1);
    expect(result.result.differences).toEqual([
      expect.objectContaining({
        key: "contoso_AccountSync",
      }),
    ]);
  });
});

describe("compareWebResourcesData", () => {
  it("adds content hashes when compareContent is enabled", async () => {
    const config = createComparisonConfig();
    const datasets: Record<string, Record<string, Record<string, unknown>[]>> = {
      prod: {
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "new_/scripts/main.js",
            webresourcetype: 3,
            ismanaged: false,
            content: "console.log('prod');",
          },
        ],
      },
      dev: {
        webresourceset: [
          {
            webresourceid: "wr-1",
            name: "new_/scripts/main.js",
            webresourcetype: 3,
            ismanaged: false,
            content: "console.log('dev');",
          },
        ],
      },
    };

    const client = createComparisonClient(datasets);
    const result = await compareWebResourcesData(config, client, "prod", "dev", {
      compareContent: true,
    });

    expect(result.result.differences).toEqual([
      expect.objectContaining({
        changedFields: expect.arrayContaining([expect.objectContaining({ field: "contentHash" })]),
      }),
    ]);
    expect(result.sourceItems[0]?.contentHash).toHaveLength(12);
    expect(result.targetItems[0]?.contentHash).toHaveLength(12);
  });
});

function createComparisonConfig(): AppConfig {
  return {
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
}

function createComparisonClient(
  datasets: Record<string, Record<string, Record<string, unknown>[]>>,
): never {
  return createRecordingClient(datasets).client;
}
