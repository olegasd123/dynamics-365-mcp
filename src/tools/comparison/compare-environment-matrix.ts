import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { WebResourceType } from "../../queries/web-resource-queries.js";
import type { WorkflowCategory } from "../../queries/workflow-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  comparePluginAssembliesData,
  compareWebResourcesData,
  compareWorkflowsData,
  type PluginComparisonData,
} from "./comparison-data.js";
import { buildMatrixReport, formatMatrixStatus, type MatrixReport } from "./matrix-helpers.js";

const COMPONENT_TYPE_LABELS = {
  plugins: "Plugin Assemblies",
  workflows: "Workflows",
  web_resources: "Web Resources",
} as const;

type ComponentType = keyof typeof COMPONENT_TYPE_LABELS;

interface MatrixSectionData {
  title: string;
  report: MatrixReport;
}

interface ComponentSection {
  componentType: ComponentType;
  title: string;
  text: string;
  reports: MatrixSectionData[];
}

interface MatrixFilters {
  assemblyName?: string;
  workflowName?: string;
  category?: WorkflowCategory;
  type?: WebResourceType;
  nameFilter?: string;
  compareContent?: boolean;
}

export function registerCompareEnvironmentMatrix(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_environment_matrix",
    "Compare one baseline environment against many target environments and show a drift matrix for plugin assemblies with their steps and images, workflows, or web resources.",
    {
      baselineEnvironment: z
        .string()
        .optional()
        .describe("Baseline environment name. Default: configured default environment"),
      targetEnvironments: z
        .array(z.string())
        .optional()
        .describe("Target environment names. Default: all configured environments except baseline"),
      componentType: z
        .enum(["plugins", "workflows", "web_resources", "all"])
        .optional()
        .describe(
          "Component type to compare. 'plugins' means plugin assemblies with steps and images. Default: all",
        ),
      assemblyName: z.string().optional().describe("Filter to one plugin assembly"),
      workflowName: z.string().optional().describe("Filter workflows by name"),
      category: z
        .enum(["workflow", "dialog", "businessrule", "action", "bpf", "modernflow"])
        .optional()
        .describe("Workflow category filter"),
      type: z
        .enum(["html", "css", "js", "xml", "png", "jpg", "gif", "xap", "xsl", "ico", "svg", "resx"])
        .optional()
        .describe("Web resource type filter"),
      nameFilter: z.string().optional().describe("Web resource name contains filter"),
      compareContent: z
        .boolean()
        .optional()
        .describe("For web resources, compare content hashes too"),
      maxRows: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max drift rows per component. Default: 30"),
    },
    async ({
      baselineEnvironment,
      targetEnvironments,
      componentType,
      assemblyName,
      workflowName,
      category,
      type,
      nameFilter,
      compareContent,
      maxRows,
    }) => {
      try {
        const baselineName = baselineEnvironment || config.defaultEnvironment;
        getEnvironment(config, baselineName);

        const resolvedTargetNames = resolveTargetEnvironments(
          config,
          baselineName,
          targetEnvironments,
        );

        if (resolvedTargetNames.length === 0) {
          return createToolErrorResponse(
            "compare_environment_matrix",
            `No target environments found for baseline '${baselineName}'.`,
          );
        }

        const selectedComponents = resolveComponentTypes(componentType);
        const filters: MatrixFilters = {
          assemblyName,
          workflowName,
          category: category as WorkflowCategory | undefined,
          type: type as WebResourceType | undefined,
          nameFilter,
          compareContent,
        };
        const rowLimit = maxRows ?? 30;

        const sections = await Promise.all(
          selectedComponents.map((selectedComponent) =>
            buildComponentSection(
              config,
              client,
              selectedComponent,
              baselineName,
              resolvedTargetNames,
              filters,
              rowLimit,
            ),
          ),
        );

        const lines: string[] = [];
        lines.push("## Environment Matrix");
        lines.push(`- **Baseline**: ${baselineName}`);
        lines.push(`- **Targets**: ${resolvedTargetNames.join(", ")}`);
        lines.push(
          `- **Components**: ${selectedComponents
            .map((component) => COMPONENT_TYPE_LABELS[component])
            .join(", ")}`,
        );

        const activeFilters = describeFilters(filters);
        if (activeFilters.length > 0) {
          lines.push(`- **Filters**: ${activeFilters.join("; ")}`);
        }

        for (const section of sections) {
          lines.push("");
          lines.push(section.text);
        }

        return createToolSuccessResponse(
          "compare_environment_matrix",
          lines.join("\n"),
          `Compared baseline '${baselineName}' against ${resolvedTargetNames.length} environment(s).`,
          {
            baselineEnvironment: baselineName,
            targetEnvironments: resolvedTargetNames,
            componentTypes: selectedComponents,
            filters: {
              assemblyName: assemblyName || null,
              workflowName: workflowName || null,
              category: category || null,
              type: type || null,
              nameFilter: nameFilter || null,
              compareContent: compareContent || false,
            },
            maxRows: rowLimit,
            sections: sections.map((section) => ({
              componentType: section.componentType,
              title: section.title,
              reports: section.reports,
            })),
          },
        );
      } catch (error) {
        return createToolErrorResponse("compare_environment_matrix", error);
      }
    },
  );
}

