import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { compareSolutionsData } from "../comparison/compare-solutions.js";
import { summarizeSolutionDependencies } from "../solutions/get-solution-dependencies.js";
import { analyzeReleaseHealth } from "./release-health.js";

type GateVerdict = "go" | "review" | "stop";
type FindingSeverity = "blocker" | "warning";

interface GateFinding {
  id: string;
  severity: FindingSeverity;
  area: string;
  count: number;
  summary: string;
  suggestedNextTools: string[];
}

interface NextAction {
  priority: "high" | "medium";
  reason: string;
  tool: string;
  arguments: Record<string, unknown>;
}

interface DriftAreaSummary {
  area: string;
  onlyInSource: number;
  onlyInTarget: number;
  differences: number;
  total: number;
  suggestedNextTools: string[];
}

export function registerReleaseGateReport(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "release_gate_report",
    "Build an opinionated go or no-go report for moving one solution.",
    {
      environment: z.string().optional().describe("Source environment name"),
      solution: z.string().describe("Solution display name or unique name"),
      targetEnvironment: z.string().optional().describe("Optional target environment name"),
      strict: z
        .boolean()
        .optional()
        .describe("When true, treat warnings like blockers for the final verdict"),
    },
    async ({ environment, solution, targetEnvironment, strict }) => {
      try {
        const env = getEnvironment(config, environment);
        const strictMode = strict ?? false;
        const health = await analyzeReleaseHealth(env, client, solution);

        if (!health.solutionInventory) {
          throw new Error(`Solution '${solution}' not found in '${env.name}'.`);
        }

        const dependencySummary = await summarizeSolutionDependencies(env, client, solution, 8);
        const drift = targetEnvironment
          ? await buildDriftSummary(config, client, env.name, targetEnvironment, solution)
          : null;

        const unsupportedCount =
          (health.unsupportedSummary?.root || 0) + (health.unsupportedSummary?.child || 0);
        const missingComponentCount = health.missingComponents.reduce(
          (sum, item) => sum + item.count,
          0,
        );
        const unmanagedAssetCount = sumCounts(health.unmanagedCounts);
        const inactiveProcessCount =
          health.riskyClassicWorkflows.length + health.riskyCloudFlows.length;

        const blockers: GateFinding[] = [];
        const warnings: GateFinding[] = [];

        addFinding(
          blockers,
          "blocker",
          "missing_components",
          "Dependency Coverage",
          missingComponentCount,
          "Some solution components are missing from the supported inventory view.",
          ["get_solution_details", "get_solution_dependencies"],
        );
        addFinding(
          dependencySummary.counts.externalRequired > 0 ? blockers : warnings,
          dependencySummary.counts.externalRequired > 0 ? "blocker" : "warning",
          "external_dependencies",
          "Dependency Risk",
          dependencySummary.counts.external,
          "The solution depends on components outside the current solution scope.",
          ["get_solution_dependencies"],
        );
        addFinding(
          strictMode ? blockers : warnings,
          strictMode ? "blocker" : "warning",
          "unmanaged_assets",
          "Unmanaged Assets",
          unmanagedAssetCount,
          "The release still contains unmanaged assets.",
          ["get_solution_details", "compare_solutions"],
        );
        addFinding(
          blockers,
          "blocker",
          "disabled_plugin_steps",
          "Disabled Plugin Steps",
          health.disabledPluginSteps.length,
          "Some plugin steps are disabled.",
          ["list_plugin_assemblies", "get_plugin_assembly_details"],
        );
        addFinding(
          strictMode ? blockers : warnings,
          strictMode ? "blocker" : "warning",
          "inactive_processes",
          "Inactive Workflows And Flows",
          inactiveProcessCount,
          "Some workflows or cloud flows are not active.",
          ["list_workflows", "list_cloud_flows"],
        );
        addFinding(
          blockers,
          "blocker",
          "missing_environment_values",
          "Missing Environment Variable Values",
          health.missingEnvironmentVariableValues.length,
          "Some environment variables do not have a current value record.",
          ["list_environment_variables", "get_environment_variable_details"],
        );
        addFinding(
          blockers,
          "blocker",
          "risky_connection_references",
          "Risky Connection References",
          health.riskyConnectionReferences.length,
          "Some connection references are inactive or not linked to a connection.",
          ["list_connection_references", "get_connection_reference_details"],
        );
        addFinding(
          strictMode ? blockers : warnings,
          strictMode ? "blocker" : "warning",
          "unsupported_components",
          "Unsupported Solution Components",
          unsupportedCount,
          "Some solution component types are outside the current supported inventory coverage.",
          ["get_solution_details", "get_solution_dependencies"],
        );
        addFinding(
          strictMode ? blockers : warnings,
          strictMode ? "blocker" : "warning",
          "target_drift",
          "Target Drift",
          drift?.totalChanges || 0,
          `The solution differs between '${env.name}' and '${targetEnvironment}'.`,
          ["compare_solutions", "compare_environment_matrix"],
        );

        const verdict = resolveVerdict(blockers.length, warnings.length);
        const riskLevel = verdict === "stop" ? "High" : verdict === "review" ? "Medium" : "Low";
        const nextActions = buildNextActions(
          env.name,
          solution,
          targetEnvironment || null,
          blockers,
          warnings,
        );

        const lines: string[] = [];
        lines.push("## Release Gate Report");
        lines.push(`- Environment: ${env.name}`);
        lines.push(
          `- Solution: ${health.solutionInventory.solution.friendlyname} (${health.solutionInventory.solution.uniquename})`,
        );
        lines.push(`- Target Environment: ${targetEnvironment || "-"}`);
        lines.push(`- Strict Mode: ${strictMode ? "Yes" : "No"}`);
        lines.push(`- Verdict: ${toTitleCase(verdict)}`);
        lines.push(`- Risk Level: ${riskLevel}`);
        lines.push(`- Blockers: ${blockers.length}`);
        lines.push(`- Warnings: ${warnings.length}`);

        lines.push("");
        lines.push("### Solution Summary");
        lines.push(
          formatTable(
            ["Area", "Value"],
            [
              ["Version", health.solutionInventory.solution.version || "-"],
              ["Managed", health.solutionInventory.solution.ismanaged ? "Yes" : "No"],
              ["Tables", String(health.solutionInventory.tables.length)],
              ["Columns", String(health.solutionInventory.columns.length)],
              ["Forms", String(health.solutionInventory.forms.length)],
              ["Views", String(health.solutionInventory.views.length)],
              ["Workflows", String(health.solutionInventory.workflows.length)],
              ["Plugin Assemblies", String(health.solutionInventory.pluginAssemblies.length)],
              ["Web Resources", String(health.solutionInventory.webResources.length)],
            ],
          ),
        );

        lines.push("");
        lines.push("### Check Summary");
        lines.push(
          formatTable(
            ["Check", "Count"],
            [
              ["External Dependencies", String(dependencySummary.counts.external)],
              ["Missing Components", String(missingComponentCount)],
              ["Unmanaged Assets", String(unmanagedAssetCount)],
              ["Disabled Plugin Steps", String(health.disabledPluginSteps.length)],
              ["Inactive Workflows", String(health.riskyClassicWorkflows.length)],
              ["Inactive Cloud Flows", String(health.riskyCloudFlows.length)],
              [
                "Missing Environment Variable Values",
                String(health.missingEnvironmentVariableValues.length),
              ],
              ["Risky Connection References", String(health.riskyConnectionReferences.length)],
            ],
          ),
        );

        appendFindingSection(lines, "Blockers", blockers);
        appendFindingSection(lines, "Warnings", warnings);

        if (dependencySummary.externalRows.length > 0) {
          lines.push("");
          lines.push("### External Dependency Samples");
          lines.push(
            formatTable(
              ["Direction", "Component", "Other Component", "Type"],
              dependencySummary.externalRows.map((row) => [
                row.direction === "required" ? "Requires" : "Used By",
                `${row.sourceComponentName} (${row.sourceComponentType})`,
                `${row.otherComponentName} (${row.otherComponentType})`,
                row.dependencyType,
              ]),
            ),
          );
        }

        if (drift) {
          lines.push("");
          lines.push("### Target Drift");
          lines.push(
            formatTable(
              ["Area", "Only In Source", "Only In Target", "Differences", "Total"],
              drift.areas.map((area) => [
                area.area,
                String(area.onlyInSource),
                String(area.onlyInTarget),
                String(area.differences),
                String(area.total),
              ]),
            ),
          );
        }

        if (nextActions.length > 0) {
          lines.push("");
          lines.push("### Next Actions");
          lines.push(
            formatTable(
              ["Priority", "Tool", "Reason"],
              nextActions.map((action) => [
                toTitleCase(action.priority),
                action.tool,
                action.reason,
              ]),
            ),
          );
        }

        return createToolSuccessResponse(
          "release_gate_report",
          lines.join("\n"),
          `Release gate verdict for solution '${solution}' in '${env.name}': ${verdict}.`,
          {
            environment: env.name,
            solution,
            targetEnvironment: targetEnvironment || null,
            strict: strictMode,
            verdict,
            riskLevel,
            solutionSummary: {
              friendlyName: health.solutionInventory.solution.friendlyname,
              uniqueName: health.solutionInventory.solution.uniquename,
              version: health.solutionInventory.solution.version || "",
              isManaged: health.solutionInventory.solution.ismanaged || false,
              componentCounts: {
                tables: health.solutionInventory.tables.length,
                columns: health.solutionInventory.columns.length,
                forms: health.solutionInventory.forms.length,
                views: health.solutionInventory.views.length,
                workflows: health.solutionInventory.workflows.length,
                pluginAssemblies: health.solutionInventory.pluginAssemblies.length,
                webResources: health.solutionInventory.webResources.length,
              },
            },
            blockers,
            warnings,
            dependencyRisk: dependencySummary,
            unmanagedAssets: {
              total: unmanagedAssetCount,
              byArea: health.unmanagedCounts,
            },
            disabledPluginSteps: {
              count: health.disabledPluginSteps.length,
              items: health.disabledPluginSteps,
            },
            inactiveProcesses: {
              workflows: health.riskyClassicWorkflows,
              cloudFlows: health.riskyCloudFlows,
            },
            missingEnvironmentVariableValues: {
              count: health.missingEnvironmentVariableValues.length,
              items: health.missingEnvironmentVariableValues,
            },
            riskyConnectionReferences: {
              count: health.riskyConnectionReferences.length,
              items: health.riskyConnectionReferences,
            },
            drift,
            nextActions,
          },
        );
      } catch (error) {
        return createToolErrorResponse("release_gate_report", error);
      }
    },
  );
}

