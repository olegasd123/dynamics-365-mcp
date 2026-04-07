import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import type { PluginImageRecord, PluginStepRecord, PluginTypeRecord } from "./plugin-inventory.js";
import {
  fetchPluginMetadata,
  groupImagesByStepId,
  groupStepsByPluginTypeId,
  resolvePluginAssembly,
} from "./plugin-class-metadata.js";

const STAGE_LABELS: Record<number, string> = {
  10: "Pre-Validation",
  20: "Pre-Operation",
  40: "Post-Operation",
};
const MODE_LABELS: Record<number, string> = { 0: "Synchronous", 1: "Asynchronous" };
const IMAGE_TYPE_LABELS: Record<number, string> = { 0: "PreImage", 1: "PostImage", 2: "Both" };

interface AssemblyTypeDetails {
  plugintypeid: string;
  name: string;
  fullName: string;
  isWorkflowActivity: boolean;
  steps: PluginStepDetails[];
}

interface PluginStepDetails extends Record<string, unknown> {
  images: Record<string, unknown>[];
}

export function registerGetPluginAssemblyDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_plugin_assembly_details",
    "Get detailed information about a plugin assembly. Output separates plugin classes and workflow activities.",
    {
      environment: z.string().optional().describe("Environment name"),
      assemblyName: z.string().describe("Name of the plugin assembly"),
    },
    async ({ environment, assemblyName }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchPluginMetadata(env, client, {
          includeSteps: true,
          includeImages: true,
        });
        let assembly: Record<string, unknown>;
        try {
          assembly = resolvePluginAssembly(inventory.assemblies, assemblyName);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === `Plugin assembly '${assemblyName}' not found.`
          ) {
            const text = `Plugin assembly '${assemblyName}' not found in '${env.name}'.`;
            return createToolSuccessResponse("get_plugin_assembly_details", text, text, {
              environment: env.name,
              found: false,
              assemblyName,
            });
          }
          throw error;
        }
        const lines: string[] = [];

        lines.push(`## Plugin Assembly: ${assembly.name}`);
        lines.push(`- **Version**: ${assembly.version}`);
        lines.push(`- **Isolation**: ${assembly.isolationmode === 2 ? "Sandbox" : "None"}`);
        lines.push(`- **Managed**: ${assembly.ismanaged ? "Yes" : "No"}`);
        lines.push(`- **Public Key Token**: ${assembly.publickeytoken || "(none)"}`);
        lines.push(`- **Created**: ${String(assembly.createdon || "").slice(0, 10)}`);
        lines.push(`- **Modified**: ${String(assembly.modifiedon || "").slice(0, 10)}`);
        lines.push("");
        const assemblyId = String(assembly.pluginassemblyid || "");
        const assemblyTypes = inventory.types.filter((type) => type.assemblyId === assemblyId);
        const assemblySteps = inventory.steps.filter((step) => step.assemblyId === assemblyId);
        const assemblyImages = inventory.images.filter((image) => image.assemblyId === assemblyId);
        const stepsByPluginTypeId = groupStepsByPluginTypeId(assemblySteps);
        const imagesByStepId = groupImagesByStepId(assemblyImages);
        const structuredTypes = assemblyTypes.map((type) =>
          buildAssemblyTypeDetails(type, stepsByPluginTypeId, imagesByStepId),
        );
        const pluginClasses = structuredTypes.filter((type) => !type.isWorkflowActivity);
        const workflowActivities = structuredTypes.filter((type) => type.isWorkflowActivity);

        lines.push(`### Plugin Classes (${pluginClasses.length})`);
        lines.push(
          ...renderAssemblyTypeSection(
            pluginClasses,
            "No plugin classes found in this assembly.",
          ),
        );
        lines.push("");
        lines.push(`### Workflow Activities (${workflowActivities.length})`);
        lines.push(
          ...renderAssemblyTypeSection(
            workflowActivities,
            "No workflow activities found in this assembly.",
          ),
        );
        lines.push("");
        lines.push(
          "Note: plugin tools exclude workflow activities. Use workflow terminology for `CodeActivity` classes. Other Dataverse handlers can still appear as plugin classes when Dataverse stores them as plugin types.",
        );

        return createToolSuccessResponse(
          "get_plugin_assembly_details",
          lines.join("\n"),
          `Loaded plugin assembly '${String(assembly.name || assemblyName)}' in '${env.name}'.`,
          {
            environment: env.name,
            found: true,
            pluginAssembly: {
              pluginassemblyid: String(assembly.pluginassemblyid || ""),
              name: String(assembly.name || ""),
              version: String(assembly.version || ""),
              isolation: assembly.isolationmode === 2 ? "Sandbox" : "None",
              managed: Boolean(assembly.ismanaged),
              publicKeyToken: String(assembly.publickeytoken || ""),
              createdOn: String(assembly.createdon || "").slice(0, 10),
              modifiedOn: String(assembly.modifiedon || "").slice(0, 10),
            },
            counts: {
              types: structuredTypes.length,
              pluginClasses: pluginClasses.length,
              workflowActivities: workflowActivities.length,
              steps: assemblySteps.length,
              images: assemblyImages.length,
            },
            pluginClasses,
            workflowActivities,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_plugin_assembly_details", error);
      }
    },
  );
}

