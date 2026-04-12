import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { analyzeReleaseHealth, toTitle } from "./release-health.js";

const environmentHealthReportSchema = {
  environment: z.string().optional().describe("Environment name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type EnvironmentHealthReportParams = ToolParams<typeof environmentHealthReportSchema>;

export async function handleEnvironmentHealthReport(
  { environment, solution }: EnvironmentHealthReportParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const analysis = await analyzeReleaseHealth(env, client, solution);
    const {
      disabledPluginSteps,
      riskyClassicWorkflows,
      riskyCloudFlows,
      inactiveCustomApis,
      inactiveAppModules,
      riskyConnectionReferences,
      missingEnvironmentVariableValues,
      missingComponents,
      unsupportedSummary,
      unmanagedCounts,
      issueCount,
      riskLevel,
    } = analysis;

    const lines: string[] = [];
    lines.push("## Environment Health Report");
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);
    lines.push(`- Risk Level: ${riskLevel}`);
    lines.push(`- Total Issues: ${issueCount}`);
    lines.push("");
    lines.push("### Risk Summary");
    lines.push(
      formatTable(
        ["Check", "Count"],
        [
          ["Disabled Plugin Steps", String(disabledPluginSteps.length)],
          ["Draft Or Suspended Workflows", String(riskyClassicWorkflows.length)],
          ["Inactive Cloud Flows", String(riskyCloudFlows.length)],
          ["Inactive Custom APIs", String(inactiveCustomApis.length)],
          ["Inactive App Modules", String(inactiveAppModules.length)],
          ["Risky Connection References", String(riskyConnectionReferences.length)],
          ["Missing Environment Variable Values", String(missingEnvironmentVariableValues.length)],
          ["Missing Solution Components", String(missingComponents.length)],
          [
            "Unsupported Solution Components",
            String((unsupportedSummary?.root || 0) + (unsupportedSummary?.child || 0)),
          ],
        ],
      ),
    );

    lines.push("");
    lines.push("### Drift Summary");
    lines.push(
      formatTable(
        ["Area", "Unmanaged Count"],
        Object.entries(unmanagedCounts).map(([area, count]) => [toTitle(area), String(count)]),
      ),
    );

    if (disabledPluginSteps.length > 0) {
      lines.push("");
      lines.push("### Disabled Plugin Steps");
      lines.push(
        formatTable(
          ["Assembly", "Step", "Entity"],
          disabledPluginSteps.map((step) => [
            String(step.assemblyName || ""),
            String(step.name || ""),
            String(step.primaryEntity || ""),
          ]),
        ),
      );
    }

    if (riskyClassicWorkflows.length > 0) {
      lines.push("");
      lines.push("### Draft Or Suspended Workflows");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "State"],
          riskyClassicWorkflows.map((workflow) => [
            String(workflow.name || ""),
            String(workflow.uniquename || ""),
            String(workflow.statecode || ""),
          ]),
        ),
      );
    }

    if (riskyCloudFlows.length > 0) {
      lines.push("");
      lines.push("### Inactive Cloud Flows");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "State"],
          riskyCloudFlows.map((flow) => [
            String(flow.name || ""),
            String(flow.uniquename || "-"),
            String(flow.stateLabel || ""),
          ]),
        ),
      );
    }

    if (inactiveAppModules.length > 0) {
      lines.push("");
      lines.push("### Inactive App Modules");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "State"],
          inactiveAppModules.map((item) => [
            String(item.name || ""),
            String(item.uniquename || ""),
            String(item.statecode || ""),
          ]),
        ),
      );
    }

    if (riskyConnectionReferences.length > 0) {
      lines.push("");
      lines.push("### Risky Connection References");
      lines.push(
        formatTable(
          ["Display Name", "Logical Name", "Connected", "State"],
          riskyConnectionReferences.map((item) => [
            String(item.displayname || item.connectionreferencelogicalname || ""),
            String(item.connectionreferencelogicalname || ""),
            item.connectionid ? "Yes" : "No",
            String(item.statecode || ""),
          ]),
        ),
      );
    }

    if (missingEnvironmentVariableValues.length > 0) {
      lines.push("");
      lines.push("### Missing Environment Variable Values");
      lines.push(
        formatTable(
          ["Schema Name", "Display Name", "Default Value"],
          missingEnvironmentVariableValues.map((item) => [
            String(item.schemaname || ""),
            String(item.displayname || ""),
            String(item.defaultvalue || "-"),
          ]),
        ),
      );
    }

    if (missingComponents.length > 0) {
      lines.push("");
      lines.push("### Missing Components");
      lines.push(
        formatTable(
          ["Component Type", "Missing Count"],
          missingComponents.map((row) => [row.componentType, String(row.count)]),
        ),
      );
    }

    if (unsupportedSummary) {
      lines.push("");
      lines.push("### Solution Coverage");
      lines.push(
        formatTable(
          ["Area", "Count"],
          [
            ["Unsupported Root Components", String(unsupportedSummary.root)],
            ["Unsupported Child Components", String(unsupportedSummary.child)],
          ],
        ),
      );
    }

    return createToolSuccessResponse(
      "environment_health_report",
      lines.join("\n"),
      `Built health report for '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        riskLevel,
        totalIssues: issueCount,
        checks: {
          disabledPluginSteps,
          riskyClassicWorkflows,
          riskyCloudFlows,
          inactiveCustomApis,
          inactiveAppModules,
          riskyConnectionReferences,
          missingEnvironmentVariableValues,
          missingComponents,
          unsupportedSummary,
          unmanagedCounts,
        },
      },
    );
  } catch (error) {
    return createToolErrorResponse("environment_health_report", error);
  }
}

export const environmentHealthReportTool = defineTool({
  name: "environment_health_report",
  description: "Build a health report for one environment or one solution in one environment.",
  schema: environmentHealthReportSchema,
  handler: handleEnvironmentHealthReport,
});

export function registerEnvironmentHealthReport(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, environmentHealthReportTool, { config, client });
}
