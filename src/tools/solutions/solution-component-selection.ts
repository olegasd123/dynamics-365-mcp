import {
  fetchSolutionInventory,
  getSolutionComponentTypeLabel,
  SOLUTION_COMPONENT_TYPE,
  type SolutionInventory,
} from "./solution-inventory.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { AmbiguousMatchError, type AmbiguousMatchOption } from "../tool-errors.js";

export const TOOL_COMPONENT_TYPES = {
  table: SOLUTION_COMPONENT_TYPE.table,
  column: SOLUTION_COMPONENT_TYPE.column,
  security_role: SOLUTION_COMPONENT_TYPE.securityRole,
  form: SOLUTION_COMPONENT_TYPE.form,
  view: SOLUTION_COMPONENT_TYPE.view,
  workflow: SOLUTION_COMPONENT_TYPE.workflow,
  email_template: SOLUTION_COMPONENT_TYPE.emailTemplate,
  dashboard: SOLUTION_COMPONENT_TYPE.dashboard,
  web_resource: SOLUTION_COMPONENT_TYPE.webResource,
  app_module: SOLUTION_COMPONENT_TYPE.appModule,
  plugin_assembly: SOLUTION_COMPONENT_TYPE.pluginAssembly,
  plugin_step: SOLUTION_COMPONENT_TYPE.pluginStep,
  plugin_image: SOLUTION_COMPONENT_TYPE.pluginImage,
  connection_reference: SOLUTION_COMPONENT_TYPE.connectionReference,
  environment_variable_definition: SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
  environment_variable_value: SOLUTION_COMPONENT_TYPE.environmentVariableValue,
} as const;

export type ToolComponentType = keyof typeof TOOL_COMPONENT_TYPES;

export interface NamedSolutionComponent {
  solutioncomponentid: string;
  objectid: string;
  componenttype: number;
  displayName: string;
  name: string;
  parentDisplayName?: string;
}

export async function fetchSolutionInventoryWithSelectedComponents(
  env: AppConfig["environments"][number],
  client: DynamicsClient,
  solution: string,
  componentType?: ToolComponentType,
  componentName?: string,
): Promise<{
  inventory: SolutionInventory;
  allComponents: NamedSolutionComponent[];
  selectedComponents: NamedSolutionComponent[];
}> {
  const inventory = await fetchSolutionInventory(env, client, solution);
  const allComponents = listSupportedComponents(inventory);
  const selectedComponents = selectComponents(
    allComponents,
    componentType ? TOOL_COMPONENT_TYPES[componentType] : undefined,
    componentName,
  );

  return {
    inventory,
    allComponents,
    selectedComponents,
  };
}

export function listSupportedComponents(inventory: SolutionInventory): NamedSolutionComponent[] {
  const componentByKey = new Map(
    inventory.components.map((component) => [
      createComponentKey(component.componenttype, component.objectid),
      component,
    ]),
  );
  const definitionNameById = new Map(
    inventory.environmentVariableDefinitions.map((definition) => [
      definition.environmentvariabledefinitionid,
      definition.schemaname,
    ]),
  );

  return [
    ...inventory.tables.map((table) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.table,
        table.metadataId,
        table.displayName ? `${table.displayName} (${table.logicalName})` : table.logicalName,
        table.logicalName,
      ),
    ),
    ...inventory.columns.map((column) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.column,
        column.metadataId,
        `${column.tableLogicalName}.${column.logicalName}`,
        `${column.tableLogicalName}.${column.logicalName}`,
        column.tableLogicalName,
      ),
    ),
    ...inventory.securityRoles.map((role) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.securityRole,
        role.roleid,
        `${role.name} [${role.businessUnitName || "-"}]`,
        role.name,
        role.businessUnitName || undefined,
      ),
    ),
    ...inventory.forms.map((form) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.form,
        String(form.formid || ""),
        `${String(form.objecttypecode || "")}/${String(form.name || "")}`,
        String(form.name || ""),
        String(form.objecttypecode || ""),
      ),
    ),
    ...inventory.views.map((view) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.view,
        String(view.savedqueryid || ""),
        `${String(view.returnedtypecode || "")}/${String(view.name || "")}`,
        String(view.name || ""),
        String(view.returnedtypecode || ""),
      ),
    ),
    ...inventory.workflows.map((workflow) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.workflow,
        String(workflow.workflowid || ""),
        String(workflow.name || workflow.uniquename || ""),
        String(workflow.uniquename || workflow.name || ""),
      ),
    ),
    ...inventory.emailTemplates.map((template) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.emailTemplate,
        String(template.templateid || ""),
        String(template.title || ""),
        String(template.title || ""),
        String(template.templatetypecode || ""),
      ),
    ),
    ...inventory.dashboards.map((dashboard) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.dashboard,
        dashboard.formid,
        dashboard.name,
        dashboard.name,
        dashboard.objecttypecode || undefined,
      ),
    ),
    ...inventory.webResources.map((resource) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.webResource,
        String(resource.webresourceid || ""),
        String(resource.name || ""),
        String(resource.name || ""),
      ),
    ),
    ...inventory.appModules.map((app) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.appModule,
        app.appmoduleid,
        app.name,
        app.uniquename || app.name,
      ),
    ),
    ...inventory.pluginAssemblies.map((assembly) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginAssembly,
        String(assembly.pluginassemblyid || ""),
        String(assembly.name || ""),
        String(assembly.name || ""),
      ),
    ),
    ...inventory.pluginSteps.map((step) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginStep,
        step.sdkmessageprocessingstepid,
        step.displayName,
        step.name,
        step.assemblyName,
      ),
    ),
    ...inventory.pluginImages.map((image) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.pluginImage,
        image.sdkmessageprocessingstepimageid,
        image.displayName,
        image.name,
        image.stepName,
      ),
    ),
    ...inventory.connectionReferences.map((reference) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.connectionReference,
        reference.connectionreferenceid,
        reference.displayname || reference.connectionreferencelogicalname,
        reference.connectionreferencelogicalname || reference.displayname,
      ),
    ),
    ...inventory.environmentVariableDefinitions.map((definition) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.environmentVariableDefinition,
        definition.environmentvariabledefinitionid,
        definition.schemaname,
        definition.schemaname,
      ),
    ),
    ...inventory.environmentVariableValues.map((value) =>
      createNamedComponent(
        componentByKey,
        SOLUTION_COMPONENT_TYPE.environmentVariableValue,
        value.environmentvariablevalueid,
        `${definitionNameById.get(value.environmentvariabledefinitionid) || value.environmentvariabledefinitionid} value`,
        definitionNameById.get(value.environmentvariabledefinitionid) ||
          value.environmentvariabledefinitionid,
        definitionNameById.get(value.environmentvariabledefinitionid),
      ),
    ),
  ].filter((component): component is NamedSolutionComponent => Boolean(component));
}

