import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listSolutionComponentLayersQuery } from "../../queries/solution-layer-queries.js";
import { getSolutionComponentTypeLabel } from "./solution-inventory.js";
import {
  fetchSolutionInventoryWithSelectedComponents,
  TOOL_COMPONENT_TYPES,
  type ToolComponentType,
} from "./solution-component-selection.js";

interface SolutionComponentLayerRecord extends Record<string, unknown> {
  msdyn_componentlayerid: string;
  msdyn_name: string;
  msdyn_componentid: string;
  msdyn_solutioncomponentname: string;
  msdyn_solutionname: string;
  msdyn_publishername: string;
  msdyn_order: number;
  msdyn_overwritetime?: string;
  msdyn_changes?: string;
}

interface SolutionLayerRow {
  id: string;
  name: string;
  componentId: string;
  solutionComponentName: string;
  solutionName: string;
  publisherName: string;
  order: number;
  overwriteTime: string | null;
  changes: string | null;
  layerKind: "unmanaged" | "managed" | "system" | "unknown";
}

const getSolutionLayersSchema = {
  environment: z.string().optional().describe("Environment name"),
  solution: z.string().describe("Solution display name or unique name"),
  componentType: z
    .enum([
      "table",
      "column",
      "security_role",
      "form",
      "view",
      "workflow",
      "dashboard",
      "web_resource",
      "app_module",
      "plugin_assembly",
      "plugin_step",
      "plugin_image",
      "connection_reference",
      "environment_variable_definition",
      "environment_variable_value",
    ])
    .describe("Supported solution component type"),
  componentName: z
    .string()
    .describe("Component name, display name, object id, or solution component id"),
  maxLayers: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max layer rows to show. Default: 20"),
  includeChanges: z
    .boolean()
    .optional()
    .describe("Include raw layer change payloads when Dataverse returns them. Default: false"),
};

type GetSolutionLayersParams = ToolParams<typeof getSolutionLayersSchema>;

