import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchSolutionInventory, getSolutionComponentTypeLabel } from "./solution-inventory.js";

const ROOT_BEHAVIOR_LABELS: Record<number, string> = {
  0: "Include Subcomponents",
  1: "Do Not Include Subcomponents",
  2: "Include As Shell Only",
};

const WORKFLOW_CATEGORY_LABELS: Record<number, string> = {
  0: "Workflow",
  1: "Dialog",
  2: "Business Rule",
  3: "Action",
  4: "BPF",
  5: "Modern Flow",
};

const FORM_TYPE_LABELS: Record<number, string> = {
  0: "Dashboard",
  2: "Main",
  7: "Quick Create",
  11: "Card",
  12: "Main",
};

const VIEW_QUERY_TYPE_LABELS: Record<number, string> = {
  0: "Public",
  1: "Advanced Find",
  2: "Associated",
  4: "Quick Find",
  64: "Lookup",
};

const WEB_RESOURCE_TYPE_LABELS: Record<number, string> = {
  1: "HTML",
  2: "CSS",
  3: "JS",
  4: "XML",
  5: "PNG",
  6: "JPG",
  7: "GIF",
  8: "XAP",
  9: "XSL",
  10: "ICO",
  11: "SVG",
  12: "RESX",
};

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};

const MODE_LABELS: Record<number, string> = {
  0: "Synchronous",
  1: "Asynchronous",
};

const IMAGE_TYPE_LABELS: Record<number, string> = {
  0: "PreImage",
  1: "PostImage",
  2: "Both",
};

const ENVIRONMENT_VARIABLE_TYPE_LABELS: Record<number, string> = {
  100000000: "String",
  100000001: "Number",
  100000002: "Boolean",
  100000003: "JSON",
  100000004: "Data Source",
  100000005: "Secret",
};

