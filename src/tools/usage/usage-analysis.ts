import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesWithContentQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import { fetchPluginInventory } from "../plugins/plugin-inventory.js";
import {
  fetchTableRelationships,
  resolveTable,
  type TableRelationshipRecord,
} from "../tables/table-metadata.js";
import { fetchFormDetails, listForms, type FormDetails } from "../forms/form-metadata.js";
import { fetchViewDetails, listViews, type ViewDetails } from "../views/view-metadata.js";
import { fetchCustomApiInventory, listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { fetchFlowDetails, listCloudFlows, type CloudFlowDetails } from "../flows/flow-metadata.js";
import { getWebResourceContentByNameQuery } from "../../queries/web-resource-queries.js";

const TEXT_WEB_RESOURCE_TYPES = new Set([1, 2, 3, 4, 9, 12]);
const MAX_USAGE_DETAIL_ITEMS = 50;
const MAX_WEB_RESOURCE_CONTENT_SCAN = 200;

export interface TableUsageData {
  tableLogicalName: string;
  tableDisplayName: string;
  warnings?: string[];
  pluginSteps: Array<{ name: string; assemblyName: string; messageName: string }>;
  workflows: Array<{ name: string; uniqueName: string; category: number }>;
  forms: Array<{ name: string; typeLabel: string }>;
  views: Array<{ name: string; scope: string; queryTypeLabel: string }>;
  customApis: Array<{ name: string; uniqueName: string; usage: string }>;
  cloudFlows: Array<{ name: string; uniqueName: string }>;
  relationships: TableRelationshipRecord[];
}

export interface ColumnUsageData {
  columnName: string;
  tableLogicalName?: string;
  warnings?: string[];
  pluginSteps: Array<{ name: string; assemblyName: string; attributes: string }>;
  pluginImages: Array<{ name: string; stepName: string; assemblyName: string; attributes: string }>;
  workflows: Array<{ name: string; uniqueName: string; triggerAttributes: string }>;
  forms: Array<{ name: string; table: string; typeLabel: string }>;
  views: Array<{ name: string; table: string; scope: string }>;
  relationships: TableRelationshipRecord[];
  cloudFlows: Array<{ name: string; uniqueName: string }>;
}

export interface WebResourceUsageData {
  resourceName: string;
  warnings?: string[];
  forms: Array<{ name: string; table: string; typeLabel: string; usage: string }>;
  webResources: Array<{ name: string; type: number }>;
}

export interface UpdateTriggerAnalysisData {
  tableLogicalName: string;
  tableDisplayName: string;
  changedAttributes: string[];
  warnings?: string[];
  notes: string[];
  directPluginSteps: Array<{
    name: string;
    assemblyName: string;
    pluginTypeName: string;
    pluginTypeFullName: string;
    filteringAttributes: string;
    matchedAttributes: string[];
    matchType: "specific_attributes" | "all_updates";
    stageLabel: string;
    modeLabel: string;
  }>;
  directWorkflows: Array<{
    name: string;
    uniqueName: string;
    category: number;
    categoryLabel: string;
    modeLabel: string;
    triggerAttributes: string;
    matchedAttributes: string[];
  }>;
  systemManagedPluginSteps: Array<{
    name: string;
    assemblyName: string;
    pluginTypeName: string;
    pluginTypeFullName: string;
    filteringAttributes: string;
    systemManagedAttributes: string[];
    stageLabel: string;
    modeLabel: string;
  }>;
  systemManagedWorkflows: Array<{
    name: string;
    uniqueName: string;
    category: number;
    categoryLabel: string;
    modeLabel: string;
    triggerAttributes: string;
    systemManagedAttributes: string[];
  }>;
  relatedCloudFlows: Array<{
    name: string;
    uniqueName: string;
    triggerNames: string[];
    matchedAttributes: string[];
    reason: string;
  }>;
}

export interface CreateTriggerAnalysisData {
  tableLogicalName: string;
  tableDisplayName: string;
  providedAttributes: string[];
  warnings?: string[];
  notes: string[];
  directPluginSteps: Array<{
    name: string;
    assemblyName: string;
    pluginTypeName: string;
    pluginTypeFullName: string;
    stageLabel: string;
    modeLabel: string;
  }>;
  directWorkflows: Array<{
    name: string;
    uniqueName: string;
    category: number;
    categoryLabel: string;
    modeLabel: string;
  }>;
  relatedCloudFlows: Array<{
    name: string;
    uniqueName: string;
    triggerNames: string[];
    matchedAttributes: string[];
    reason: string;
  }>;
}

const PLUGIN_STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};

