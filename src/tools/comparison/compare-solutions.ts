import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { diffCollections, type DiffResult } from "../../utils/diff.js";
import { fetchSolutionInventory } from "../solutions/solution-inventory.js";

export function registerCompareSolutions(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_solutions",
    "Compare supported solution components between two environments for one solution.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      solution: z.string().describe("Source solution display name or unique name"),
      targetSolution: z
        .string()
        .optional()
        .describe("Optional target solution display name or unique name"),
    },
    async ({ sourceEnvironment, targetEnvironment, solution, targetSolution }) => {
      try {
        const sourceEnv = getEnvironment(config, sourceEnvironment);
        const targetEnv = getEnvironment(config, targetEnvironment);
        const [sourceInventory, targetInventory] = await Promise.all([
          fetchSolutionInventory(sourceEnv, client, solution),
          fetchSolutionInventory(targetEnv, client, targetSolution || solution),
        ]);

        const pluginDiff = diffCollections(
          sourceInventory.pluginAssemblies,
          targetInventory.pluginAssemblies,
          (item) => String(item.name),
          ["version", "isolationmode", "ismanaged"],
        );
        const pluginStepDiff = diffCollections(
          sourceInventory.pluginSteps,
          targetInventory.pluginSteps,
          (item) => buildPluginStepComparisonKey(item),
          [
            "stage",
            "mode",
            "statecode",
            "rank",
            "filteringattributes",
            "supporteddeployment",
            "asyncautodelete",
          ],
        );
        const pluginImageDiff = diffCollections(
          sourceInventory.pluginImages,
          targetInventory.pluginImages,
          (item) => buildPluginImageComparisonKey(item),
          ["entityalias", "imagetype", "attributes", "messagepropertyname"],
        );
        const workflowDiff = diffCollections(
          sourceInventory.workflows,
          targetInventory.workflows,
          (item) => String(item.uniquename || item.name),
          ["statecode", "statuscode", "category", "mode", "ismanaged"],
        );
        const webResourceDiff = diffCollections(
          sourceInventory.webResources,
          targetInventory.webResources,
          (item) => String(item.name),
          ["webresourcetype", "ismanaged"],
        );

        const lines: string[] = [];
        lines.push("## Solution Comparison");
        lines.push(`- **Source**: ${sourceEnvironment} :: ${sourceInventory.solution.friendlyname}`);
        lines.push(`- **Target**: ${targetEnvironment} :: ${targetInventory.solution.friendlyname}`);
        lines.push(
          `- **Solutions**: ${sourceInventory.solution.uniquename} -> ${targetInventory.solution.uniquename}`,
        );
        lines.push("");
        lines.push(
          renderDiffSection("Plugin Assemblies", pluginDiff, sourceEnvironment, targetEnvironment, "name"),
        );
        lines.push("");
        lines.push(
          renderDiffSection(
            "Plugin Steps",
            pluginStepDiff,
            sourceEnvironment,
            targetEnvironment,
            "displayName",
          ),
        );
        lines.push("");
        lines.push(
          renderDiffSection(
            "Plugin Images",
            pluginImageDiff,
            sourceEnvironment,
            targetEnvironment,
            "displayName",
          ),
        );
        lines.push("");
        lines.push(
          renderDiffSection(
            "Workflows",
            workflowDiff,
            sourceEnvironment,
            targetEnvironment,
            "name",
          ),
        );
        lines.push("");
        lines.push(
          renderDiffSection(
            "Web Resources",
            webResourceDiff,
            sourceEnvironment,
            targetEnvironment,
            "name",
          ),
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

function renderDiffSection<T extends Record<string, unknown>>(
  title: string,
  result: DiffResult<T>,
  sourceEnvironment: string,
  targetEnvironment: string,
  nameField: string,
): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push(
    `Matching: ${result.matching} | Differences: ${result.differences.length} | Only in ${sourceEnvironment}: ${result.onlyInSource.length} | Only in ${targetEnvironment}: ${result.onlyInTarget.length}`,
  );

  if (
    result.matching === 0 &&
    result.differences.length === 0 &&
    result.onlyInSource.length === 0 &&
    result.onlyInTarget.length === 0
  ) {
    lines.push("");
    lines.push("No supported components found.");
    return lines.join("\n");
  }

  if (result.onlyInSource.length > 0) {
    lines.push("");
    lines.push(`Only in ${sourceEnvironment}:`);
    for (const item of result.onlyInSource) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
  }

  if (result.onlyInTarget.length > 0) {
    lines.push("");
    lines.push(`Only in ${targetEnvironment}:`);
    for (const item of result.onlyInTarget) {
      lines.push(`- ${String(item[nameField] || "unknown")}`);
    }
  }

  if (result.differences.length > 0) {
    lines.push("");
    lines.push("Differences:");
    for (const diff of result.differences) {
      lines.push(`- ${diff.key}`);
      for (const change of diff.changedFields) {
        lines.push(
          `  ${change.field}: \`${formatValue(change.sourceValue)}\` -> \`${formatValue(change.targetValue)}\``,
        );
      }
    }
  }

  return lines.join("\n");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "(none)";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function buildPluginStepComparisonKey(item: Record<string, unknown>): string {
  return [
    String(item.assemblyName || ""),
    String(item.pluginTypeFullName || item.pluginTypeName || ""),
    String(item.messageName || ""),
    String(item.primaryEntity || ""),
    String(item.name || ""),
  ].join(" | ");
}

function buildPluginImageComparisonKey(item: Record<string, unknown>): string {
  return [
    String(item.assemblyName || ""),
    String(item.pluginTypeName || ""),
    String(item.messageName || ""),
    String(item.primaryEntity || ""),
    String(item.stepName || ""),
    String(item.name || ""),
  ].join(" | ");
}
