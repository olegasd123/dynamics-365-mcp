import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { comparePluginAssembliesData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

export const comparePluginAssembliesTool = createComparisonTool({
  name: "compare_plugin_assemblies",
  description:
    "Compare plugin assemblies and their registrations between two Dynamics 365 environments.",
  schema: {
    sourceEnvironment: z.string().describe("Source environment name (e.g. 'dev')"),
    targetEnvironment: z.string().describe("Target environment name (e.g. 'prod')"),
    assemblyName: z.string().optional().describe("Compare a specific plugin assembly by name"),
  },
  comparisonLabel: "plugin assemblies",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    comparePluginAssembliesData(
      config,
      client,
      params.sourceEnvironment,
      params.targetEnvironment,
      {
        assemblyName: params.assemblyName,
        includeChildComponents: Boolean(params.assemblyName),
      },
    ),
  formatText: ({ params, comparison, sourceEnvironment, targetEnvironment }) => {
    let text = formatDiffResult(comparison.result, sourceEnvironment, targetEnvironment, "name");

    if (
      params.assemblyName &&
      comparison.sourceItems.length > 0 &&
      comparison.targetItems.length > 0 &&
      comparison.stepResult
    ) {
      text += `\n\n### Step Comparison for Plugin Assembly '${params.assemblyName}'\n`;
      text += formatDiffResult(
        comparison.stepResult,
        sourceEnvironment,
        targetEnvironment,
        "displayName",
      );
    }

    if (
      params.assemblyName &&
      comparison.sourceItems.length > 0 &&
      comparison.targetItems.length > 0 &&
      comparison.imageResult
    ) {
      text += `\n\n### Image Comparison for Plugin Assembly '${params.assemblyName}'\n`;
      text += formatDiffResult(
        comparison.imageResult,
        sourceEnvironment,
        targetEnvironment,
        "displayName",
      );
    }

    return text;
  },
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    assemblyName: params.assemblyName || null,
    counts: {
      sourceAssemblies: comparison.sourceItems.length,
      targetAssemblies: comparison.targetItems.length,
    },
    assemblies: comparison.result,
    steps: comparison.stepResult || null,
    images: comparison.imageResult || null,
  }),
});

export const handleComparePluginAssemblies = comparePluginAssembliesTool.handler;

export function registerComparePluginAssemblies(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, comparePluginAssembliesTool, { config, client });
}