async function buildComponentSection(
  config: AppConfig,
  client: DynamicsClient,
  componentType: ComponentType,
  baselineName: string,
  targetNames: string[],
  filters: MatrixFilters,
  maxRows: number,
): Promise<ComponentSection> {
  switch (componentType) {
    case "plugins":
      return renderPluginMatrixSections(
        baselineName,
        targetNames,
        await Promise.all(
          targetNames.map(async (targetName) => ({
            environment: targetName,
            ...(await comparePluginAssembliesData(config, client, baselineName, targetName, {
              assemblyName: filters.assemblyName,
              includeChildComponents: true,
            })),
          })),
        ),
        maxRows,
      );
    case "workflows":
      return renderSingleMatrixComponent(
        "workflows",
        COMPONENT_TYPE_LABELS.workflows,
        baselineName,
        targetNames,
        buildMatrixReport(
          await Promise.all(
            targetNames.map(async (targetName) => ({
              environment: targetName,
              ...(await compareWorkflowsData(config, client, baselineName, targetName, {
                category: filters.category,
                workflowName: filters.workflowName,
              })),
            })),
          ),
          (item) => String(item.uniquename || item.name),
          maxRows,
        ),
      );
    case "web_resources":
      return renderSingleMatrixComponent(
        "web_resources",
        COMPONENT_TYPE_LABELS.web_resources,
        baselineName,
        targetNames,
        buildMatrixReport(
          await Promise.all(
            targetNames.map(async (targetName) => ({
              environment: targetName,
              ...(await compareWebResourcesData(config, client, baselineName, targetName, {
                type: filters.type,
                nameFilter: filters.nameFilter,
                compareContent: filters.compareContent,
              })),
            })),
          ),
          (item) => String(item.name),
          maxRows,
        ),
      );
  }
}

