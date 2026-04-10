import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";
import { registerListEnvironmentVariables } from "./alm/list-environment-variables.js";
import { registerGetEnvironmentVariableDetails } from "./alm/get-environment-variable-details.js";
import { registerListConnectionReferences } from "./alm/list-connection-references.js";
import { registerGetConnectionReferenceDetails } from "./alm/get-connection-reference-details.js";
import { registerListAppModules } from "./alm/list-app-modules.js";
import { registerGetAppModuleDetails } from "./alm/get-app-module-details.js";
import { registerListDashboards } from "./alm/list-dashboards.js";
import { registerGetDashboardDetails } from "./alm/get-dashboard-details.js";
import { registerFindMetadata } from "./discovery/find-metadata.js";
import { registerListPlugins } from "./plugins/list-plugins.js";
import { registerListPluginSteps } from "./plugins/list-plugin-steps.js";
import { registerGetPluginDetails } from "./plugins/get-plugin-details.js";
import { registerListPluginAssemblies } from "./plugins/list-plugin-assemblies.js";
import { registerListPluginAssemblySteps } from "./plugins/list-plugin-assembly-steps.js";
import { registerListPluginAssemblyImages } from "./plugins/list-plugin-assembly-images.js";
import { registerGetPluginAssemblyDetails } from "./plugins/get-plugin-assembly-details.js";
import { registerListWorkflows } from "./workflows/list-workflows.js";
import { registerListActions } from "./workflows/list-actions.js";
import { registerGetWorkflowDetails } from "./workflows/get-workflow-details.js";
import { registerListWebResources } from "./web-resources/list-web-resources.js";
import { registerGetWebResourceContent } from "./web-resources/get-web-resource-content.js";
import { registerListSolutions } from "./solutions/list-solutions.js";
import { registerGetSolutionDetails } from "./solutions/get-solution-details.js";
import { registerGetSolutionDependencies } from "./solutions/get-solution-dependencies.js";
import { registerListTables } from "./tables/list-tables.js";
import { registerGetTableSchema } from "./tables/get-table-schema.js";
import { registerListTableColumns } from "./tables/list-table-columns.js";
import { registerListTableRelationships } from "./tables/list-table-relationships.js";
import { registerListForms } from "./forms/list-forms.js";
import { registerGetFormDetails } from "./forms/get-form-details.js";
import { registerListViews } from "./views/list-views.js";
import { registerGetViewDetails } from "./views/get-view-details.js";
import { registerGetViewFetchXml } from "./views/get-view-fetchxml.js";
import { registerListCustomApis } from "./custom-apis/list-custom-apis.js";
import { registerGetCustomApiDetails } from "./custom-apis/get-custom-api-details.js";
import { registerListCloudFlows } from "./flows/list-cloud-flows.js";
import { registerGetFlowDetails } from "./flows/get-flow-details.js";
import { registerListSecurityRoles } from "./security/list-security-roles.js";
import { registerGetRolePrivileges } from "./security/get-role-privileges.js";
import { registerFindTableUsage } from "./usage/find-table-usage.js";
import { registerFindColumnUsage } from "./usage/find-column-usage.js";
import { registerFindWebResourceUsage } from "./usage/find-web-resource-usage.js";
import { registerAnalyzeCreateTriggers } from "./usage/analyze-create-triggers.js";
import { registerAnalyzeUpdateTriggers } from "./usage/analyze-update-triggers.js";
import { registerAnalyzeImpact } from "./impact/analyze-impact.js";
import { registerEnvironmentHealthReport } from "./health/environment-health-report.js";
import { registerReleaseGateReport } from "./health/release-gate-report.js";
import { registerComparePluginAssemblies } from "./comparison/compare-plugin-assemblies.js";
import { registerCompareSolutions } from "./comparison/compare-solutions.js";
import { registerCompareWorkflows } from "./comparison/compare-workflows.js";
import { registerCompareWebResources } from "./comparison/compare-web-resources.js";
import { registerCompareEnvironmentMatrix } from "./comparison/compare-environment-matrix.js";
import { registerCompareTableSchema } from "./comparison/compare-table-schema.js";
import { registerCompareForms } from "./comparison/compare-forms.js";
import { registerCompareViews } from "./comparison/compare-views.js";
import { registerCompareCustomApis } from "./comparison/compare-custom-apis.js";
import { registerCompareSecurityRoles } from "./comparison/compare-security-roles.js";

type ToolRegistrar = (server: McpServer, config: AppConfig, client: DynamicsClient) => void;

export const TOOL_GROUP_IDS = [
  "discovery",
  "solutions_alm",
  "schema_ui",
  "automation_runtime",
  "usage_analysis",
  "health",
  "comparison",
] as const;

