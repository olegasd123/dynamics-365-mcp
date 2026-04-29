import { listEnvironmentVariablesTool } from "./alm/list-environment-variables.js";
import { getEnvironmentVariableDetailsTool } from "./alm/get-environment-variable-details.js";
import { listConnectionReferencesTool } from "./alm/list-connection-references.js";
import { getConnectionReferenceDetailsTool } from "./alm/get-connection-reference-details.js";
import { listAppModulesTool } from "./alm/list-app-modules.js";
import { getAppModuleDetailsTool } from "./alm/get-app-module-details.js";
import { listSitemapsTool } from "./sitemaps/list-sitemaps.js";
import { getSitemapDetailsTool } from "./sitemaps/get-sitemap-details.js";
import { listDashboardsTool } from "./alm/list-dashboards.js";
import { getDashboardDetailsTool } from "./alm/get-dashboard-details.js";
import { findMetadataTool } from "./discovery/find-metadata.js";
import { listPluginsTool } from "./plugins/list-plugins.js";
import { listPluginStepsTool } from "./plugins/list-plugin-steps.js";
import { getPluginDetailsTool } from "./plugins/get-plugin-details.js";
import { listPluginAssembliesTool } from "./plugins/list-plugin-assemblies.js";
import { listPluginAssemblyStepsTool } from "./plugins/list-plugin-assembly-steps.js";
import { listPluginAssemblyImagesTool } from "./plugins/list-plugin-assembly-images.js";
import { listSdkMessageProcessingStepsTool } from "./plugins/list-sdk-message-processing-steps.js";
import { getPluginAssemblyDetailsTool } from "./plugins/get-plugin-assembly-details.js";
import { getPluginTraceLogDetailsTool } from "./plugins/get-plugin-trace-log-details.js";
import { listPluginTraceLogsTool } from "./plugins/list-plugin-trace-logs.js";
import { summarizePluginTraceLogsTool } from "./plugins/summarize-plugin-trace-logs.js";
import { getSystemJobDetailsTool } from "./system-jobs/get-system-job-details.js";
import { listSystemJobsTool } from "./system-jobs/list-system-jobs.js";
import { summarizeSystemJobsTool } from "./system-jobs/summarize-system-jobs.js";
import { listWorkflowsTool } from "./workflows/list-workflows.js";
import { listActionsTool } from "./workflows/list-actions.js";
import { getWorkflowDetailsTool } from "./workflows/get-workflow-details.js";
import { getBpfDetailsTool } from "./workflows/get-bpf-details.js";
import { listWebResourcesTool } from "./web-resources/list-web-resources.js";
import { getWebResourceContentTool } from "./web-resources/get-web-resource-content.js";
import { getPublisherDetailsTool } from "./publishers/get-publisher-details.js";
import { listPublishersTool } from "./publishers/list-publishers.js";
import { listSolutionsTool } from "./solutions/list-solutions.js";
import { getSolutionDetailsTool } from "./solutions/get-solution-details.js";
import { getSolutionDependenciesTool } from "./solutions/get-solution-dependencies.js";
import { getSolutionLayersTool } from "./solutions/get-solution-layers.js";
import { listTablesTool } from "./tables/list-tables.js";
import { getTableSchemaTool } from "./tables/get-table-schema.js";
import { listTableAlternateKeysTool } from "./tables/list-table-alternate-keys.js";
import { listDuplicateDetectionRulesTool } from "./tables/list-duplicate-detection-rules.js";
import { getTableMessageDetailsTool } from "./tables/get-table-message-details.js";
import { listTableMessagesTool } from "./tables/list-table-messages.js";
import { listTableColumnsTool } from "./tables/list-table-columns.js";
import { listTableRelationshipsTool } from "./tables/list-table-relationships.js";
import { listGlobalOptionSetsTool } from "./optionsets/list-global-option-sets.js";
import { getOptionSetDetailsTool } from "./optionsets/get-option-set-details.js";
import { listTableRecordsTool } from "./data/list-table-records.js";
import { getTableRecordDetailsTool } from "./data/get-table-record-details.js";
import { listAuditHistoryTool } from "./auditing/list-audit-history.js";
import { getAuditDetailsTool } from "./auditing/get-audit-details.js";
import { listFormsTool } from "./forms/list-forms.js";
import { getFormDetailsTool } from "./forms/get-form-details.js";
import { listTableRibbonsTool } from "./ribbons/list-table-ribbons.js";
import { getRibbonButtonDetailsTool } from "./ribbons/get-ribbon-button-details.js";
import { listViewsTool } from "./views/list-views.js";
import { getViewDetailsTool } from "./views/get-view-details.js";
import { getViewFetchXmlTool } from "./views/get-view-fetchxml.js";
import { listChartsTool } from "./charts/list-charts.js";
import { getChartDetailsTool } from "./charts/get-chart-details.js";
import { listEmailTemplatesTool } from "./email-templates/list-email-templates.js";
import { getEmailTemplateDetailsTool } from "./email-templates/get-email-template-details.js";
import { listDocumentTemplatesTool } from "./document-templates/list-document-templates.js";
import { getDocumentTemplateDetailsTool } from "./document-templates/get-document-template-details.js";
import { listCustomApisTool } from "./custom-apis/list-custom-apis.js";
import { getCustomApiDetailsTool } from "./custom-apis/get-custom-api-details.js";
import { listCloudFlowsTool } from "./flows/list-cloud-flows.js";
import { getFlowDetailsTool } from "./flows/get-flow-details.js";
import { listBusinessUnitsTool } from "./security/list-business-units.js";
import { getBusinessUnitsDetailsTool } from "./security/get-business-units-details.js";
import { listSecurityRolesTool } from "./security/list-security-roles.js";
import { getRolePrivilegesTool } from "./security/get-role-privileges.js";
import { listFieldSecurityProfilesTool } from "./security/list-field-security-profiles.js";
import { accessUtilizationReportTool } from "./security/access-utilization-report.js";
import { findTableUsageTool } from "./usage/find-table-usage.js";
import { findColumnUsageTool } from "./usage/find-column-usage.js";
import { findWebResourceUsageTool } from "./usage/find-web-resource-usage.js";
import { findWorkflowActivityUsageTool } from "./usage/find-workflow-activity-usage.js";
import { analyzeCreateTriggersTool } from "./usage/analyze-create-triggers.js";
import { analyzeUpdateTriggersTool } from "./usage/analyze-update-triggers.js";
import { analyzeImpactTool } from "./impact/analyze-impact.js";
import { storageBreakdownTool } from "./storage/storage-breakdown.js";
import { environmentHealthReportTool } from "./health/environment-health-report.js";
import { releaseGateReportTool } from "./health/release-gate-report.js";
import { comparePluginAssembliesTool } from "./comparison/compare-plugin-assemblies.js";
import { compareSolutionsTool } from "./comparison/compare-solutions.js";
import { compareWorkflowsTool } from "./comparison/compare-workflows.js";
import { compareWebResourcesTool } from "./comparison/compare-web-resources.js";
import { compareEnvironmentMatrixTool } from "./comparison/compare-environment-matrix.js";
import { compareEnvironmentVariableMatrixTool } from "./comparison/compare-environment-variable-matrix.js";
import { compareTableSchemaTool } from "./comparison/compare-table-schema.js";
import { compareFormsTool } from "./comparison/compare-forms.js";
import { compareViewsTool } from "./comparison/compare-views.js";
import { compareCustomApisTool } from "./comparison/compare-custom-apis.js";
import { compareSecurityRolesTool } from "./comparison/compare-security-roles.js";
import { compareDocumentTemplatesTool } from "./comparison/compare-document-templates.js";
import { runFetchXmlTool, isRunFetchXmlEnabled } from "./data/run-fetchxml.js";
import type { AppConfig } from "../config/types.js";

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

