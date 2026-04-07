import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../index.js";
import {
  EXPECTED_TOOL_NAMES,
  createRecordingClient,
  createTestConfig,
} from "./tool-test-helpers.js";

async function createConnectedToolClient(
  datasets: Record<string, Record<string, unknown>>,
  environmentNames: string[],
) {
  const server = new McpServer({
    name: "tool-contract-test-server",
    version: "1.0.0",
  });
  const config = createTestConfig(environmentNames);
  const { client: dynamicsClient } = createRecordingClient(datasets);
  registerAllTools(server, config, dynamicsClient);

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({
    name: "tool-contract-test-client",
    version: "1.0.0",
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  async function close(): Promise<void> {
    await Promise.allSettled([client.close(), server.close()]);
  }

  return { client, close };
}

describe("tool contracts", () => {
  it("publishes the expected tool list and basic input schemas", async () => {
    const harness = await createConnectedToolClient({ dev: {}, prod: {} }, ["dev", "prod"]);

    try {
      const result = await harness.client.listTools();
      const names = result.tools
        .map((tool) => tool.name)
        .sort((left, right) => left.localeCompare(right));
      const toolsByName = Object.fromEntries(result.tools.map((tool) => [tool.name, tool]));

      expect(names).toEqual(EXPECTED_TOOL_NAMES);

      for (const tool of result.tools) {
        expect(tool.inputSchema.type).toBe("object");
      }

      expect(toolsByName.list_tables.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_plugin_assembly_steps.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        assemblyName: expect.any(Object),
      });
      expect(toolsByName.list_plugins.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        filter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_plugin_steps.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        pluginName: expect.any(Object),
        assemblyName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.get_plugin_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        pluginName: expect.any(Object),
        assemblyName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_plugins.description).toContain("plugin classes");
      expect(toolsByName.get_plugin_details.description).toContain("plugin class");
      expect(toolsByName.compare_custom_apis.inputSchema.required).toEqual([
        "sourceEnvironment",
        "targetEnvironment",
      ]);
      expect(toolsByName.get_solution_dependencies.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        solution: expect.any(Object),
        direction: expect.any(Object),
        componentType: expect.any(Object),
      });
    } finally {
      await harness.close();
    }
  });

  it("returns stable success envelopes for representative tools", async () => {
    const harness = await createConnectedToolClient(
      {
        dev: {
          EntityDefinitions: [
            {
              MetadataId: "table-1",
              LogicalName: "account",
              SchemaName: "Account",
              DisplayName: { UserLocalizedLabel: { Label: "Account" } },
              DisplayCollectionName: { UserLocalizedLabel: { Label: "Accounts" } },
              Description: { UserLocalizedLabel: { Label: "Main account table" } },
              EntitySetName: "accounts",
              PrimaryIdAttribute: "accountid",
              PrimaryNameAttribute: "name",
              OwnershipType: { Value: "UserOwned" },
              IsCustomEntity: false,
              IsManaged: true,
              IsActivity: false,
              IsAuditEnabled: { Value: true },
              IsValidForAdvancedFind: true,
              ChangeTrackingEnabled: false,
            },
          ],
          customapis: [
            {
              customapiid: "api-dev-1",
              name: "Do Thing",
              uniquename: "contoso_DoThing",
              bindingtype: 0,
              isfunction: false,
              isprivate: false,
              allowedcustomprocessingsteptype: 2,
              workflowsdkstepenabled: false,
              ismanaged: false,
              statecode: 0,
            },
          ],
          customapirequestparameters: [
            {
              customapirequestparameterid: "req-1",
              _customapiid_value: "api-dev-1",
              name: "Target",
              uniquename: "contoso_Target",
              type: 5,
              isoptional: true,
              logicalentityname: "account",
              ismanaged: false,
              statecode: 0,
            },
          ],
          customapiresponseproperties: [],
        },
        prod: {
          customapis: [
            {
              customapiid: "api-prod-1",
              name: "Do Thing",
              uniquename: "contoso_DoThing",
              bindingtype: 0,
              isfunction: false,
              isprivate: false,
              allowedcustomprocessingsteptype: 2,
              workflowsdkstepenabled: true,
              ismanaged: false,
              statecode: 0,
            },
          ],
          customapirequestparameters: [
            {
              customapirequestparameterid: "req-1",
              _customapiid_value: "api-prod-1",
              name: "Target",
              uniquename: "contoso_Target",
              type: 5,
              isoptional: false,
              logicalentityname: "account",
              ismanaged: false,
              statecode: 0,
            },
          ],
          customapiresponseproperties: [],
        },
      },
      ["dev", "prod"],
    );

    try {
      const listTablesResult = await harness.client.callTool({
        name: "list_tables",
        arguments: {},
      });
      const compareApisResult = await harness.client.callTool({
        name: "compare_custom_apis",
        arguments: {
          sourceEnvironment: "prod",
          targetEnvironment: "dev",
          apiName: "Do Thing",
        },
      });

      expect(listTablesResult.structuredContent).toMatchObject({
        version: "1",
        tool: "list_tables",
        ok: true,
        summary: "Found 1 table(s) in 'dev'.",
        data: {
          environment: "dev",
          count: 1,
        },
      });
      expect(listTablesResult.content[0]?.type).toBe("text");
      if (listTablesResult.content[0]?.type === "text") {
        expect(listTablesResult.content[0].text).toContain("## Tables in 'dev'");
      }

      expect(compareApisResult.structuredContent).toMatchObject({
        version: "1",
        tool: "compare_custom_apis",
        ok: true,
        data: {
          sourceEnvironment: "prod",
          targetEnvironment: "dev",
          apiName: "Do Thing",
        },
      });
      expect(compareApisResult.content[0]?.type).toBe("text");
      if (compareApisResult.content[0]?.type === "text") {
        expect(compareApisResult.content[0].text).toContain("Request Parameters");
      }
    } finally {
      await harness.close();
    }
  });

  it("returns a stable error envelope when tool input cannot be resolved", async () => {
    const harness = await createConnectedToolClient({ dev: {} }, ["dev"]);

    try {
      const response = await harness.client.callTool({
        name: "list_solutions",
        arguments: {
          environment: "missing",
        },
      });

      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({
        version: "1",
        tool: "list_solutions",
        ok: false,
        error: {
          name: "Error",
          message: "Environment 'missing' not found. Available: dev",
        },
      });
    } finally {
      await harness.close();
    }
  });
});