const PLUGIN_MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const WORKFLOW_CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};

const WORKFLOW_MODE_LABELS: Record<number, string> = {
  0: "Background",
  1: "Real-time",
};

const SYSTEM_MANAGED_UPDATE_COLUMNS = ["modifiedon", "modifiedby"];

export async function findTableUsageData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
): Promise<TableUsageData> {
  const table = await resolveTable(env, client, tableRef);
  const warnings: string[] = [];
  const [pluginAssemblies, workflows, forms, views, customApis, cloudFlows, relationships] =
    await Promise.all([
      client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
      client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery()),
      listForms(env, client, { table: table.logicalName }),
      listViews(env, client, { table: table.logicalName, scope: "system" }),
      listCustomApis(env, client),
      listCloudFlows(env, client),
      fetchTableRelationships(env, client, table.logicalName),
    ]);

  const flowCandidates = cloudFlows.slice(0, MAX_USAGE_DETAIL_ITEMS);
  if (cloudFlows.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Cloud flow detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} flows per request. Use a narrower environment when you need a full search.`,
    );
  }

  const [pluginInventory, customApiInventory, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    fetchCustomApiInventory(env, client, customApis),
    Promise.all(
      flowCandidates.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name)),
    ),
  ]);

  return {
    tableLogicalName: table.logicalName,
    tableDisplayName: table.displayName,
    warnings,
    pluginSteps: pluginInventory.steps
      .filter((step) => step.primaryEntity === table.logicalName)
      .map((step) => ({
        name: step.name,
        assemblyName: step.assemblyName,
        messageName: step.messageName,
      })),
    workflows: workflows
      .filter((workflow) => String(workflow.primaryentity || "") === table.logicalName)
      .map((workflow) => ({
        name: String(workflow.name || ""),
        uniqueName: String(workflow.uniquename || ""),
        category: Number(workflow.category || 0),
      })),
    forms: forms.map((form) => ({
      name: form.name,
      typeLabel: form.typeLabel,
    })),
    views: views.map((view) => ({
      name: view.name,
      scope: view.scope,
      queryTypeLabel: view.queryTypeLabel,
    })),
    customApis: [
      ...customApis
        .filter((api) => api.boundentitylogicalname === table.logicalName)
        .map((api) => ({
          name: api.name,
          uniqueName: api.uniquename,
          usage: "bound entity",
        })),
      ...customApiInventory.requestParameters
        .filter((parameter) => parameter.logicalentityname === table.logicalName)
        .map((parameter) => ({
          name:
            customApis.find((api) => api.customapiid === parameter.customapiid)?.name ||
            parameter.customapiid,
          uniqueName:
            customApis.find((api) => api.customapiid === parameter.customapiid)?.uniquename ||
            parameter.customapiid,
          usage: `request parameter: ${parameter.name}`,
        })),
      ...customApiInventory.responseProperties
        .filter((property) => property.logicalentityname === table.logicalName)
        .map((property) => ({
          name:
            customApis.find((api) => api.customapiid === property.customapiid)?.name ||
            property.customapiid,
          uniqueName:
            customApis.find((api) => api.customapiid === property.customapiid)?.uniquename ||
            property.customapiid,
          usage: `response property: ${property.name}`,
        })),
    ],
    cloudFlows: flowDetails
      .filter((flow) => flowJsonIncludesValue(flow, table.logicalName))
      .map((flow) => ({
        name: flow.name,
        uniqueName: flow.uniquename,
      })),
    relationships: relationships.relationships,
  };
}

export async function findColumnUsageData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  columnName: string,
  tableRef?: string,
): Promise<ColumnUsageData> {
  const table = tableRef ? await resolveTable(env, client, tableRef) : null;
  const warnings: string[] = [];
  const [pluginAssemblies, workflows, forms, views, cloudFlows, relationships] = await Promise.all([
    client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
    client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery()),
    listForms(env, client, table ? { table: table.logicalName } : undefined),
    listViews(
      env,
      client,
      table ? { table: table.logicalName, scope: "system" } : { scope: "system" },
    ),
    listCloudFlows(env, client),
    table
      ? fetchTableRelationships(env, client, table.logicalName)
      : Promise.resolve({ table: undefined as never, relationships: [] }),
  ]);

  const formCandidates = forms.slice(0, MAX_USAGE_DETAIL_ITEMS);
  const viewCandidates = views.slice(0, MAX_USAGE_DETAIL_ITEMS);
  const flowCandidates = cloudFlows.slice(0, MAX_USAGE_DETAIL_ITEMS);

  if (forms.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Form detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} forms per request. Add a table filter for a smaller scope.`,
    );
  }
  if (views.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `View detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} views per request. Add a table filter for a smaller scope.`,
    );
  }
  if (cloudFlows.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Cloud flow detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} flows per request. Add a table filter for a smaller scope.`,
    );
  }

  const [pluginInventory, formDetails, viewDetails, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    Promise.all(
      formCandidates.map((form) => fetchFormDetails(env, client, form.uniquename || form.name)),
    ),
    Promise.all(
      viewCandidates.map((view) =>
        fetchViewDetails(env, client, view.name, {
          table: view.returnedtypecode,
          scope: view.scope,
        }),
      ),
    ),
    Promise.all(
      flowCandidates.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name)),
    ),
  ]);
  const normalizedColumn = columnName.toLowerCase();

  return {
    columnName,
    tableLogicalName: table?.logicalName,
    warnings,
    pluginSteps: pluginInventory.steps
      .filter(
        (step) =>
          (!table || step.primaryEntity === table.logicalName) &&
          splitCsv(String(step.filteringattributes || "")).includes(normalizedColumn),
      )
      .map((step) => ({
        name: step.name,
        assemblyName: step.assemblyName,
        attributes: String(step.filteringattributes || ""),
      })),
    pluginImages: pluginInventory.images
      .filter((image) => splitCsv(String(image.attributes || "")).includes(normalizedColumn))
      .map((image) => ({
        name: image.name,
        stepName: image.stepName,
        assemblyName: image.assemblyName,
        attributes: String(image.attributes || ""),
      })),
    workflows: workflows
      .filter(
        (workflow) =>
          (!table || String(workflow.primaryentity || "") === table.logicalName) &&
          splitCsv(String(workflow.triggeronupdateattributelist || "")).includes(normalizedColumn),
      )
      .map((workflow) => ({
        name: String(workflow.name || ""),
        uniqueName: String(workflow.uniquename || ""),
        triggerAttributes: String(workflow.triggeronupdateattributelist || ""),
      })),
    forms: formDetails
      .filter((form) => formReferencesColumn(form, normalizedColumn))
      .map((form) => ({
        name: form.name,
        table: form.objecttypecode,
        typeLabel: form.typeLabel,
      })),
    views: viewDetails
      .filter((view) => viewReferencesColumn(view, normalizedColumn))
      .map((view) => ({
        name: view.name,
        table: view.returnedtypecode,
        scope: view.scope,
      })),
    relationships: relationships.relationships.filter(
      (relationship) =>
        relationship.referencedAttribute.toLowerCase() === normalizedColumn ||
        relationship.referencingAttribute.toLowerCase() === normalizedColumn ||
        relationship.entity1IntersectAttribute.toLowerCase() === normalizedColumn ||
        relationship.entity2IntersectAttribute.toLowerCase() === normalizedColumn,
    ),
    cloudFlows: flowDetails
      .filter((flow) => flowJsonIncludesValue(flow, columnName))
      .map((flow) => ({
        name: flow.name,
        uniqueName: flow.uniquename,
      })),
  };
}

export async function findWebResourceUsageData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  resourceName: string,
): Promise<WebResourceUsageData> {
  const warnings: string[] = [];
  const [resourceRecords, forms, allResources] = await Promise.all([
    client.query<Record<string, unknown>>(
      env,
      "webresourceset",
      getWebResourceContentByNameQuery(resourceName),
    ),
    listForms(env, client),
    client.query<Record<string, unknown>>(
      env,
      "webresourceset",
      listWebResourcesWithContentQuery(),
    ),
  ]);

  if (resourceRecords.length === 0) {
    throw new Error(`Web resource '${resourceName}' not found in '${env.name}'.`);
  }

  const formCandidates = forms.slice(0, MAX_USAGE_DETAIL_ITEMS);
  const resourceCandidates = allResources.slice(0, MAX_WEB_RESOURCE_CONTENT_SCAN);
  if (forms.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Form detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} forms per request while checking web resource usage.`,
    );
  }
  if (allResources.length > MAX_WEB_RESOURCE_CONTENT_SCAN) {
    warnings.push(
      `Referenced web resource content scan is limited to ${MAX_WEB_RESOURCE_CONTENT_SCAN} resources per request.`,
    );
  }

  const formDetails = await Promise.all(
    formCandidates.map((form) => fetchFormDetails(env, client, form.uniquename || form.name)),
  );

  return {
    resourceName,
    warnings,
    forms: formDetails
      .filter((form) => formReferencesWebResource(form, resourceName))
      .map((form) => ({
        name: form.name,
        table: form.objecttypecode,
        typeLabel: form.typeLabel,
        usage: form.summary.libraries.includes(resourceName) ? "library" : "form xml",
      })),
    webResources: resourceCandidates
      .filter((resource) => String(resource.name || "") !== resourceName)
      .filter((resource) => webResourceContainsReference(resource, resourceName))
      .map((resource) => ({
        name: String(resource.name || ""),
        type: Number(resource.webresourcetype || 0),
      })),
  };
}