export interface ToolManifestMeta {
  group: ToolGroupId;
  mainParams: readonly string[];
  isEnabled?: (config: AppConfig) => boolean;
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
    ...listSitemapsTool,
    group: "schema_ui",
    mainParams: ["environment", "nameFilter", "solution", "appName"],
  },
  {
    ...getSitemapDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "sitemapName", "appName", "solution", "includeRawXml"],
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
    ...listSdkMessageProcessingStepsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "message",
      "primaryEntity",
      "stage",
      "mode",
      "statecode",
      "includeImages",
    ],
  },
  {
    ...getPluginAssemblyDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "assemblyName"],
  },
  {
    ...listPluginTraceLogsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "pluginName",
      "correlationId",
      "createdAfter",
      "createdBefore",
      "hasException",
      "limit",
      "cursor",
    ],
  },
  {
    ...summarizePluginTraceLogsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "pluginName",
      "createdAfter",
      "createdBefore",
      "groupBy",
      "maxRecords",
      "topExceptions",
    ],
  },
  {
    ...getPluginTraceLogDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "pluginTraceLogId"],
  },
  {
    ...listSystemJobsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "status",
      "jobType",
      "correlationId",
      "createdAfter",
      "completedAfter",
      "failedOnly",
      "limit",
      "cursor",
    ],
  },
  {
    ...summarizeSystemJobsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "createdAfter",
      "createdBefore",
      "jobType",
      "status",
      "groupBy",
      "bucketMinutes",
      "maxRecords",
      "topMessages",
    ],
  },
  {
    ...getSystemJobDetailsTool,
    group: "automation_runtime",
    mainParams: ["environment", "systemJobId"],
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
    ...getBpfDetailsTool,
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
    ...listPublishersTool,
    group: "solutions_alm",
    mainParams: ["environment", "nameFilter", "prefixFilter", "limit", "cursor"],
  },
  {
    ...getPublisherDetailsTool,
    group: "solutions_alm",
    mainParams: ["environment", "publisher"],
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
    ...getSolutionLayersTool,
    group: "solutions_alm",
    mainParams: ["environment", "solution", "componentType", "componentName"],
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
    ...listTableAlternateKeysTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listDuplicateDetectionRulesTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "status", "limit", "cursor"],
  },
  {
    ...getTableMessageDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "messageName"],
  },
  {
    ...listTableMessagesTool,
    group: "schema_ui",
    mainParams: ["environment", "table"],
  },
  {
    ...listTableColumnsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listGlobalOptionSetsTool,
    group: "schema_ui",
    mainParams: ["environment", "nameFilter", "limit", "cursor"],
  },
  {
    ...getOptionSetDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "optionSet"],
  },
  {
    ...listTableRelationshipsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "solution"],
  },
  {
    ...listTableRecordsTool,
    group: "schema_ui",
    mainParams: [
      "environment",
      "table",
      "nameFilter",
      "createdWithinDays",
      "modifiedWithinDays",
      "state",
    ],
  },
  {
    ...getTableRecordDetailsTool,
    group: "schema_ui",
    mainParams: [
      "environment",
      "table",
      "recordId",
      "name",
      "firstName",
      "lastName",
      "state",
      "includeAllFields",
      "limit",
      "cursor",
    ],
  },
  {
    ...listAuditHistoryTool,
    group: "schema_ui",
    mainParams: [
      "environment",
      "table",
      "recordId",
      "name",
      "firstName",
      "lastName",
      "createdAfter",
      "createdBefore",
      "limit",
      "cursor",
    ],
  },
  {
    ...getAuditDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "auditId"],
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
    ...listChartsTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "scope", "nameFilter", "solution", "limit", "cursor"],
  },
  {
    ...getChartDetailsTool,
    group: "schema_ui",
    mainParams: ["environment", "chartName", "table", "scope", "solution", "includeRawXml"],
  },
  {
    ...listEmailTemplatesTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "nameFilter",
      "templateTypeCode",
      "scope",
      "languageCode",
      "solution",
      "limit",
      "cursor",
    ],
  },
  {
    ...getEmailTemplateDetailsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "templateName",
      "templateTypeCode",
      "scope",
      "languageCode",
      "solution",
      "includeRawContent",
    ],
  },
  {
    ...listDocumentTemplatesTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "nameFilter",
      "associatedEntityTypeCode",
      "documentType",
      "status",
      "languageCode",
      "limit",
      "cursor",
    ],
  },
  {
    ...getDocumentTemplateDetailsTool,
    group: "automation_runtime",
    mainParams: [
      "environment",
      "templateName",
      "associatedEntityTypeCode",
      "documentType",
      "status",
      "languageCode",
      "includeContent",
    ],
  },
  {
    ...runFetchXmlTool,
    group: "schema_ui",
    mainParams: ["environment", "table", "fetchXml", "limit"],
    isEnabled: isRunFetchXmlEnabled,
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
    ...listFieldSecurityProfilesTool,
    group: "solutions_alm",
    mainParams: [
      "environment",
      "profileName",
      "table",
      "column",
      "solution",
      "includeMembers",
      "limit",
      "cursor",
    ],
  },
  {
    ...accessUtilizationReportTool,
    group: "usage_analysis",
    mainParams: [
      "environment",
      "roleName",
      "appName",
      "businessUnit",
      "includeTeams",
      "activeWithinDays",
      "maxUsers",
    ],
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
    ...findWorkflowActivityUsageTool,
    group: "usage_analysis",
    mainParams: ["environment", "className", "solution", "status"],
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
    ...storageBreakdownTool,
    group: "health",
    mainParams: ["environment", "tables", "limit", "includeColumns", "columnScanLimit"],
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
    ...compareEnvironmentVariableMatrixTool,
    group: "comparison",
    mainParams: ["baselineEnvironment", "targetEnvironments", "compareMode"],
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
    ...compareDocumentTemplatesTool,
    group: "comparison",
    mainParams: [
      "sourceEnvironment",
      "targetEnvironment",
      "associatedEntityTypeCode",
      "documentType",
      "nameFilter",
      "compareContent",
    ],
  },
  {
    ...compareSecurityRolesTool,
    group: "comparison",
    mainParams: [
      "sourceEnvironment",
      "targetEnvironment",
      "roleName",
      "sourceRoleName",
      "targetRoleName",
      "sourceBusinessUnit",
      "targetBusinessUnit",
    ],
  },
] as const;

