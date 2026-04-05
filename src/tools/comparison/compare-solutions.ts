import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { diffCollections } from "../../utils/diff.js";
import { fetchSolutionInventory } from "../solutions/solution-inventory.js";
import { formatNamedDiffSection } from "./diff-section.js";

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
        const formDiff = diffCollections(
          sourceInventory.forms,
          targetInventory.forms,
          (item) => String(item.uniquename || `${item.objecttypecode}:${item.type}:${item.name}`),
          ["objecttypecode", "type", "isdefault", "ismanaged", "formactivationstate"],
        );
        const viewDiff = diffCollections(
          sourceInventory.views,
          targetInventory.views,
          (item) => String(`${item.returnedtypecode}:${item.name}`),
          ["returnedtypecode", "querytype", "isdefault", "isquickfindquery", "ismanaged"],
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
          formatNamedDiffSection({
            title: "Plugin Assemblies",
            result: pluginDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Forms",
            result: formDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Views",
            result: viewDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Plugin Steps",
            result: pluginStepDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "displayName",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Plugin Images",
            result: pluginImageDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "displayName",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Workflows",
            result: workflowDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Web Resources",
            result: webResourceDiff,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
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
