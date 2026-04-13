import { listEnvironmentVariablesTool } from "./alm/list-environment-variables.js";
import { getEnvironmentVariableDetailsTool } from "./alm/get-environment-variable-details.js";
import { listConnectionReferencesTool } from "./alm/list-connection-references.js";
import { getConnectionReferenceDetailsTool } from "./alm/get-connection-reference-details.js";
import { listAppModulesTool } from "./alm/list-app-modules.js";
import { getAppModuleDetailsTool } from "./alm/get-app-module-details.js";
import { listDashboardsTool } from "./alm/list-dashboards.js";
import { getDashboardDetailsTool } from "./alm/get-dashboard-details.js";
import { findMetadataTool } from "./discovery/find-metadata.js";
import { listPluginsTool } from "./plugins/list-plugins.js";
import { listPluginStepsTool } from "./plugins/list-plugin-steps.js";
import { getPluginDetailsTool } from "./plugins/get-plugin-details.js";
import { listPluginAssembliesTool } from "./plugins/list-plugin-assemblies.js";
import { listPluginAssemblyStepsTool } from "./plugins/list-plugin-assembly-steps.js";
import { listPluginAssemblyImagesTool } from "./plugins/list-plugin-assembly-images.js";
import { getPluginAssemblyDetailsTool } from "./plugins/get-plugin-assembly-details.js";
import { listWorkflowsTool } from "./workflows/list-workflows.js";
import { listActionsTool } from "./workflows/list-actions.js";
import { getWorkflowDetailsTool } from "./workflows/get-workflow-details.js";
import { listWebResourcesTool } from "./web-resources/list-web-resources.js";
import { getWebResourceContentTool } from "./web-resources/get-web-resource-content.js";
import { listSolutionsTool } from "./solutions/list-solutions.js";
import { getSolutionDetailsTool } from "./solutions/get-solution-details.js";
import { getSolutionDependenciesTool } from "./solutions/get-solution-dependencies.js";
import { listTablesTool } from "./tables/list-tables.js";
import { getTableSchemaTool } from "./tables/get-table-schema.js";
import { listTableColumnsTool } from "./tables/list-table-columns.js";
import { listTableRelationshipsTool } from "./tables/list-table-relationships.js";
import { listFormsTool } from "./forms/list-forms.js";
import { getFormDetailsTool } from "./forms/get-form-details.js";
import { listTableRibbonsTool } from "./ribbons/list-table-ribbons.js";
import { getRibbonButtonDetailsTool } from "./ribbons/get-ribbon-button-details.js";
import { listViewsTool } from "./views/list-views.js";
import { getViewDetailsTool } from "./views/get-view-details.js";
import { getViewFetchXmlTool } from "./views/get-view-fetchxml.js";
import { listCustomApisTool } from "./custom-apis/list-custom-apis.js";
import { getCustomApiDetailsTool } from "./custom-apis/get-custom-api-details.js";
import { listCloudFlowsTool } from "./flows/list-cloud-flows.js";
import { getFlowDetailsTool } from "./flows/get-flow-details.js";
import { listBusinessUnitsTool } from "./security/list-business-units.js";
import { getBusinessUnitsDetailsTool } from "./security/get-business-units-details.js";
import { listSecurityRolesTool } from "./security/list-security-roles.js";
import { getRolePrivilegesTool } from "./security/get-role-privileges.js";
import { findTableUsageTool } from "./usage/find-table-usage.js";
import { findColumnUsageTool } from "./usage/find-column-usage.js";
import { findWebResourceUsageTool } from "./usage/find-web-resource-usage.js";
import { analyzeCreateTriggersTool } from "./usage/analyze-create-triggers.js";
import { analyzeUpdateTriggersTool } from "./usage/analyze-update-triggers.js";
import { analyzeImpactTool } from "./impact/analyze-impact.js";
import { environmentHealthReportTool } from "./health/environment-health-report.js";
import { releaseGateReportTool } from "./health/release-gate-report.js";
import { comparePluginAssembliesTool } from "./comparison/compare-plugin-assemblies.js";
import { compareSolutionsTool } from "./comparison/compare-solutions.js";
import { compareWorkflowsTool } from "./comparison/compare-workflows.js";
import { compareWebResourcesTool } from "./comparison/compare-web-resources.js";
import { compareEnvironmentMatrixTool } from "./comparison/compare-environment-matrix.js";
import { compareTableSchemaTool } from "./comparison/compare-table-schema.js";
import { compareFormsTool } from "./comparison/compare-forms.js";
import { compareViewsTool } from "./comparison/compare-views.js";
import { compareCustomApisTool } from "./comparison/compare-custom-apis.js";
import { compareSecurityRolesTool } from "./comparison/compare-security-roles.js";

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

