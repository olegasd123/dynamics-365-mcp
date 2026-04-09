import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { diffCollections, type DiffResult } from "../../utils/diff.js";
import { fetchSolutionInventory } from "../solutions/solution-inventory.js";
import { formatNamedDiffSection } from "./diff-section.js";

export interface SolutionComparisonData {
  sourceInventory: Awaited<ReturnType<typeof fetchSolutionInventory>>;
  targetInventory: Awaited<ReturnType<typeof fetchSolutionInventory>>;
  pluginComparison: DiffResult<Record<string, unknown>>;
  formComparison: DiffResult<Record<string, unknown>>;
  viewComparison: DiffResult<Record<string, unknown>>;
  pluginStepComparison: DiffResult<Record<string, unknown>>;
  pluginImageComparison: DiffResult<Record<string, unknown>>;
  workflowComparison: DiffResult<Record<string, unknown>>;
  webResourceComparison: DiffResult<Record<string, unknown>>;
}

export async function compareSolutionsData(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  solution: string,
  targetSolution?: string,
): Promise<SolutionComparisonData> {
  const sourceEnv = getEnvironment(config, sourceEnvironment);
  const targetEnv = getEnvironment(config, targetEnvironment);
  const [sourceInventory, targetInventory] = await Promise.all([
    fetchSolutionInventory(sourceEnv, client, solution),
    fetchSolutionInventory(targetEnv, client, targetSolution || solution),
  ]);

  return {
    sourceInventory,
    targetInventory,
    pluginComparison: diffCollections(
      sourceInventory.pluginAssemblies,
      targetInventory.pluginAssemblies,
      (item) => String(item.name),
      ["version", "isolationmode", "ismanaged"],
    ),
    formComparison: diffCollections(
      sourceInventory.forms,
      targetInventory.forms,
      (item) => String(item.uniquename || `${item.objecttypecode}:${item.type}:${item.name}`),
      ["objecttypecode", "type", "isdefault", "ismanaged", "formactivationstate"],
    ),
    viewComparison: diffCollections(
      sourceInventory.views,
      targetInventory.views,
      (item) => String(`${item.returnedtypecode}:${item.name}`),
      ["returnedtypecode", "querytype", "isdefault", "isquickfindquery", "ismanaged"],
    ),
    pluginStepComparison: diffCollections(
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
    ),
    pluginImageComparison: diffCollections(
      sourceInventory.pluginImages,
      targetInventory.pluginImages,
      (item) => buildPluginImageComparisonKey(item),
      ["entityalias", "imagetype", "attributes", "messagepropertyname"],
    ),
    workflowComparison: diffCollections(
      sourceInventory.workflows,
      targetInventory.workflows,
      (item) => String(item.uniquename || item.name),
      ["statecode", "statuscode", "category", "mode", "ismanaged"],
    ),
    webResourceComparison: diffCollections(
      sourceInventory.webResources,
      targetInventory.webResources,
      (item) => String(item.name),
      ["webresourcetype", "ismanaged"],
    ),
  };
}

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
        const {
          sourceInventory,
          targetInventory,
          pluginComparison,
          formComparison,
          viewComparison,
          pluginStepComparison,
          pluginImageComparison,
          workflowComparison,
          webResourceComparison,
        } = await compareSolutionsData(
          config,
          client,
          sourceEnvironment,
          targetEnvironment,
          solution,
          targetSolution,
        );

        const lines: string[] = [];
        lines.push("## Solution Comparison");
        lines.push(
          `- **Source**: ${sourceEnvironment} :: ${sourceInventory.solution.friendlyname}`,
        );
        lines.push(
          `- **Target**: ${targetEnvironment} :: ${targetInventory.solution.friendlyname}`,
        );
        lines.push(
          `- **Solutions**: ${sourceInventory.solution.uniquename} -> ${targetInventory.solution.uniquename}`,
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Plugin Assemblies",
            result: pluginComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Forms",
            result: formComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Views",
            result: viewComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Plugin Steps",
            result: pluginStepComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "displayName",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Plugin Images",
            result: pluginImageComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "displayName",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Workflows",
            result: workflowComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );
        lines.push("");
        lines.push(
          formatNamedDiffSection({
            title: "Web Resources",
            result: webResourceComparison,
            sourceLabel: sourceEnvironment,
            targetLabel: targetEnvironment,
            nameField: "name",
          }),
        );

        return createToolSuccessResponse(
          "compare_solutions",
          lines.join("\n"),
          `Compared solution '${solution}' between '${sourceEnvironment}' and '${targetEnvironment}'.`,
          {
            sourceEnvironment,
            targetEnvironment,
            solution,
            targetSolution: targetSolution || null,
            pluginComparison,
            formComparison,
            viewComparison,
            pluginStepComparison,
            pluginImageComparison,
            workflowComparison,
            webResourceComparison,
          },
        );
      } catch (error) {
        return createToolErrorResponse("compare_solutions", error);
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