export function selectComponents(
  components: NamedSolutionComponent[],
  componentType?: number,
  componentName?: string,
): NamedSolutionComponent[] {
  let filtered = componentType
    ? components.filter((component) => component.componenttype === componentType)
    : components;

  if (!componentName) {
    return filtered;
  }

  const needle = componentName.trim().toLowerCase();
  const exactMatches = filtered.filter(
    (component) =>
      component.solutioncomponentid.toLowerCase() === needle ||
      component.objectid.toLowerCase() === needle ||
      component.name.toLowerCase() === needle ||
      component.displayName.toLowerCase() === needle,
  );

  if (exactMatches.length === 1) {
    return exactMatches;
  }

  if (exactMatches.length > 1) {
    throw createAmbiguousComponentError(componentName, exactMatches);
  }

  filtered = filtered.filter(
    (component) =>
      component.solutioncomponentid.toLowerCase().includes(needle) ||
      component.objectid.toLowerCase().includes(needle) ||
      component.name.toLowerCase().includes(needle) ||
      component.displayName.toLowerCase().includes(needle),
  );

  if (filtered.length > 1) {
    throw createAmbiguousComponentError(componentName, filtered);
  }

  return filtered;
}

function createNamedComponent(
  componentByKey: Map<string, { solutioncomponentid: string }>,
  componentType: number,
  objectId: string,
  displayName: string,
  name: string,
  parentDisplayName?: string,
): NamedSolutionComponent | null {
  const component = componentByKey.get(createComponentKey(componentType, objectId));
  if (!component?.solutioncomponentid) {
    return null;
  }

  return {
    solutioncomponentid: component.solutioncomponentid,
    objectid: objectId,
    componenttype: componentType,
    displayName,
    name,
    parentDisplayName,
  };
}

function createAmbiguousComponentError(
  componentName: string,
  matches: NamedSolutionComponent[],
): AmbiguousMatchError {
  return new AmbiguousMatchError(
    `Component '${componentName}' is ambiguous. Choose a matching component and try again. Matches: ${matches.map((component) => component.displayName).join(", ")}.`,
    {
      parameter: "componentName",
      options: matches.map((component) => createComponentOption(component)),
    },
  );
}

function createComponentOption(component: NamedSolutionComponent): AmbiguousMatchOption {
  const parentSuffix = component.parentDisplayName ? ` [${component.parentDisplayName}]` : "";
  const typeLabel = getSolutionComponentTypeLabel(component.componenttype);

  return {
    value: component.solutioncomponentid,
    label: `${component.displayName}${parentSuffix} (${typeLabel})`,
  };
}

function createComponentKey(componentType: number, objectId: string): string {
  return `${componentType}:${objectId}`;
}