export async function handleGetSolutionLayers(
  {
    environment,
    solution,
    componentType,
    componentName,
    maxLayers,
    includeChanges,
  }: GetSolutionLayersParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const rowLimit = maxLayers ?? 20;
    const { inventory, selectedComponents } = await fetchSolutionInventoryWithSelectedComponents(
      env,
      client,
      solution,
      componentType as ToolComponentType,
      componentName,
    );

    if (selectedComponents.length === 0) {
      const text = `No supported solution components matched in '${env.name}' for solution '${solution}'.`;
      return createToolSuccessResponse("get_solution_layers", text, text, {
        environment: env.name,
        solution,
        componentType,
        componentName,
        count: 0,
        items: [],
      });
    }

    const component = selectedComponents[0];
    const componentTypeNames = getComponentLayerTypeNameCandidates(component.componenttype);
    if (componentTypeNames.length === 0) {
      throw new Error(
        `Solution layer lookup is not supported yet for component type '${getSolutionComponentTypeLabel(component.componenttype)}'.`,
      );
    }

    const rawLayers = await client.query<SolutionComponentLayerRecord>(
      env,
      "msdyn_componentlayers",
      listSolutionComponentLayersQuery(component.objectid, componentTypeNames),
    );
    const layers = rawLayers
      .map(normalizeSolutionLayerRow)
      .sort((left, right) => right.order - left.order);
    const displayedLayers = layers.slice(0, rowLimit);
    const runtimeLayer = layers[0] ?? null;
    const hasUnmanagedLayer = layers.some((layer) => layer.layerKind === "unmanaged");

    const lines: string[] = [];
    lines.push("## Solution Layers");
    lines.push(`- **Environment**: ${env.name}`);
    lines.push(
      `- **Solution**: ${inventory.solution.friendlyname} (${inventory.solution.uniquename})`,
    );
    lines.push(`- **Component**: ${component.displayName}`);
    lines.push(`- **Component Type**: ${getSolutionComponentTypeLabel(component.componenttype)}`);
    lines.push(`- **Component Id**: ${component.objectid}`);
    lines.push(`- **Layer Rows**: ${layers.length}`);

    if (runtimeLayer) {
      lines.push(
        `- **Runtime Layer**: ${runtimeLayer.solutionName || runtimeLayer.name || "Unknown"} (${runtimeLayer.layerKind})`,
      );
      if (runtimeLayer.publisherName) {
        lines.push(`- **Runtime Publisher**: ${runtimeLayer.publisherName}`);
      }
    }

    lines.push(`- **Unmanaged Layer Present**: ${hasUnmanagedLayer ? "Yes" : "No"}`);
    lines.push("");

    if (layers.length === 0) {
      lines.push(
        "No layer rows were returned. This can happen when the environment does not expose component layers for this component or when Dataverse requires a different internal component name.",
      );
      return createToolSuccessResponse(
        "get_solution_layers",
        lines.join("\n\n"),
        `No solution layer rows found for '${component.displayName}' in '${env.name}'.`,
        {
          environment: env.name,
          solution: inventory.solution,
          component,
          count: 0,
          runtimeLayer: null,
          hasUnmanagedLayer: false,
          layers: [],
        },
      );
    }

    lines.push("### Layer Stack");
    lines.push(
      formatTable(
        ["Order", "Kind", "Solution", "Publisher", "Layer", "Overwrite Time"],
        displayedLayers.map((layer) => [
          String(layer.order),
          layer.layerKind,
          layer.solutionName || "-",
          layer.publisherName || "-",
          layer.name || "-",
          layer.overwriteTime ? layer.overwriteTime.slice(0, 19).replace("T", " ") : "-",
        ]),
      ),
    );

    if (layers.length > rowLimit) {
      lines.push("");
      lines.push(`Showing ${displayedLayers.length} of ${layers.length} layer rows.`);
    }

    if (includeChanges) {
      const changeSections = displayedLayers
        .filter((layer) => layer.changes)
        .map((layer) =>
          [`### Changes: ${layer.solutionName || layer.name}`, layer.changes || ""].join("\n\n"),
        );

      if (changeSections.length > 0) {
        lines.push("");
        lines.push(changeSections.join("\n\n"));
      }
    }

    return createToolSuccessResponse(
      "get_solution_layers",
      lines.join("\n\n"),
      `Loaded ${layers.length} solution layer row(s) for '${component.displayName}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: inventory.solution,
        component,
        count: layers.length,
        runtimeLayer,
        hasUnmanagedLayer,
        layers,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_solution_layers", error);
  }
}

export const getSolutionLayersTool = defineTool({
  name: "get_solution_layers",
  description:
    "Show the active solution layer stack for one supported solution component to debug why a change is not taking effect.",
  schema: getSolutionLayersSchema,
  handler: handleGetSolutionLayers,
});

export function registerGetSolutionLayers(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getSolutionLayersTool, { config, client });
}

function normalizeSolutionLayerRow(row: SolutionComponentLayerRecord): SolutionLayerRow {
  const solutionName = String(row.msdyn_solutionname || "");
  const name = String(row.msdyn_name || "");

  return {
    id: String(row.msdyn_componentlayerid || ""),
    name,
    componentId: String(row.msdyn_componentid || ""),
    solutionComponentName: String(row.msdyn_solutioncomponentname || ""),
    solutionName,
    publisherName: String(row.msdyn_publishername || ""),
    order: Number(row.msdyn_order || 0),
    overwriteTime: row.msdyn_overwritetime ? String(row.msdyn_overwritetime) : null,
    changes: row.msdyn_changes ? String(row.msdyn_changes) : null,
    layerKind: classifyLayerKind(solutionName, name),
  };
}

function classifyLayerKind(
  solutionName: string,
  layerName: string,
): "unmanaged" | "managed" | "system" | "unknown" {
  const combined = `${solutionName} ${layerName}`.trim().toLowerCase();

  if (!combined) {
    return "unknown";
  }

  if (combined.includes("active") || combined.includes("unmanaged")) {
    return "unmanaged";
  }

  if (combined.includes("system")) {
    return "system";
  }

  return "managed";
}

function getComponentLayerTypeNameCandidates(componentType: number): string[] {
  const candidates: Record<number, string[]> = {
    [TOOL_COMPONENT_TYPES.table]: ["Entity"],
    [TOOL_COMPONENT_TYPES.column]: ["Attribute"],
    [TOOL_COMPONENT_TYPES.security_role]: ["Role"],
    [TOOL_COMPONENT_TYPES.form]: ["Form"],
    [TOOL_COMPONENT_TYPES.view]: ["SavedQuery", "Saved Query"],
    [TOOL_COMPONENT_TYPES.workflow]: ["Workflow"],
    [TOOL_COMPONENT_TYPES.dashboard]: ["SystemForm", "System Form"],
    [TOOL_COMPONENT_TYPES.web_resource]: ["WebResource", "Web Resource"],
    [TOOL_COMPONENT_TYPES.app_module]: ["AppModule", "App Module", "CanvasApp", "Canvas App"],
    [TOOL_COMPONENT_TYPES.plugin_assembly]: ["PluginAssembly", "Plugin Assembly"],
    [TOOL_COMPONENT_TYPES.plugin_step]: ["SdkMessageProcessingStep", "SDK Message Processing Step"],
    [TOOL_COMPONENT_TYPES.plugin_image]: [
      "SdkMessageProcessingStepImage",
      "SDK Message Processing Step Image",
    ],
    [TOOL_COMPONENT_TYPES.connection_reference]: [
      "Connector",
      "ConnectionReference",
      "Connection Reference",
    ],
    [TOOL_COMPONENT_TYPES.environment_variable_definition]: [
      "EnvironmentVariableDefinition",
      "Environment Variable Definition",
    ],
    [TOOL_COMPONENT_TYPES.environment_variable_value]: [
      "EnvironmentVariableValue",
      "Environment Variable Value",
    ],
  };

  return candidates[componentType] || [];
}