async function buildDriftSummary(
  config: AppConfig,
  client: DynamicsClient,
  sourceEnvironment: string,
  targetEnvironment: string,
  solution: string,
) {
  const comparison = await compareSolutionsData(
    config,
    client,
    sourceEnvironment,
    targetEnvironment,
    solution,
  );
  const areas: DriftAreaSummary[] = [
    buildDriftArea("Plugin Assemblies", comparison.pluginComparison, [
      "compare_solutions",
      "compare_plugin_assemblies",
    ]),
    buildDriftArea("Forms", comparison.formComparison, ["compare_solutions", "compare_forms"]),
    buildDriftArea("Views", comparison.viewComparison, ["compare_solutions", "compare_views"]),
    buildDriftArea("Plugin Steps", comparison.pluginStepComparison, [
      "compare_solutions",
      "compare_plugin_assemblies",
    ]),
    buildDriftArea("Plugin Images", comparison.pluginImageComparison, [
      "compare_solutions",
      "compare_plugin_assemblies",
    ]),
    buildDriftArea("Workflows", comparison.workflowComparison, [
      "compare_solutions",
      "compare_workflows",
    ]),
    buildDriftArea("Web Resources", comparison.webResourceComparison, [
      "compare_solutions",
      "compare_web_resources",
    ]),
  ].filter((area) => area.total > 0);

  return {
    targetEnvironment,
    sourceSolution: comparison.sourceInventory.solution.uniquename,
    targetSolution: comparison.targetInventory.solution.uniquename,
    totalChanges: areas.reduce((sum, area) => sum + area.total, 0),
    areas,
  };
}

