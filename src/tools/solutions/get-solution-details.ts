import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import {
  fetchSolutionInventory,
  getSolutionComponentTypeLabel,
} from "./solution-inventory.js";

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

export function registerGetSolutionDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_solution_details",
    "Show a solution summary and list supported components like plugins, workflows, and web resources.",
    {
      environment: z.string().optional().describe("Environment name"),
      solution: z
        .string()
        .describe("Solution display name or unique name"),
    },
    async ({ environment, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const inventory = await fetchSolutionInventory(env, client, solution);

        const lines: string[] = [];
        lines.push(`## Solution: ${inventory.solution.friendlyname}`);
        lines.push(`- **Environment**: ${env.name}`);
        lines.push(`- **Unique Name**: ${inventory.solution.uniquename}`);
        lines.push(`- **Version**: ${String(inventory.solution.version || "")}`);
        lines.push(`- **Managed**: ${inventory.solution.ismanaged ? "Yes" : "No"}`);
        lines.push(`- **Modified**: ${String(inventory.solution.modifiedon || "").slice(0, 10)}`);
        lines.push(`- **Root Components**: ${inventory.rootComponents.length}`);
        lines.push(`- **Child Components**: ${inventory.childComponents.length}`);
        lines.push(
          `- **Supported Root Components**: Plugins ${inventory.pluginAssemblies.length} | Workflows ${inventory.workflows.length} | Web Resources ${inventory.webResources.length}`,
        );
        lines.push(`- **Other Root Components**: ${inventory.unsupportedRootComponents.length}`);

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

        if (inventory.workflows.length > 0) {
          lines.push("");
          lines.push("### Workflows");
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Category", "Status", "Entity"],
              inventory.workflows.map((workflow) => [
                String(workflow.name || ""),
                String(workflow.uniquename || ""),
                WORKFLOW_CATEGORY_LABELS[workflow.category as number] || String(workflow.category),
                workflow.statecode === 1 ? "Activated" : workflow.statecode === 2 ? "Suspended" : "Draft",
                String(workflow.primaryentity || "none"),
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
                WEB_RESOURCE_TYPE_LABELS[resource.webresourcetype as number] ||
                  String(resource.webresourcetype),
                resource.ismanaged ? "Yes" : "No",
                String(resource.modifiedon || "").slice(0, 10),
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
                ROOT_BEHAVIOR_LABELS[component.rootcomponentbehavior as number] ||
                  String(component.rootcomponentbehavior ?? ""),
              ]),
            ),
          );
        }

        return { content: [{ type: "text" as const, text: lines.join("\n\n") }] };
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