export type ToolGroupId = (typeof TOOL_GROUP_IDS)[number];

export interface ToolGroupDefinition {
  id: ToolGroupId;
  title: string;
  readmeSection: "metadata" | "comparison";
}

export interface ToolManifestEntry {
  name: string;
  group: ToolGroupId;
  description: string;
  mainParams: readonly string[];
  register: ToolRegistrar;
}

export const TOOL_GROUPS: readonly ToolGroupDefinition[] = [
  {
    id: "discovery",
    title: "Discovery",
    readmeSection: "metadata",
  },
  {
    id: "solutions_alm",
    title: "Solutions And ALM",
    readmeSection: "metadata",
  },
  {
    id: "schema_ui",
    title: "Schema And UI",
    readmeSection: "metadata",
  },
  {
    id: "automation_runtime",
    title: "Automation And Runtime",
    readmeSection: "metadata",
  },
  {
    id: "usage_analysis",
    title: "Usage And Impact",
    readmeSection: "metadata",
  },
  {
    id: "health",
    title: "Health",
    readmeSection: "metadata",
  },
  {
    id: "comparison",
    title: "Cross-Environment Comparison",
    readmeSection: "comparison",
  },
] as const;

export const TOOL_MANIFEST: readonly ToolManifestEntry[] = [
  {
    name: "list_environment_variables",
    group: "solutions_alm",
    description: "List environment variables.",
    mainParams: ["environment", "nameFilter", "solution"],
    register: registerListEnvironmentVariables,
  },
  {
    name: "get_environment_variable_details",
    group: "solutions_alm",
    description: "Show details for one environment variable.",
    mainParams: ["environment", "variableName", "solution"],
    register: registerGetEnvironmentVariableDetails,
  },
  {
    name: "list_connection_references",
    group: "solutions_alm",
    description: "List connection references.",
    mainParams: ["environment", "nameFilter", "solution"],
    register: registerListConnectionReferences,
  },
  {
    name: "get_connection_reference_details",
    group: "solutions_alm",
    description: "Show details for one connection reference.",
    mainParams: ["environment", "referenceName", "solution"],
    register: registerGetConnectionReferenceDetails,
  },
  {
    name: "list_app_modules",
    group: "solutions_alm",
    description: "List model-driven apps.",
    mainParams: ["environment", "nameFilter", "solution"],
    register: registerListAppModules,
  },
  {
    name: "get_app_module_details",
    group: "solutions_alm",
    description: "Show details for one model-driven app.",
    mainParams: ["environment", "appName", "solution"],
    register: registerGetAppModuleDetails,
  },
  {
    name: "list_dashboards",
    group: "solutions_alm",
    description: "List dashboards.",
    mainParams: ["environment", "nameFilter", "solution"],
    register: registerListDashboards,
  },
  {
    name: "get_dashboard_details",
    group: "solutions_alm",
    description: "Show details for one dashboard.",
    mainParams: ["environment", "dashboardName", "solution"],
    register: registerGetDashboardDetails,
  },
  {
    name: "find_metadata",
    group: "discovery",
    description: "Search across common Dynamics 365 metadata and suggest the next tool.",
    mainParams: ["environment", "query", "componentType", "limit"],
    register: registerFindMetadata,
  },
  {
    name: "list_plugins",
    group: "automation_runtime",
    description: "List plugin classes and optionally filter orphaned items.",
    mainParams: ["environment", "filter", "solution"],
    register: registerListPlugins,
  },
  {
    name: "list_plugin_steps",
    group: "automation_runtime",
    description: "List steps for one plugin class.",
    mainParams: ["environment", "pluginName", "assemblyName", "solution"],
    register: registerListPluginSteps,
  },
  {
    name: "get_plugin_details",
    group: "automation_runtime",
    description: "Show one plugin class with steps and images.",
    mainParams: ["environment", "pluginName", "assemblyName", "solution"],
    register: registerGetPluginDetails,
  },
  {
    name: "list_plugin_assemblies",
    group: "automation_runtime",
    description: "List plugin assemblies and optionally filter orphaned items.",
    mainParams: ["environment", "filter", "solution"],
    register: registerListPluginAssemblies,
  },
  {
    name: "list_plugin_assembly_steps",
    group: "automation_runtime",
    description: "List steps for one plugin assembly.",
    mainParams: ["environment", "assemblyName"],
    register: registerListPluginAssemblySteps,
  },
  {
    name: "list_plugin_assembly_images",
    group: "automation_runtime",
    description: "List pre and post images for one plugin assembly.",
    mainParams: ["environment", "assemblyName", "stepName", "message"],
    register: registerListPluginAssemblyImages,
  },
  {
    name: "get_plugin_assembly_details",
    group: "automation_runtime",
    description: "Show one plugin assembly with classes, steps, and images.",
    mainParams: ["environment", "assemblyName"],
    register: registerGetPluginAssemblyDetails,
  },
  {
    name: "list_workflows",
    group: "automation_runtime",
    description: "List workflows and processes with status.",
    mainParams: ["environment", "category", "status", "solution"],
    register: registerListWorkflows,
  },
  {
    name: "list_actions",
    group: "automation_runtime",
    description: "List workflow-based custom actions.",
    mainParams: ["environment", "solution"],
    register: registerListActions,
  },
  {
    name: "get_workflow_details",
    group: "automation_runtime",
    description: "Show the full workflow definition.",
    mainParams: ["environment", "workflowName", "uniqueName"],
    register: registerGetWorkflowDetails,
  },
  {
    name: "list_web_resources",
    group: "automation_runtime",
    description: "List web resources by type.",
    mainParams: ["environment", "type", "nameFilter", "solution"],
    register: registerListWebResources,
  },
  {
    name: "get_web_resource_content",
    group: "automation_runtime",
    description: "Fetch decoded web resource content.",
    mainParams: ["environment", "name"],
    register: registerGetWebResourceContent,
  },
  {
    name: "list_solutions",
    group: "solutions_alm",
    description: "List solutions by display name and unique name.",
    mainParams: ["environment", "nameFilter"],
    register: registerListSolutions,
  },
  {
    name: "get_solution_details",
    group: "solutions_alm",
    description: "Show a solution summary and supported ALM component groups.",
    mainParams: ["environment", "solution"],
    register: registerGetSolutionDetails,
  },
  {
    name: "get_solution_dependencies",
    group: "solutions_alm",
    description: "Show dependency links for supported solution components.",
    mainParams: ["environment", "solution", "direction", "componentType"],
    register: registerGetSolutionDependencies,
  },
  {
    name: "list_tables",
    group: "schema_ui",
    description: "List Dataverse tables with main schema flags.",
    mainParams: ["environment", "nameFilter", "solution"],
    register: registerListTables,
  },
  {
    name: "get_table_schema",
    group: "schema_ui",
    description: "Show columns, keys, and relationships for one table.",
    mainParams: ["environment", "table", "solution"],
    register: registerGetTableSchema,
  },
  {
    name: "list_table_columns",
    group: "schema_ui",
    description: "List columns and choice details for one table.",
    mainParams: ["environment", "table", "solution"],
    register: registerListTableColumns,
  },
  {
    name: "list_table_relationships",
    group: "schema_ui",
    description: "List relationships for one table.",
    mainParams: ["environment", "table", "solution"],
    register: registerListTableRelationships,
  },
  {
    name: "list_forms",
    group: "schema_ui",
    description: "List model-driven forms.",
    mainParams: ["environment", "table", "type", "solution"],
    register: registerListForms,
  },
  {
    name: "get_form_details",
    group: "schema_ui",
    description: "Show one form with a normalized XML summary.",
    mainParams: ["environment", "formName", "table", "solution"],
    register: registerGetFormDetails,
  },
  {
    name: "list_views",
    group: "schema_ui",
    description: "List system or personal views.",
    mainParams: ["environment", "table", "scope", "solution"],
    register: registerListViews,
  },
  {
    name: "get_view_details",
    group: "schema_ui",
    description: "Show one view with a normalized query summary.",
    mainParams: ["environment", "viewName", "table", "scope"],
    register: registerGetViewDetails,
  },
  {
    name: "get_view_fetchxml",
    group: "schema_ui",
    description: "Return normalized FetchXML for one view.",
    mainParams: ["environment", "viewName", "table", "scope"],
    register: registerGetViewFetchXml,
  },
  {
    name: "list_custom_apis",
    group: "automation_runtime",
    description: "List Dataverse Custom APIs.",
    mainParams: ["environment", "nameFilter"],
    register: registerListCustomApis,
  },
  {
    name: "get_custom_api_details",
    group: "automation_runtime",
    description: "Show Custom API request and response metadata.",
    mainParams: ["environment", "apiName"],
    register: registerGetCustomApiDetails,
  },
  {
    name: "list_cloud_flows",
    group: "automation_runtime",
    description: "List cloud flows from workflow metadata.",
    mainParams: ["environment", "status", "solution"],
    register: registerListCloudFlows,
  },
  {
    name: "get_flow_details",
    group: "automation_runtime",
    description: "Show one cloud flow with trigger and action summary.",
    mainParams: ["environment", "flowName", "solution"],
    register: registerGetFlowDetails,
  },
  {
    name: "list_security_roles",
    group: "solutions_alm",
    description: "List security roles.",
    mainParams: ["environment", "nameFilter"],
    register: registerListSecurityRoles,
  },
  {
    name: "get_role_privileges",
    group: "solutions_alm",
    description:
      "Show privileges for one security role. Uses the default global business unit when `businessUnit` is missing.",
    mainParams: ["environment", "roleName", "businessUnit"],
    register: registerGetRolePrivileges,
  },
  {
    name: "find_table_usage",
    group: "usage_analysis",
    description: "Find where one table is used.",
    mainParams: ["environment", "table"],
    register: registerFindTableUsage,
  },
  {
    name: "find_column_usage",
    group: "usage_analysis",
    description: "Find where one column is used.",
    mainParams: ["environment", "column", "table"],
    register: registerFindColumnUsage,
  },
  {
    name: "find_web_resource_usage",
    group: "usage_analysis",
    description: "Find where one web resource is used.",
    mainParams: ["environment", "name"],
    register: registerFindWebResourceUsage,
  },
  {
    name: "analyze_create_triggers",
    group: "usage_analysis",
    description: "Analyze direct create triggers for a table create.",
    mainParams: ["environment", "table", "providedAttributes"],
    register: registerAnalyzeCreateTriggers,
  },
  {
    name: "analyze_update_triggers",
    group: "usage_analysis",
    description: "Analyze direct update triggers for a table change.",
    mainParams: ["environment", "table", "changedAttributes"],
    register: registerAnalyzeUpdateTriggers,
  },
  {
    name: "analyze_impact",
    group: "usage_analysis",
    description: "Build one impact report for a component or solution.",
    mainParams: ["environment", "componentType", "name"],
    register: registerAnalyzeImpact,
  },
  {
    name: "environment_health_report",
    group: "health",
    description: "Build a release-health summary for one environment.",
    mainParams: ["environment", "solution"],
    register: registerEnvironmentHealthReport,
  },
  {
    name: "release_gate_report",
    group: "health",
    description: "Build an opinionated go or no-go report for moving one solution.",
    mainParams: ["environment", "solution", "targetEnvironment", "strict"],
    register: registerReleaseGateReport,
  },
  {
    name: "compare_plugin_assemblies",
    group: "comparison",
    description: "Compare plugin assemblies across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "assemblyName"],
    register: registerComparePluginAssemblies,
  },
  {
    name: "compare_solutions",
    group: "comparison",
    description: "Compare supported solution components across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "solution"],
    register: registerCompareSolutions,
  },
  {
    name: "compare_workflows",
    group: "comparison",
    description: "Compare workflow state and definitions across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "category", "workflowName"],
    register: registerCompareWorkflows,
  },
  {
    name: "compare_web_resources",
    group: "comparison",
    description: "Compare web resource content across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "type", "nameFilter"],
    register: registerCompareWebResources,
  },
  {
    name: "compare_environment_matrix",
    group: "comparison",
    description: "Compare one baseline against many target environments.",
    mainParams: ["baselineEnvironment", "targetEnvironments", "componentType"],
    register: registerCompareEnvironmentMatrix,
  },
  {
    name: "compare_table_schema",
    group: "comparison",
    description: "Compare one table schema across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "targetTable"],
    register: registerCompareTableSchema,
  },
  {
    name: "compare_forms",
    group: "comparison",
    description: "Compare forms across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "type", "solution"],
    register: registerCompareForms,
  },
  {
    name: "compare_views",
    group: "comparison",
    description: "Compare views across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "scope", "solution"],
    register: registerCompareViews,
  },
  {
    name: "compare_custom_apis",
    group: "comparison",
    description: "Compare Custom APIs across environments.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "apiName"],
    register: registerCompareCustomApis,
  },
  {
    name: "compare_security_roles",
    group: "comparison",
    description:
      "Compare security roles across environments. Uses each environment's default global business unit when business unit is missing.",
    mainParams: ["sourceEnvironment", "targetEnvironment", "roleName"],
    register: registerCompareSecurityRoles,
  },
] as const;

export const EXPECTED_TOOL_NAMES = TOOL_MANIFEST.map((entry) => entry.name).sort((left, right) =>
  left.localeCompare(right),
);

export function getToolGroup(groupId: ToolGroupId): ToolGroupDefinition {
  const group = TOOL_GROUPS.find((item) => item.id === groupId);
  if (!group) {
    throw new Error(`Unknown tool group '${groupId}'`);
  }
  return group;
}

export function getToolEntriesByGroup(groupId: ToolGroupId): ToolManifestEntry[] {
  return TOOL_MANIFEST.filter((entry) => entry.group === groupId);
}

export function getToolEntriesByReadmeSection(
  section: ToolGroupDefinition["readmeSection"],
): ToolManifestEntry[] {
  return TOOL_GROUPS.filter((group) => group.readmeSection === section).flatMap((group) =>
    getToolEntriesByGroup(group.id),
  );
}