function buildDriftArea(
  area: string,
  diff: {
    onlyInSource: unknown[];
    onlyInTarget: unknown[];
    differences: unknown[];
  },
  suggestedNextTools: string[],
): DriftAreaSummary {
  const total = diff.onlyInSource.length + diff.onlyInTarget.length + diff.differences.length;

  return {
    area,
    onlyInSource: diff.onlyInSource.length,
    onlyInTarget: diff.onlyInTarget.length,
    differences: diff.differences.length,
    total,
    suggestedNextTools,
  };
}

function appendFindingSection(lines: string[], title: string, findings: GateFinding[]) {
  if (findings.length === 0) {
    return;
  }

  lines.push("");
  lines.push(`### ${title}`);
  lines.push(
    formatTable(
      ["Area", "Count", "Summary", "Next Tools"],
      findings.map((finding) => [
        finding.area,
        String(finding.count),
        finding.summary,
        finding.suggestedNextTools.join(", "),
      ]),
    ),
  );
}

function addFinding(
  collection: GateFinding[],
  severity: FindingSeverity,
  id: string,
  area: string,
  count: number,
  summary: string,
  suggestedNextTools: string[],
) {
  if (count < 1) {
    return;
  }

  collection.push({
    id,
    severity,
    area,
    count,
    summary,
    suggestedNextTools,
  });
}

