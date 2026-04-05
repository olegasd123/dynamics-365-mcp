import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { listPluginAssembliesQuery } from "../../queries/plugin-queries.js";
import { listWebResourcesWithContentQuery } from "../../queries/web-resource-queries.js";
import { listWorkflowsQuery } from "../../queries/workflow-queries.js";
import { fetchPluginInventory } from "../plugins/plugin-inventory.js";
import { fetchTableRelationships, resolveTable, type TableRelationshipRecord } from "../tables/table-metadata.js";
import { fetchFormDetails, listForms, type FormDetails } from "../forms/form-metadata.js";
import { fetchViewDetails, listViews, type ViewDetails } from "../views/view-metadata.js";
import { fetchCustomApiInventory, listCustomApis } from "../custom-apis/custom-api-metadata.js";
import { fetchFlowDetails, listCloudFlows, type CloudFlowDetails } from "../flows/flow-metadata.js";
import { getWebResourceContentByNameQuery } from "../../queries/web-resource-queries.js";

const TEXT_WEB_RESOURCE_TYPES = new Set([1, 2, 3, 4, 9, 12]);

export interface TableUsageData {
  tableLogicalName: string;
  tableDisplayName: string;
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
  forms: Array<{ name: string; table: string; typeLabel: string; usage: string }>;
  webResources: Array<{ name: string; type: number }>;
}

export async function findTableUsageData(
  env: EnvironmentConfig,
  client: DynamicsClient,
  tableRef: string,
): Promise<TableUsageData> {
  const table = await resolveTable(env, client, tableRef);
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

  const [pluginInventory, customApiInventory, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    fetchCustomApiInventory(env, client, customApis),
    Promise.all(
      cloudFlows.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name)),
    ),
  ]);

  return {
    tableLogicalName: table.logicalName,
    tableDisplayName: table.displayName,
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
          name: customApis.find((api) => api.customapiid === parameter.customapiid)?.name || parameter.customapiid,
          uniqueName:
            customApis.find((api) => api.customapiid === parameter.customapiid)?.uniquename ||
            parameter.customapiid,
          usage: `request parameter: ${parameter.name}`,
        })),
      ...customApiInventory.responseProperties
        .filter((property) => property.logicalentityname === table.logicalName)
        .map((property) => ({
          name: customApis.find((api) => api.customapiid === property.customapiid)?.name || property.customapiid,
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
  const [pluginAssemblies, workflows, forms, views, cloudFlows, relationships] = await Promise.all([
    client.query<Record<string, unknown>>(env, "pluginassemblies", listPluginAssembliesQuery()),
    client.query<Record<string, unknown>>(env, "workflows", listWorkflowsQuery()),
    listForms(env, client, table ? { table: table.logicalName } : undefined),
    listViews(env, client, table ? { table: table.logicalName, scope: "system" } : { scope: "system" }),
    listCloudFlows(env, client),
    table ? fetchTableRelationships(env, client, table.logicalName) : Promise.resolve({ table: undefined as never, relationships: [] }),
  ]);

  const [pluginInventory, formDetails, viewDetails, flowDetails] = await Promise.all([
    fetchPluginInventory(env, client, pluginAssemblies),
    Promise.all(forms.map((form) => fetchFormDetails(env, client, form.uniquename || form.name))),
    Promise.all(views.map((view) => fetchViewDetails(env, client, view.name, { table: view.returnedtypecode, scope: view.scope }))),
    Promise.all(cloudFlows.map((flow) => fetchFlowDetails(env, client, flow.uniquename || flow.name))),
  ]);
  const normalizedColumn = columnName.toLowerCase();

  return {
    columnName,
    tableLogicalName: table?.logicalName,
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
      .filter((image) =>
        splitCsv(String(image.attributes || "")).includes(normalizedColumn),
      )
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

  const formDetails = await Promise.all(
    forms.map((form) => fetchFormDetails(env, client, form.uniquename || form.name)),
  );

  return {
    resourceName,
    forms: formDetails
      .filter((form) => formReferencesWebResource(form, resourceName))
      .map((form) => ({
        name: form.name,
        table: form.objecttypecode,
        typeLabel: form.typeLabel,
        usage: form.summary.libraries.includes(resourceName) ? "library" : "form xml",
      })),
    webResources: allResources
      .filter((resource) => String(resource.name || "") !== resourceName)
      .filter((resource) => webResourceContainsReference(resource, resourceName))
      .map((resource) => ({
        name: String(resource.name || ""),
        type: Number(resource.webresourcetype || 0),
      })),
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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
  return (
    form.summary.libraries.includes(resourceName) ||
    form.formxml.includes(resourceName)
  );
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