export const TOOL_MANIFEST = [
  {
    ...listEnvironmentVariablesTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "solution"],
  },
  {
    ...getEnvironmentVariableDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "variableName", "solution"],
  },
  {
    ...listConnectionReferencesTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "solution"],
  },
  {
    ...getConnectionReferenceDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "referenceName", "solution"],
  },
  {
    ...listAppModulesTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "solution"],
  },
  {
    ...getAppModuleDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "appName", "solution"],
  },
  {
    ...listDashboardsTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "solution"],
  },
  {
    ...getDashboardDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "dashboardName", "solution"],
  },
  {
    ...findMetadataTool,
    group: "discovery",
    mainParams: ["environment", "query", "componentType", "limit"],
  },
  {
    ...listPluginsTool,
    group: "automation_runtime",
    mainParams: ["environment", "filter", "solution"],
  },
  {
    ...listPluginStepsTool,
    group: "automation_runtime",
    mainParams: ["environment", "pluginName", "assemblyName", "solution"],
  },
  {
    ...getPluginDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "pluginName", "assemblyName", "solution"],
  },
  {
    ...listPluginAssembliesTool,
    group: "automation_runtime",
    mainParams: ["environment", "filter", "solution"],
  },
  {
    ...listPluginAssemblyStepsTool,
    group: "automation_runtime",
    mainParams: ["environment", "assemblyName"],
  },
  {
    ...listPluginAssemblyImagesTool,
    group: "automation_runtime",
    mainParams: ["environment", "assemblyName", "stepName", "message"],
  },
  {
    ...getPluginAssemblyDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "assemblyName"],
  },
  {
    ...listWorkflowsTool,
    group: "automation_runtime",
    mainParams: ["environment", "category", "status", "solution"],
  },
  {
    ...listActionsTool,
    group: "automation_runtime",
    mainParams: ["environment", "solution"],
  },
  {
    ...getWorkflowDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "workflowName", "uniqueName"],
  },
  {
    ...listWebResourcesTool,
    group: "automation_runtime",
    mainParams: ["environment", "type", "nameFilter", "solution"],
  },
  {
    ...getWebResourceContentTool,
    group: "automation_runtime",
    mainParams: ["environment", "name"],
  },
  {
    ...listSolutionsTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter"],
  },
  {
    ...getSolutionDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "solution"],
  },
  {
    ...getSolutionDependenciesTool,
    group: "solutions_alm",
    mainParams: ["environment", "solution", "direction", "componentType"],
  },
  {
    ...listTablesTool,
    group: "schema_ui",
    mainParams: ["environment", "nameFilter", "solution"],
  },
  {
    ...getTableSchemaTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listTableColumnsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listTableRelationshipsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listFormsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "type", "solution"],
  },
  {
    ...getFormDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "formName", "table", "solution"],
  },
  {
    ...listTableRibbonsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "location"],
  },
  {
    ...getRibbonButtonDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "buttonName", "location"],
  },
  {
    ...listViewsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "scope", "solution"],
  },
  {
    ...getViewDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "viewName", "table", "scope"],
  },
  {
    ...getViewFetchXmlTool,
    group: "schema_ui",
    mainParams: ["environment", "viewName", "table", "scope"],
  },
  {
    ...listCustomApisTool,
    group: "automation_runtime",
    mainParams: ["environment", "nameFilter"],
  },
  {
    ...getCustomApiDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "apiName"],
  },
  {
    ...listCloudFlowsTool,
    group: "automation_runtime",
    mainParams: ["environment", "status", "solution"],
  },
  {
    ...getFlowDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "flowName", "solution"],
  },
  {
    ...listBusinessUnitsTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter"],
  },
  {
    ...getBusinessUnitsDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "businessUnitName"],
  },
  {
    ...listSecurityRolesTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "businessUnit"],
  },
  {
    ...getRolePrivilegesTool,
    group: "solutions_alm",
    mainParams: ["environment", "roleName", "businessUnit"],
  },
  {
    ...findTableUsageTool,
    group: "usage_analysis",
    mainParams: ["environment", "table"],
  },
  {
    ...findColumnUsageTool,
    group: "usage_analysis",
    mainParams: ["environment", "column", "table"],
  },
  {
    ...findWebResourceUsageTool,
    group: "usage_analysis",
    mainParams: ["environment", "name"],
  },
  {
    ...analyzeCreateTriggersTool,
    group: "usage_analysis",
    mainParams: ["environment", "table", "providedAttributes"],
  },
  {
    ...analyzeUpdateTriggersTool,
    group: "usage_analysis",
    mainParams: ["environment", "table", "changedAttributes"],
  },
  {
    ...analyzeImpactTool,
    group: "usage_analysis",
    mainParams: ["environment", "componentType", "name"],
  },
  {
    ...environmentHealthReportTool,
    group: "health",
    mainParams: ["environment", "solution"],
  },
  {
    ...releaseGateReportTool,
    group: "health",
    mainParams: ["environment", "solution", "targetEnvironment", "strict"],
  },
  {
    ...comparePluginAssembliesTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "assemblyName"],
  },
  {
    ...compareSolutionsTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "solution"],
  },
  {
    ...compareWorkflowsTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "category", "workflowName"],
  },
  {
    ...compareWebResourcesTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "type", "nameFilter"],
  },
  {
    ...compareEnvironmentMatrixTool,
    group: "comparison",
    mainParams: ["baselineEnvironment", "targetEnvironments", "componentType"],
  },
  {
    ...compareTableSchemaTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "targetTable"],
  },
  {
    ...compareFormsTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "type", "solution"],
  },
  {
    ...compareViewsTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "table", "scope", "solution"],
  },
  {
    ...compareCustomApisTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "apiName"],
  },
  {
    ...compareSecurityRolesTool,
    group: "comparison",
    mainParams: ["sourceEnvironment", "targetEnvironment", "roleName"],
  },
] as const;

export type ToolManifestEntry = (typeof TOOL_MANIFEST)[number];

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