function resolveVerdict(blockerCount: number, warningCount: number): GateVerdict {
  if (blockerCount > 0) {
    return "stop";
  }

  if (warningCount > 0) {
    return "review";
  }

  return "go";
}

function buildNextActions(
  environment: string,
  solution: string,
  targetEnvironment: string | null,
  blockers: GateFinding[],
  warnings: GateFinding[],
): NextAction[] {
  const actions = new Map<string, NextAction>();
  const findings = [...blockers, ...warnings];

  for (const finding of findings) {
    switch (finding.id) {
      case "missing_components":
      case "external_dependencies":
      case "unsupported_components":
        actions.set("get_solution_dependencies", {
          priority: "high",
          reason: "Inspect dependency paths and out-of-solution links.",
          tool: "get_solution_dependencies",
          arguments: { environment, solution },
        });
        break;
      case "disabled_plugin_steps":
        actions.set("list_plugin_assemblies", {
          priority: "high",
          reason: "Find the affected plugin assemblies and their disabled steps.",
          tool: "list_plugin_assemblies",
          arguments: { environment, solution },
        });
        break;
      case "inactive_processes":
        actions.set("list_workflows", {
          priority: "medium",
          reason: "Review inactive workflows in the release scope.",
          tool: "list_workflows",
          arguments: { environment, solution },
        });
        actions.set("list_cloud_flows", {
          priority: "medium",
          reason: "Review inactive cloud flows in the release scope.",
          tool: "list_cloud_flows",
          arguments: { environment, solution },
        });
        break;
      case "missing_environment_values":
        actions.set("list_environment_variables", {
          priority: "high",
          reason: "Review variables with no current value.",
          tool: "list_environment_variables",
          arguments: { environment, solution },
        });
        break;
      case "risky_connection_references":
        actions.set("list_connection_references", {
          priority: "high",
          reason: "Review inactive or unbound connection references.",
          tool: "list_connection_references",
          arguments: { environment, solution },
        });
        break;
      case "target_drift":
      case "unmanaged_assets":
        if (targetEnvironment) {
          actions.set("compare_solutions", {
            priority: "medium",
            reason: "Inspect solution drift against the target environment.",
            tool: "compare_solutions",
            arguments: {
              sourceEnvironment: environment,
              targetEnvironment,
              solution,
            },
          });
        }
        break;
      default:
        break;
    }
  }

  return [...actions.values()].slice(0, 6);
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function toTitleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
