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

// Form tools
import { registerListForms } from "./forms/list-forms.js";
import { registerGetFormDetails } from "./forms/get-form-details.js";

// View tools
import { registerListViews } from "./views/list-views.js";
import { registerGetViewDetails } from "./views/get-view-details.js";
import { registerGetViewFetchXml } from "./views/get-view-fetchxml.js";

// Custom API tools
import { registerListCustomApis } from "./custom-apis/list-custom-apis.js";
import { registerGetCustomApiDetails } from "./custom-apis/get-custom-api-details.js";

// Flow tools
import { registerListCloudFlows } from "./flows/list-cloud-flows.js";
import { registerGetFlowDetails } from "./flows/get-flow-details.js";

// Security tools
import { registerListSecurityRoles } from "./security/list-security-roles.js";
import { registerGetRolePrivileges } from "./security/get-role-privileges.js";

// Usage tools
import { registerFindTableUsage } from "./usage/find-table-usage.js";
import { registerFindColumnUsage } from "./usage/find-column-usage.js";
import { registerFindWebResourceUsage } from "./usage/find-web-resource-usage.js";
import { registerAnalyzeImpact } from "./impact/analyze-impact.js";

// Health tools
import { registerEnvironmentHealthReport } from "./health/environment-health-report.js";

// Comparison tools
import { registerComparePlugins } from "./comparison/compare-plugins.js";
import { registerCompareSolutions } from "./comparison/compare-solutions.js";
import { registerCompareWorkflows } from "./comparison/compare-workflows.js";
import { registerCompareWebResources } from "./comparison/compare-web-resources.js";
import { registerCompareEnvironmentMatrix } from "./comparison/compare-environment-matrix.js";
import { registerCompareTableSchema } from "./comparison/compare-table-schema.js";
import { registerCompareForms } from "./comparison/compare-forms.js";
import { registerCompareViews } from "./comparison/compare-views.js";
import { registerCompareCustomApis } from "./comparison/compare-custom-apis.js";
import { registerCompareSecurityRoles } from "./comparison/compare-security-roles.js";

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

  // Form tools
  registerListForms(server, config, client);
  registerGetFormDetails(server, config, client);

  // View tools
  registerListViews(server, config, client);
  registerGetViewDetails(server, config, client);
  registerGetViewFetchXml(server, config, client);

  // Custom API tools
  registerListCustomApis(server, config, client);
  registerGetCustomApiDetails(server, config, client);

  // Flow tools
  registerListCloudFlows(server, config, client);
  registerGetFlowDetails(server, config, client);

  // Security tools
  registerListSecurityRoles(server, config, client);
  registerGetRolePrivileges(server, config, client);

  // Usage tools
  registerFindTableUsage(server, config, client);
  registerFindColumnUsage(server, config, client);
  registerFindWebResourceUsage(server, config, client);
  registerAnalyzeImpact(server, config, client);

  // Health tools
  registerEnvironmentHealthReport(server, config, client);

  // Comparison tools
  registerComparePlugins(server, config, client);
  registerCompareSolutions(server, config, client);
  registerCompareWorkflows(server, config, client);
  registerCompareWebResources(server, config, client);
  registerCompareEnvironmentMatrix(server, config, client);
  registerCompareTableSchema(server, config, client);
  registerCompareForms(server, config, client);
  registerCompareViews(server, config, client);
  registerCompareCustomApis(server, config, client);
  registerCompareSecurityRoles(server, config, client);
}