function buildAssemblyTypeDetails(
  type: PluginTypeRecord,
  stepsByPluginTypeId: Map<string, PluginStepRecord[]>,
  imagesByStepId: Map<string, PluginImageRecord[]>,
): AssemblyTypeDetails {
  const steps = (stepsByPluginTypeId.get(type.pluginTypeId) || []).map((step) => ({
    ...step,
    stageLabel: STAGE_LABELS[step.stage as number] || String(step.stage),
    modeLabel: MODE_LABELS[step.mode as number] || String(step.mode),
    statusLabel: step.statecode === 0 ? "Enabled" : "Disabled",
    images: (imagesByStepId.get(String(step.sdkmessageprocessingstepid || "")) || []).map((image) => ({
      ...image,
      imageTypeLabel: IMAGE_TYPE_LABELS[image.imagetype as number] || String(image.imagetype),
    })),
  }));

  return {
    plugintypeid: type.pluginTypeId,
    name: type.name,
    fullName: type.fullName,
    isWorkflowActivity: type.isWorkflowActivity,
    steps,
  };
}

function renderAssemblyTypeSection(
  types: AssemblyTypeDetails[],
  emptyMessage: string,
): string[] {
  if (types.length === 0) {
    return [emptyMessage];
  }

  const lines: string[] = [];

  for (const type of types) {
    lines.push(`\n#### ${type.name} (\`${type.fullName}\`)`);

    if (type.steps.length === 0) {
      lines.push("- No registered steps");
      continue;
    }

    lines.push(`- Steps (${type.steps.length}):`);
    for (const step of type.steps) {
      lines.push(`  - ${String(step.name || "")}`);
      lines.push(
        `    Message: ${String(step.messageName || "")} | Entity: ${String(step.primaryEntity || "none")} | Stage: ${String(step.stageLabel || "")} | Mode: ${String(step.modeLabel || "")} | Status: ${String(step.statusLabel || "")}`,
      );

      if (step.filteringattributes) {
        lines.push(`    Filtering: ${String(step.filteringattributes)}`);
      }

      const images = Array.isArray(step.images) ? step.images : [];
      if (images.length > 0) {
        lines.push(`    Images (${images.length}):`);
        for (const image of images) {
          lines.push(
            `    - ${String(image.name || "")} (${String(image.imageTypeLabel || "")}, alias: ${String(image.entityalias || "none")}, attributes: ${String(image.attributes || "all")})`,
          );
        }
      }
    }
  }

  return lines;
}
