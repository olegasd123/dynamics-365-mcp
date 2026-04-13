import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../index.js";
import { installToolCallCompatibility } from "../../tool-call-compatibility.js";
import {
  EXPECTED_TOOL_NAMES,
  REMOVED_LEGACY_TOOL_NAMES,
  createRecordingClient,
  createTestConfig,
  type ToolResponse,
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
  installToolCallCompatibility(server);

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
        limit: expect.any(Object),
        cursor: expect.any(Object),
      });
      expect(toolsByName.find_metadata.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        query: expect.any(Object),
        componentType: expect.any(Object),
        limit: expect.any(Object),
      });
      expect(toolsByName.list_environment_variables.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.get_environment_variable_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        variableName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_connection_references.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.get_connection_reference_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        referenceName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_app_modules.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.get_app_module_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        appName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_dashboards.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.get_dashboard_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        dashboardName: expect.any(Object),
        solution: expect.any(Object),
      });
      expect(toolsByName.list_business_units.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
      });
      expect(toolsByName.get_business_units_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        businessUnitName: expect.any(Object),
      });
      expect(toolsByName.analyze_create_triggers.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        table: expect.any(Object),
        providedAttributes: expect.any(Object),
      });
      expect(toolsByName.analyze_update_triggers.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        table: expect.any(Object),
        changedAttributes: expect.any(Object),
      });
      expect(toolsByName.list_plugin_assembly_steps.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        assemblyName: expect.any(Object),
      });
      expect(toolsByName.list_plugin_assembly_images.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        assemblyName: expect.any(Object),
        stepName: expect.any(Object),
        message: expect.any(Object),
      });
      expect(toolsByName.list_plugins.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        filter: expect.any(Object),
        solution: expect.any(Object),
        limit: expect.any(Object),
        cursor: expect.any(Object),
      });
      expect(toolsByName.list_views.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        table: expect.any(Object),
        scope: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
        limit: expect.any(Object),
        cursor: expect.any(Object),
      });
      expect(toolsByName.list_table_ribbons.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        table: expect.any(Object),
        location: expect.any(Object),
      });
      expect(toolsByName.get_ribbon_button_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        table: expect.any(Object),
        buttonName: expect.any(Object),
        location: expect.objectContaining({
          default: "all",
        }),
      });
      expect(toolsByName.list_solutions.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        nameFilter: expect.any(Object),
        limit: expect.any(Object),
        cursor: expect.any(Object),
      });
      expect(toolsByName.list_workflows.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        category: expect.any(Object),
        status: expect.any(Object),
        solution: expect.any(Object),
        limit: expect.any(Object),
        cursor: expect.any(Object),
      });
      expect(toolsByName.list_web_resources.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        type: expect.any(Object),
        nameFilter: expect.any(Object),
        solution: expect.any(Object),
        limit: expect.any(Object),
        cursor: expect.any(Object),
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
      expect(toolsByName.get_plugin_assembly_details.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        assemblyName: expect.any(Object),
      });
      expect(toolsByName.compare_plugin_assemblies.inputSchema.properties).toMatchObject({
        sourceEnvironment: expect.any(Object),
        targetEnvironment: expect.any(Object),
        assemblyName: expect.any(Object),
      });
      expect(toolsByName.list_plugins.description).toContain("plugin classes");
      expect(toolsByName.list_plugin_steps.description).toContain("plugin class");
      expect(toolsByName.get_plugin_details.description).toContain("plugin class");
      expect(toolsByName.list_plugin_assemblies.description).toContain("plugin assemblies");
      expect(toolsByName.list_plugin_assembly_steps.description).toContain("plugin assembly");
      expect(toolsByName.get_plugin_assembly_details.description).toContain("plugin assembly");
      expect(toolsByName.compare_plugin_assemblies.description).toContain("plugin assemblies");
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
      expect(toolsByName.release_gate_report.inputSchema.properties).toMatchObject({
        environment: expect.any(Object),
        solution: expect.any(Object),
        targetEnvironment: expect.any(Object),
        strict: expect.any(Object),
      });
      expect(REMOVED_LEGACY_TOOL_NAMES.every((legacyName) => !(legacyName in toolsByName))).toBe(
        true,
      );
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
      const listTablesResult = (await harness.client.callTool({
        name: "list_tables",
        arguments: {},
      })) as ToolResponse;
      const compareApisResult = (await harness.client.callTool({
        name: "compare_custom_apis",
        arguments: {
          sourceEnvironment: "prod",
          targetEnvironment: "dev",
          apiName: "Do Thing",
        },
      })) as ToolResponse;

      expect(listTablesResult.structuredContent).toMatchObject({
        version: "1",
        tool: "list_tables",
        ok: true,
        summary: "Found 1 table. Environment: 'dev'.",
        data: {
          environment: "dev",
          limit: 50,
          cursor: null,
          returnedCount: 1,
          totalCount: 1,
          hasMore: false,
          nextCursor: null,
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
          name: "EnvironmentNotFoundError",
          code: "environment_not_found",
          environment: "missing",
          availableEnvironments: ["dev"],
          retryable: false,
          message: "Environment 'missing' not found. Available: dev",
        },
      });
    } finally {
      await harness.close();
    }
  });

  it("maps legacy commentary tool calls to the canonical tool name before dispatch", async () => {
    const harness = await createConnectedToolClient(
      {
        dev: {
          EntityDefinitions: [],
        },
      },
      ["dev"],
    );

    try {
      const result = await harness.client.callTool({
        name: "list_tablescommentary",
        arguments: {
          environment: "dev",
        },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        tool: "list_tables",
        ok: true,
        data: {
          environment: "dev",
          limit: 50,
          cursor: null,
          returnedCount: 0,
          totalCount: 0,
          hasMore: false,
          nextCursor: null,
          items: [],
        },
      });
      expect(result.content[0]?.text).toContain("No tables found");
    } finally {
      await harness.close();
    }
  });
});