export function registerGetSolutionDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_solution_details",
    "Show a solution summary and list supported components like tables, apps, environment variables, plugins, and web resources.",
    {
      environment: z.string().optional().describe("Environment name"),
      solution: z.string().describe("Solution display name or unique name"),
    },
    async ({ environment, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchSolutionInventory(env, client, solution);

        const coverageRows = [
          ["Tables", String(inventory.tables.length)],
          ["Columns", String(inventory.columns.length)],
          ["Security Roles", String(inventory.securityRoles.length)],
          ["Forms", String(inventory.forms.length)],
          ["Views", String(inventory.views.length)],
          ["Workflows", String(inventory.workflows.length)],
          ["Dashboards", String(inventory.dashboards.length)],
          ["Web Resources", String(inventory.webResources.length)],
          ["App Modules", String(inventory.appModules.length)],
          ["Connection References", String(inventory.connectionReferences.length)],
          [
            "Environment Variable Definitions",
            String(inventory.environmentVariableDefinitions.length),
          ],
          ["Environment Variable Values", String(inventory.environmentVariableValues.length)],
          ["Plugin Assemblies", String(inventory.pluginAssemblies.length)],
          ["Plugin Steps", String(inventory.pluginSteps.length)],
          ["Plugin Images", String(inventory.pluginImages.length)],
        ];

        const lines: string[] = [];
        lines.push(`## Solution: ${inventory.solution.friendlyname}`);
        lines.push(`- **Environment**: ${env.name}`);
        lines.push(`- **Unique Name**: ${inventory.solution.uniquename}`);
        lines.push(`- **Version**: ${String(inventory.solution.version || "")}`);
        lines.push(`- **Managed**: ${inventory.solution.ismanaged ? "Yes" : "No"}`);
        lines.push(`- **Modified**: ${String(inventory.solution.modifiedon || "").slice(0, 10)}`);
        lines.push(`- **Root Components**: ${inventory.rootComponents.length}`);
        lines.push(`- **Child Components**: ${inventory.childComponents.length}`);
        lines.push(`- **Other Root Components**: ${inventory.unsupportedRootComponents.length}`);
        lines.push(`- **Other Child Components**: ${inventory.unsupportedChildComponents.length}`);

        lines.push("");
        lines.push("### Supported Coverage");
        lines.push(formatTable(["Area", "Count"], coverageRows));

        if (inventory.tables.length > 0) {
          lines.push("");
          lines.push("### Tables");
          lines.push(
            formatTable(
              ["Logical Name", "Schema", "Display Name", "Managed"],
              inventory.tables.map((table) => [
                table.logicalName,
                table.schemaName,
                table.displayName || "-",
                table.isManaged ? "Yes" : "No",
              ]),
            ),
          );
        }

        if (inventory.columns.length > 0) {
          lines.push("");
          lines.push("### Columns");
          lines.push(
            formatTable(
              ["Table", "Logical Name", "Display Name", "Type", "Required", "Managed"],
              inventory.columns.map((column) => [
                column.tableLogicalName,
                column.logicalName,
                column.displayName || "-",
                column.attributeType,
                column.requiredLevel || "-",
                column.isCustomAttribute ? "Custom" : "System",
              ]),
            ),
          );
        }

        if (inventory.securityRoles.length > 0) {
          lines.push("");
          lines.push("### Security Roles");
          lines.push(
            formatTable(
              ["Name", "Business Unit", "Managed", "Modified"],
              inventory.securityRoles.map((role) => [
                role.name,
                role.businessUnitName || "-",
                role.ismanaged ? "Yes" : "No",
                role.modifiedon.slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.forms.length > 0) {
          lines.push("");
          lines.push("### Forms");
          lines.push(
            formatTable(
              ["Table", "Name", "Type", "Default", "Managed", "Modified"],
              inventory.forms.map((form) => [
                String(form.objecttypecode || ""),
                String(form.name || ""),
                FORM_TYPE_LABELS[Number(form.type || 0)] || String(form.type || ""),
                form.isdefault ? "Yes" : "No",
                form.ismanaged ? "Yes" : "No",
                String(form.modifiedon || "").slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.views.length > 0) {
          lines.push("");
          lines.push("### Views");
          lines.push(
            formatTable(
              ["Table", "Name", "Type", "Default", "Quick Find", "Modified"],
              inventory.views.map((view) => [
                String(view.returnedtypecode || ""),
                String(view.name || ""),
                VIEW_QUERY_TYPE_LABELS[Number(view.querytype || 0)] || String(view.querytype || ""),
                view.isdefault ? "Yes" : "No",
                view.isquickfindquery ? "Yes" : "No",
                String(view.modifiedon || "").slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.workflows.length > 0) {
          lines.push("");
          lines.push("### Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Category", "Status", "Entity"],
              inventory.workflows.map((workflow) => [
                String(workflow.name || ""),
                String(workflow.uniquename || ""),
                WORKFLOW_CATEGORY_LABELS[Number(workflow.category || 0)] ||
                  String(workflow.category || ""),
                workflow.statecode === 1
                  ? "Activated"
                  : workflow.statecode === 2
                    ? "Suspended"
                    : "Draft",
                String(workflow.primaryentity || "none"),
              ]),
            ),
          );
        }

        if (inventory.dashboards.length > 0) {
          lines.push("");
          lines.push("### Dashboards");
          lines.push(
            formatTable(
              ["Name", "Table", "Managed", "Modified"],
              inventory.dashboards.map((dashboard) => [
                dashboard.name,
                dashboard.objecttypecode || "-",
                dashboard.ismanaged ? "Yes" : "No",
                dashboard.modifiedon.slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.webResources.length > 0) {
          lines.push("");
          lines.push("### Web Resources");
          lines.push(
            formatTable(
              ["Name", "Display Name", "Type", "Managed", "Modified"],
              inventory.webResources.map((resource) => [
                String(resource.name || ""),
                String(resource.displayname || ""),
                WEB_RESOURCE_TYPE_LABELS[Number(resource.webresourcetype || 0)] ||
                  String(resource.webresourcetype || ""),
                resource.ismanaged ? "Yes" : "No",
                String(resource.modifiedon || "").slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.appModules.length > 0) {
          lines.push("");
          lines.push("### App Modules");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "State", "Managed", "Modified"],
              inventory.appModules.map((app) => [
                app.name,
                app.uniquename,
                app.statecode === 0 ? "Active" : String(app.statecode),
                app.ismanaged ? "Yes" : "No",
                app.modifiedon.slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.connectionReferences.length > 0) {
          lines.push("");
          lines.push("### Connection References");
          lines.push(
            formatTable(
              ["Display Name", "Logical Name", "Connector", "Connected", "Managed"],
              inventory.connectionReferences.map((reference) => [
                reference.displayname || reference.connectionreferencelogicalname,
                reference.connectionreferencelogicalname,
                reference.connectorid || "-",
                reference.connectionid ? "Yes" : "No",
                reference.ismanaged ? "Yes" : "No",
              ]),
            ),
          );
        }

        if (inventory.environmentVariableDefinitions.length > 0) {
          lines.push("");
          lines.push("### Environment Variable Definitions");
          lines.push(
            formatTable(
              ["Schema Name", "Display Name", "Type", "Default Value", "Managed"],
              inventory.environmentVariableDefinitions.map((definition) => [
                definition.schemaname,
                definition.displayname || "-",
                ENVIRONMENT_VARIABLE_TYPE_LABELS[definition.type] || String(definition.type),
                definition.defaultvalue || "-",
                definition.ismanaged ? "Yes" : "No",
              ]),
            ),
          );
        }

        if (inventory.environmentVariableValues.length > 0) {
          const definitionNameById = new Map(
            inventory.environmentVariableDefinitions.map((definition) => [
              definition.environmentvariabledefinitionid,
              definition.schemaname,
            ]),
          );
          lines.push("");
          lines.push("### Environment Variable Values");
          lines.push(
            formatTable(
              ["Definition", "Value", "Managed", "Modified"],
              inventory.environmentVariableValues.map((item) => [
                definitionNameById.get(item.environmentvariabledefinitionid) ||
                  item.environmentvariabledefinitionid,
                item.value || "-",
                item.ismanaged ? "Yes" : "No",
                item.modifiedon.slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.pluginAssemblies.length > 0) {
          lines.push("");
          lines.push("### Plugin Assemblies");
          lines.push(
            formatTable(
              ["Name", "Version", "Isolation", "Managed", "Modified"],
              inventory.pluginAssemblies.map((assembly) => [
                String(assembly.name || ""),
                String(assembly.version || ""),
                assembly.isolationmode === 2 ? "Sandbox" : "None",
                assembly.ismanaged ? "Yes" : "No",
                String(assembly.modifiedon || "").slice(0, 10),
              ]),
            ),
          );
        }

        if (inventory.pluginSteps.length > 0) {
          lines.push("");
          lines.push("### Plugin Steps");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Message", "Entity", "Stage", "Mode", "Rank"],
              inventory.pluginSteps.map((step) => [
                step.assemblyName,
                step.name,
                step.messageName,
                step.primaryEntity,
                STAGE_LABELS[Number(step.stage || 0)] || String(step.stage || ""),
                MODE_LABELS[Number(step.mode || 0)] || String(step.mode || ""),
                String(step.rank || ""),
              ]),
            ),
          );
        }

        if (inventory.pluginImages.length > 0) {
          lines.push("");
          lines.push("### Plugin Images");
          lines.push(
            formatTable(
              ["Assembly", "Step", "Image", "Type", "Alias", "Attributes"],
              inventory.pluginImages.map((image) => [
                image.assemblyName,
                image.stepName,
                image.name,
                IMAGE_TYPE_LABELS[Number(image.imagetype || 0)] || String(image.imagetype || ""),
                String(image.entityalias || ""),
                String(image.attributes || ""),
              ]),
            ),
          );
        }

        if (inventory.unsupportedRootComponents.length > 0) {
          lines.push("");
          lines.push("### Other Root Components");
          lines.push(
            formatTable(
              ["Type", "Object ID", "Root Behavior"],
              inventory.unsupportedRootComponents.map((component) => [
                getSolutionComponentTypeLabel(component.componenttype),
                component.objectid,
                ROOT_BEHAVIOR_LABELS[Number(component.rootcomponentbehavior)] ||
                  String(component.rootcomponentbehavior ?? ""),
              ]),
            ),
          );
        }

        if (inventory.unsupportedChildComponents.length > 0) {
          lines.push("");
          lines.push("### Other Child Components");
          lines.push(
            formatTable(
              ["Type", "Object ID", "Root Component ID"],
              inventory.unsupportedChildComponents.map((component) => [
                getSolutionComponentTypeLabel(component.componenttype),
                component.objectid,
                String(component.rootsolutioncomponentid || ""),
              ]),
            ),
          );
        }

        return createToolSuccessResponse(
          "get_solution_details",
          lines.join("\n\n"),
          `Loaded solution '${inventory.solution.friendlyname}' in '${env.name}'.`,
          {
            environment: env.name,
            solution: inventory.solution,
            counts: {
              rootComponents: inventory.rootComponents.length,
              childComponents: inventory.childComponents.length,
              tables: inventory.tables.length,
              columns: inventory.columns.length,
              securityRoles: inventory.securityRoles.length,
              forms: inventory.forms.length,
              views: inventory.views.length,
              workflows: inventory.workflows.length,
              dashboards: inventory.dashboards.length,
              webResources: inventory.webResources.length,
              appModules: inventory.appModules.length,
              connectionReferences: inventory.connectionReferences.length,
              environmentVariableDefinitions: inventory.environmentVariableDefinitions.length,
              environmentVariableValues: inventory.environmentVariableValues.length,
              pluginAssemblies: inventory.pluginAssemblies.length,
              pluginSteps: inventory.pluginSteps.length,
              pluginImages: inventory.pluginImages.length,
              unsupportedRootComponents: inventory.unsupportedRootComponents.length,
              unsupportedChildComponents: inventory.unsupportedChildComponents.length,
            },
            inventory,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_solution_details", error);
      }
    },
  );
}
