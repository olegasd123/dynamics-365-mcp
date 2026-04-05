import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";

// Plugin tools
import { registerListPlugins } from "./plugins/list-plugins.js";
import { registerListPluginSteps } from "./plugins/list-plugin-steps.js";
import { registerListPluginImages } from "./plugins/list-plugin-images.js";
import { registerGetPluginDetails } from "./plugins/get-plugin-details.js";

// Workflow tools
import { registerListWorkflows } from "./workflows/list-workflows.js";
import { registerListActions } from "./workflows/list-actions.js";
import { registerGetWorkflowDetails } from "./workflows/get-workflow-details.js";

// Web resource tools
import { registerListWebResources } from "./web-resources/list-web-resources.js";
import { registerGetWebResourceContent } from "./web-resources/get-web-resource-content.js";

// Solution tools
import { registerListSolutions } from "./solutions/list-solutions.js";
import { registerGetSolutionDetails } from "./solutions/get-solution-details.js";
import { registerGetSolutionDependencies } from "./solutions/get-solution-dependencies.js";

// Table tools
import { registerListTables } from "./tables/list-tables.js";
import { registerGetTableSchema } from "./tables/get-table-schema.js";
import { registerListTableColumns } from "./tables/list-table-columns.js";
import { registerListTableRelationships } from "./tables/list-table-relationships.js";

// Comparison tools
import { registerComparePlugins } from "./comparison/compare-plugins.js";
import { registerCompareSolutions } from "./comparison/compare-solutions.js";
import { registerCompareWorkflows } from "./comparison/compare-workflows.js";
import { registerCompareWebResources } from "./comparison/compare-web-resources.js";
import { registerCompareEnvironmentMatrix } from "./comparison/compare-environment-matrix.js";
import { registerCompareTableSchema } from "./comparison/compare-table-schema.js";

export function registerAllTools(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
): void {
  // Plugin tools
  registerListPlugins(server, config, client);
  registerListPluginSteps(server, config, client);
  registerListPluginImages(server, config, client);
  registerGetPluginDetails(server, config, client);

  // Workflow tools
  registerListWorkflows(server, config, client);
  registerListActions(server, config, client);
  registerGetWorkflowDetails(server, config, client);

  // Web resource tools
  registerListWebResources(server, config, client);
  registerGetWebResourceContent(server, config, client);

  // Solution tools
  registerListSolutions(server, config, client);
  registerGetSolutionDetails(server, config, client);
  registerGetSolutionDependencies(server, config, client);

  // Table tools
  registerListTables(server, config, client);
  registerGetTableSchema(server, config, client);
  registerListTableColumns(server, config, client);
  registerListTableRelationships(server, config, client);

  // Comparison tools
  registerComparePlugins(server, config, client);
  registerCompareSolutions(server, config, client);
  registerCompareWorkflows(server, config, client);
  registerCompareWebResources(server, config, client);
  registerCompareEnvironmentMatrix(server, config, client);
  registerCompareTableSchema(server, config, client);
}