function renderMatrixSection(
  title: string,
  baselineName: string,
  targetNames: string[],
  report: MatrixReport,
): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);

  const summaryHeaders = [
    "Environment",
    "Matching",
    "Diff",
    `Missing vs ${baselineName}`,
    "Extra",
    "Status",
  ];
  const summaryRows = report.summaries.map((summary) => [
    summary.environment,
    String(summary.matching),
    String(summary.differences),
    String(summary.onlyInBaseline),
    String(summary.onlyInTarget),
    summary.differences === 0 && summary.onlyInBaseline === 0 && summary.onlyInTarget === 0
      ? "Aligned"
      : "Drift",
  ]);

  lines.push("");
  lines.push(formatTable(summaryHeaders, summaryRows));

  if (report.totalDriftRows === 0) {
    lines.push("");
    lines.push("No drift found.");
    return lines.join("\n");
  }

  const driftHeaders = ["Item", ...targetNames];
  const driftRows = report.rows.map((row) => [
    row.key,
    ...targetNames.map((targetName) => formatMatrixStatus(row.statuses[targetName] || "absent")),
  ]);

  lines.push("");
  lines.push(`Drift rows: ${report.totalDriftRows}`);
  lines.push("");
  lines.push(formatTable(driftHeaders, driftRows));

  if (report.omittedRowCount > 0) {
    lines.push("");
    lines.push(
      `Showing first ${report.rows.length} drift row(s). Omitted: ${report.omittedRowCount}.`,
    );
  }

  if (report.differenceDetails.length > 0) {
    lines.push("");
    lines.push("Field differences:");
    for (const detail of report.differenceDetails) {
      const parts = Object.entries(detail.fieldsByEnvironment)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([environment, fields]) => `${environment}: ${fields.join(", ")}`);
      lines.push(`- ${detail.key}: ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function renderSingleMatrixComponent(
  componentType: ComponentType,
  title: string,
  baselineName: string,
  targetNames: string[],
  report: MatrixReport,
): ComponentSection {
  return {
    componentType,
    title,
    text: renderMatrixSection(title, baselineName, targetNames, report),
    reports: [{ title, report }],
  };
}

function renderPluginMatrixSections(
  baselineName: string,
  targetNames: string[],
  snapshots: Array<{ environment: string } & PluginComparisonData>,
  maxRows: number,
): ComponentSection {
  const assemblyReport = buildMatrixReport(
    snapshots.map((snapshot) => ({
      environment: snapshot.environment,
      sourceItems: snapshot.sourceItems,
      targetItems: snapshot.targetItems,
      result: snapshot.result,
    })),
    (item) => String(item.name),
    maxRows,
  );

  const stepReport = buildMatrixReport(
    snapshots.map((snapshot) => ({
      environment: snapshot.environment,
      sourceItems: snapshot.stepSourceItems || [],
      targetItems: snapshot.stepTargetItems || [],
      result: snapshot.stepResult || {
        matching: 0,
        onlyInSource: [],
        onlyInTarget: [],
        differences: [],
      },
    })),
    (item) => String(item.key),
    maxRows,
  );

  const imageReport = buildMatrixReport(
    snapshots.map((snapshot) => ({
      environment: snapshot.environment,
      sourceItems: snapshot.imageSourceItems || [],
      targetItems: snapshot.imageTargetItems || [],
      result: snapshot.imageResult || {
        matching: 0,
        onlyInSource: [],
        onlyInTarget: [],
        differences: [],
      },
    })),
    (item) => String(item.key),
    maxRows,
  );

  return {
    componentType: "plugins",
    title: COMPONENT_TYPE_LABELS.plugins,
    text: [
      "### Plugin Assemblies And Registrations",
      "",
      renderMatrixSection("Plugin Assemblies", baselineName, targetNames, assemblyReport),
      "",
      renderMatrixSection("Plugin Steps", baselineName, targetNames, stepReport),
      "",
      renderMatrixSection("Plugin Images", baselineName, targetNames, imageReport),
    ].join("\n"),
    reports: [
      { title: "Plugin Assemblies", report: assemblyReport },
      { title: "Plugin Steps", report: stepReport },
      { title: "Plugin Images", report: imageReport },
    ],
  };
}

function resolveTargetEnvironments(
  config: AppConfig,
  baselineName: string,
  targetNames?: string[],
): string[] {
  const names =
    targetNames && targetNames.length > 0
      ? targetNames
      : config.environments
          .map((environment) => environment.name)
          .filter((environmentName) => environmentName !== baselineName);

  const uniqueNames = [...new Set(names)];
  for (const name of uniqueNames) {
    if (name === baselineName) {
      continue;
    }
    getEnvironment(config, name);
  }

  return uniqueNames.filter((name) => name !== baselineName);
}

function resolveComponentTypes(
  componentType?: "plugins" | "workflows" | "web_resources" | "all",
): ComponentType[] {
  if (!componentType || componentType === "all") {
    return ["plugins", "workflows", "web_resources"];
  }
  return [componentType];
}

function describeFilters(filters: MatrixFilters): string[] {
  const parts: string[] = [];

  if (filters.assemblyName) {
    parts.push(`plugin assembly=${filters.assemblyName}`);
  }
  if (filters.workflowName) {
    parts.push(`workflow=${filters.workflowName}`);
  }
  if (filters.category) {
    parts.push(`workflow category=${filters.category}`);
  }
  if (filters.type) {
    parts.push(`web resource type=${filters.type}`);
  }
  if (filters.nameFilter) {
    parts.push(`web resource name contains=${filters.nameFilter}`);
  }
  if (filters.compareContent) {
    parts.push("web resource content hash=true");
  }

  return parts;
}