export type ToolManifestEntry = (typeof TOOL_MANIFEST)[number] & ToolManifestMeta;

export const KNOWN_TOOL_NAMES = TOOL_MANIFEST.map((entry) => entry.name).sort((left, right) =>
  left.localeCompare(right),
);

export function isToolEnabled(entry: ToolManifestEntry, config: AppConfig): boolean {
  return entry.isEnabled ? entry.isEnabled(config) : true;
}

export function getExpectedToolNames(config: AppConfig): string[] {
  return getRegisteredToolManifest(config)
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export function getRegisteredToolManifest(config: AppConfig): ToolManifestEntry[] {
  return TOOL_MANIFEST.filter((entry) =>
    isToolEnabled(entry as ToolManifestEntry, config),
  ) as ToolManifestEntry[];
}

export function getToolGroup(groupId: ToolGroupId): ToolGroupDefinition {
  const group = TOOL_GROUPS.find((item) => item.id === groupId);
  if (!group) {
    throw new Error(`Unknown tool group '${groupId}'`);
  }
  return group;
}

export function getToolEntriesByGroup(groupId: ToolGroupId): ToolManifestEntry[] {
  return TOOL_MANIFEST.filter((entry) => entry.group === groupId) as ToolManifestEntry[];
}

export function getToolEntriesByReadmeSection(
  section: ToolGroupDefinition["readmeSection"],
): ToolManifestEntry[] {
  return TOOL_GROUPS.filter((group) => group.readmeSection === section).flatMap((group) =>
    getToolEntriesByGroup(group.id),
  );
}