export async function analyzeUpdateTriggersData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  changedAttributes: string[],
): Promise<UpdateTriggerAnalysisData> {
  const table = await resolveTable(env, client, tableRef);
  const normalizedAttributes = normalizeAttributeList(changedAttributes);

  if (normalizedAttributes.length === 0) {
    throw new Error("Please provide at least one changed attribute.");
  }

  const warnings: string[] = [];
  const notes = [
    "Direct matches use exact registered update metadata only.",
    "System-managed columns like modifiedon and modifiedby are not treated as direct matches unless they are part of the input changed attributes.",
    "System-managed column matches are shown separately when update registrations mention modifiedon or modifiedby.",
    "The report does not simulate downstream updates done by plugins, workflows, or cloud flows.",
  ];

  const [pluginAssemblies, workflows, cloudFlows] = await Promise.all([
    client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
    client.query<Record<string, unknown>>(
      env,
      "workflows",
      listWorkflowsQuery({ status: "activated" }),
    ),
    listCloudFlows(env, client, { status: "activated" }),
  ]);

  const flowCandidates = cloudFlows.slice(0, MAX_USAGE_DETAIL_ITEMS);
  if (cloudFlows.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Cloud flow detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} flows per request. Add a smaller scope when you need a full search.`,
    );
  }

  const [pluginInventory, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    Promise.all(
      flowCandidates.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name)),
    ),
  ]);

  const eligiblePluginSteps = pluginInventory.steps.filter(
    (step) =>
      step.statecode === 0 &&
      step.messageName.toLowerCase() === "update" &&
      step.primaryEntity === table.logicalName,
  );
  const directPluginSteps = eligiblePluginSteps
    .map((step) => {
      const filteringAttributes = splitCsv(String(step.filteringattributes || ""));
      const matchedAttributes = intersectAttributes(normalizedAttributes, filteringAttributes);
      const matchType =
        filteringAttributes.length === 0
          ? ("all_updates" as const)
          : ("specific_attributes" as const);

      return {
        name: step.name,
        assemblyName: step.assemblyName,
        pluginTypeName: step.pluginTypeName,
        pluginTypeFullName: step.pluginTypeFullName,
        filteringAttributes: String(step.filteringattributes || ""),
        matchedAttributes: matchType === "all_updates" ? normalizedAttributes : matchedAttributes,
        matchType,
        stageLabel: PLUGIN_STAGE_LABELS[Number(step.stage || 0)] || String(step.stage || ""),
        modeLabel: PLUGIN_MODE_LABELS[Number(step.mode || 0)] || String(step.mode || ""),
      };
    })
    .filter((step) => step.matchType === "all_updates" || step.matchedAttributes.length > 0);
  const systemManagedPluginSteps = eligiblePluginSteps
    .map((step) => {
      const filteringAttributes = splitCsv(String(step.filteringattributes || ""));
      const directMatchedAttributes = intersectAttributes(
        normalizedAttributes,
        filteringAttributes,
      );
      const systemManagedAttributes = intersectAttributes(
        SYSTEM_MANAGED_UPDATE_COLUMNS,
        filteringAttributes,
      );

      return {
        name: step.name,
        assemblyName: step.assemblyName,
        pluginTypeName: step.pluginTypeName,
        pluginTypeFullName: step.pluginTypeFullName,
        filteringAttributes: String(step.filteringattributes || ""),
        systemManagedAttributes,
        directMatchedAttributes,
        stageLabel: PLUGIN_STAGE_LABELS[Number(step.stage || 0)] || String(step.stage || ""),
        modeLabel: PLUGIN_MODE_LABELS[Number(step.mode || 0)] || String(step.mode || ""),
      };
    })
    .filter(
      (step) =>
        step.systemManagedAttributes.length > 0 && step.directMatchedAttributes.length === 0,
    )
    .map((step) => ({
      name: step.name,
      assemblyName: step.assemblyName,
      pluginTypeName: step.pluginTypeName,
      pluginTypeFullName: step.pluginTypeFullName,
      filteringAttributes: step.filteringAttributes,
      systemManagedAttributes: step.systemManagedAttributes,
      stageLabel: step.stageLabel,
      modeLabel: step.modeLabel,
    }));
  const eligibleWorkflows = workflows.filter(
    (workflow) => String(workflow.primaryentity || "") === table.logicalName,
  );
  const directWorkflows = eligibleWorkflows
    .map((workflow) => {
      const triggerAttributes = splitCsv(String(workflow.triggeronupdateattributelist || ""));
      return {
        name: String(workflow.name || ""),
        uniqueName: String(workflow.uniquename || ""),
        category: Number(workflow.category || 0),
        categoryLabel:
          WORKFLOW_CATEGORY_LABELS[Number(workflow.category || 0)] ||
          String(workflow.category || ""),
        modeLabel: WORKFLOW_MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || ""),
        triggerAttributes: String(workflow.triggeronupdateattributelist || ""),
        matchedAttributes: intersectAttributes(normalizedAttributes, triggerAttributes),
      };
    })
    .filter((workflow) => workflow.matchedAttributes.length > 0);
  const systemManagedWorkflows = eligibleWorkflows
    .map((workflow) => {
      const triggerAttributes = splitCsv(String(workflow.triggeronupdateattributelist || ""));
      return {
        name: String(workflow.name || ""),
        uniqueName: String(workflow.uniquename || ""),
        category: Number(workflow.category || 0),
        categoryLabel:
          WORKFLOW_CATEGORY_LABELS[Number(workflow.category || 0)] ||
          String(workflow.category || ""),
        modeLabel: WORKFLOW_MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || ""),
        triggerAttributes: String(workflow.triggeronupdateattributelist || ""),
        systemManagedAttributes: intersectAttributes(
          SYSTEM_MANAGED_UPDATE_COLUMNS,
          triggerAttributes,
        ),
        directMatchedAttributes: intersectAttributes(normalizedAttributes, triggerAttributes),
      };
    })
    .filter(
      (workflow) =>
        workflow.systemManagedAttributes.length > 0 &&
        workflow.directMatchedAttributes.length === 0,
    )
    .map((workflow) => ({
      name: workflow.name,
      uniqueName: workflow.uniqueName,
      category: workflow.category,
      categoryLabel: workflow.categoryLabel,
      modeLabel: workflow.modeLabel,
      triggerAttributes: workflow.triggerAttributes,
      systemManagedAttributes: workflow.systemManagedAttributes,
    }));

  return {
    tableLogicalName: table.logicalName,
    tableDisplayName: table.displayName,
    changedAttributes: normalizedAttributes,
    warnings,
    notes,
    directPluginSteps,
    directWorkflows,
    systemManagedPluginSteps,
    systemManagedWorkflows,
    relatedCloudFlows: flowDetails
      .map((flow) => {
        const matchedAttributes = normalizedAttributes.filter((attribute) =>
          flowJsonIncludesValue(flow, attribute),
        );
        const tableMatched =
          flow.primaryentity.toLowerCase() === table.logicalName ||
          flowJsonIncludesValue(flow, table.logicalName);

        return {
          name: flow.name,
          uniqueName: flow.uniquename,
          triggerNames: flow.summary.triggerNames,
          matchedAttributes,
          reason:
            tableMatched && matchedAttributes.length > 0
              ? `Flow metadata mentions table '${table.logicalName}' and changed attribute values.`
              : "",
        };
      })
      .filter((flow) => flow.reason),
  };
}

export async function analyzeCreateTriggersData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
  providedAttributes: string[],
): Promise<CreateTriggerAnalysisData> {
  const table = await resolveTable(env, client, tableRef);
  const normalizedAttributes = normalizeAttributeList(providedAttributes);
  const warnings: string[] = [];
  const notes = [
    "Direct create matches are table-level. The provided fields do not narrow plugin Create steps or workflow Create triggers.",
    "Provided fields are used only for related cloud flow references in this report.",
    "The report does not simulate downstream updates done by plugins, workflows, or cloud flows.",
  ];

  const [pluginAssemblies, workflows, cloudFlows] = await Promise.all([
    client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
    client.query<Record<string, unknown>>(
      env,
      "workflows",
      listWorkflowsQuery({ status: "activated" }),
    ),
    listCloudFlows(env, client, { status: "activated" }),
  ]);

  const flowCandidates = cloudFlows.slice(0, MAX_USAGE_DETAIL_ITEMS);
  if (cloudFlows.length > MAX_USAGE_DETAIL_ITEMS) {
    warnings.push(
      `Cloud flow detail scan is limited to ${MAX_USAGE_DETAIL_ITEMS} flows per request. Add a smaller scope when you need a full search.`,
    );
  }

  const [pluginInventory, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    Promise.all(
      flowCandidates.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name)),
    ),
  ]);

  return {
    tableLogicalName: table.logicalName,
    tableDisplayName: table.displayName,
    providedAttributes: normalizedAttributes,
    warnings,
    notes,
    directPluginSteps: pluginInventory.steps
      .filter(
        (step) =>
          step.statecode === 0 &&
          step.messageName.toLowerCase() === "create" &&
          step.primaryEntity === table.logicalName,
      )
      .map((step) => ({
        name: step.name,
        assemblyName: step.assemblyName,
        pluginTypeName: step.pluginTypeName,
        pluginTypeFullName: step.pluginTypeFullName,
        stageLabel: PLUGIN_STAGE_LABELS[Number(step.stage || 0)] || String(step.stage || ""),
        modeLabel: PLUGIN_MODE_LABELS[Number(step.mode || 0)] || String(step.mode || ""),
      })),
    directWorkflows: workflows
      .filter(
        (workflow) =>
          String(workflow.primaryentity || "") === table.logicalName &&
          Boolean(workflow.triggeroncreate),
      )
      .map((workflow) => ({
        name: String(workflow.name || ""),
        uniqueName: String(workflow.uniquename || ""),
        category: Number(workflow.category || 0),
        categoryLabel:
          WORKFLOW_CATEGORY_LABELS[Number(workflow.category || 0)] ||
          String(workflow.category || ""),
        modeLabel: WORKFLOW_MODE_LABELS[Number(workflow.mode || 0)] || String(workflow.mode || ""),
      })),
    relatedCloudFlows: flowDetails
      .map((flow) => {
        const matchedAttributes = normalizedAttributes.filter((attribute) =>
          flowJsonIncludesValue(flow, attribute),
        );
        const tableMatched =
          flow.primaryentity.toLowerCase() === table.logicalName ||
          flowJsonIncludesValue(flow, table.logicalName);

        return {
          name: flow.name,
          uniqueName: flow.uniquename,
          triggerNames: flow.summary.triggerNames,
          matchedAttributes,
          reason:
            tableMatched && matchedAttributes.length > 0
              ? `Flow metadata mentions table '${table.logicalName}' and provided field values.`
              : "",
        };
      })
      .filter((flow) => flow.reason),
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeAttributeList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function intersectAttributes(left: string[], right: string[]): string[] {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function formReferencesColumn(form: FormDetails, columnName: string): boolean {
  return (
    form.summary.controls.map((control) => control.toLowerCase()).includes(columnName) ||
    form.formxml.toLowerCase().includes(`datafieldname='${columnName}'`) ||
    form.formxml.toLowerCase().includes(`datafieldname="${columnName}"`)
  );
}

function viewReferencesColumn(view: ViewDetails, columnName: string): boolean {
  return (
    view.summary.attributes.map((attribute) => attribute.toLowerCase()).includes(columnName) ||
    view.summary.layoutColumns.map((column) => column.toLowerCase()).includes(columnName)
  );
}

function formReferencesWebResource(form: FormDetails, resourceName: string): boolean {
  return form.summary.libraries.includes(resourceName) || form.formxml.includes(resourceName);
}

function webResourceContainsReference(
  resource: Record<string, unknown>,
  resourceName: string,
): boolean {
  const type = Number(resource.webresourcetype || 0);
  const content = String(resource.content || "");
  if (!TEXT_WEB_RESOURCE_TYPES.has(type) || !content) {
    return false;
  }

  const decoded = Buffer.from(content, "base64").toString("utf-8");
  return decoded.includes(resourceName);
}

function flowJsonIncludesValue(flow: CloudFlowDetails, value: string): boolean {
  const needle = value.toLowerCase();
  return (
    flow.clientdata.toLowerCase().includes(`"${needle}"`) ||
    flow.clientdata.toLowerCase().includes(needle) ||
    flow.connectionreferences.toLowerCase().includes(needle)
  );
}
