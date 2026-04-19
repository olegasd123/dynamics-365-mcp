import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import { EXPECTED_PROMPT_NAMES, PROMPT_REFERENCE_ITEMS } from "../prompts/index.js";
import { buildToolGroupsResourceSection } from "../tools/readme-docs.js";

export const STATIC_RESOURCE_URIS = [
  "d365://guides/getting-started",
  "d365://reference/advanced-query-guidance",
  "d365://reference/environments",
  "d365://reference/prompts",
  "d365://reference/tool-groups",
  "d365://reference/task-routing",
  "d365://reference/release-checklist",
  "d365://reference/plugin-troubleshooting",
] as const;

export const ENVIRONMENT_STARTER_TEMPLATE_URI = "d365://environments/{environment}/starter";

function markdownResource(uri: string, text: string): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text,
      },
    ],
  };
}

function buildGettingStartedResource(config: AppConfig): string {
  const environmentList = config.environments
    .map((environment) => `- \`${environment.name}\``)
    .join("\n");

  return [
    "# Dynamics 365 MCP Starter",
    "",
    "Use this server when you need to inspect Dynamics 365 metadata, compare environments, or trace release risk.",
    "",
    "## Configured Environments",
    environmentList,
    "",
    `Default environment: \`${config.defaultEnvironment}\``,
    "",
    "## Best First Steps",
    "- Use the `discover_metadata` prompt if you know a name but not the right tool yet.",
    "- Use the `review_solution` prompt to inspect one solution.",
    "- Use the `release_gate_check` prompt before a release check.",
    "- Read `d365://reference/advanced-query-guidance` before using any escape-hatch query path.",
    "- Read `d365://reference/task-routing` to map common tasks to the right prompt or tool.",
    "",
    "## By Role",
    "- Maker: `discover_metadata`, `investigate_table_change`, `trace_flow_dependency`",
    "- Release manager: `release_gate_check`, `analyze_environment_drift`, `compare_solution`",
    "- Support or ops: `investigate_plugin_failure`, `environment_health_report`",
    "- Security reviewer: `review_security_role`",
    "",
    "## Useful Entry Tools",
    "- `find_metadata` for broad discovery",
    "- `list_solutions` before a solution deep dive",
    "- `release_gate_report` for one go or no-go release view",
    "- `compare_environment_matrix` for multi-environment drift",
  ].join("\n");
}

function buildEnvironmentReferenceResource(config: AppConfig): string {
  return [
    "# Configured Environments",
    "",
    ...config.environments.map(
      (environment) =>
        `- \`${environment.name}\`: ${environment.url} (${environment.authType || "clientSecret"})`,
    ),
    "",
    `Default environment: \`${config.defaultEnvironment}\``,
  ].join("\n");
}

function buildAdvancedQueryGuidanceResource(): string {
  return [
    "# Advanced Query Guidance",
    "",
    "Use this guide before you reach for the ad-hoc FetchXML escape hatch.",
    "",
    "## Default Rule",
    "- Prefer curated tools first because they resolve names, normalize output, and guide the next step.",
    "- Use `run_fetchxml` only when the curated tools cannot answer a specific read-only question.",
    "- Keep the fallback query scoped to one known table and the smallest useful row set.",
    "",
    "## Good Reasons To Use `run_fetchxml`",
    "- You already know the table and need a one-off filter that the curated tools do not expose.",
    "- You need to verify a suspected condition from a view or troubleshooting note.",
    "- You need a temporary escape hatch while deciding whether a new first-class tool is worth adding.",
    "",
    "## Bad Reasons To Use `run_fetchxml`",
    "- Broad discovery when `find_metadata`, `list_*`, or detail tools would work better.",
    "- Routine record reads already covered by `list_table_records` or `get_table_record_details`.",
    "- Cross-table exploration when you do not yet know the right entity or relationship path.",
    "",
    "## Safer First Choices",
    "- Unknown name or object: `discover_metadata` prompt, then `find_metadata`",
    "- Need one row or a short record list: `list_table_records` or `get_table_record_details`",
    "- Need view logic: `get_view_details` or `get_view_fetchxml`",
    "- Need release or dependency context: `review_solution`, `release_gate_check`, `get_solution_dependencies`",
    "",
    "## Escape Hatch Checklist",
    "1. Confirm the exact table first.",
    "2. Keep the query read-only and focused on one question.",
    "3. Request the smallest reasonable limit.",
    "4. Prefer a curated follow-up if the first fallback query reveals a clearer next tool.",
  ].join("\n");
}

function buildPromptReferenceResource(): string {
  return [
    "# Built-in MCP Prompts",
    "",
    ...PROMPT_REFERENCE_ITEMS.map((item) => `- \`${item.name}\`: ${item.summary}`),
    "",
    "These prompts are conversation starters. They guide the client toward the right tool sequence.",
  ].join("\n");
}

function buildToolGroupsResource(): string {
  return buildToolGroupsResourceSection();
}

function buildTaskRoutingResource(): string {
  return [
    "# Task Routing",
    "",
    "Use this guide when you know the task, but not the best prompt or tool.",
    "",
    "## Common Tasks",
    "- Need to decide whether an escape hatch is justified: prompt `advanced_query_fallback`, then use the best curated tool first and `run_fetchxml` only if the gap stays specific",
    "- Release check before import or deploy: prompt `release_gate_check`, first tool `release_gate_report`, follow-up `get_solution_dependencies` or `compare_solutions`",
    "- Plugin step does not fire: prompt `investigate_plugin_failure`, first tool `get_plugin_details`, follow-up `list_plugin_steps`",
    "- Need workflows that use a custom workflow activity class: tool `find_workflow_activity_usage`; do not rely on plugin step registrations for `CodeActivity` usage",
    "- Need drift view across dev, test, and prod: prompt `analyze_environment_drift`, first tool `compare_environment_matrix`, follow-up one pairwise compare tool",
    "- Need to review a security role: prompt `review_security_role`, first tool `list_security_roles`, follow-up `get_role_privileges`",
    "- Need to trace a cloud flow problem: prompt `trace_flow_dependency`, first tool `get_flow_details`, follow-up `get_solution_dependencies` or `list_connection_references`",
    "- Need to inspect an unknown name: prompt `discover_metadata`, first tool `find_metadata`, follow-up a detail tool for the strongest match",
    "",
    "## By Role",
    "- Maker: start with `discover_metadata`, then move to form, view, table, or flow detail tools",
    "- Release manager: start with `release_gate_check` or `analyze_environment_drift`",
    "- Plugin developer: start with `investigate_plugin_failure`",
    "- Security reviewer: start with `review_security_role`",
    "- Support analyst: start with `environment_health_report` for wide risk, then narrow with one domain prompt",
  ].join("\n");
}

function buildReleaseChecklistResource(): string {
  return [
    "# Release Checklist",
    "",
    "Use this list before you import or ship a Dynamics 365 release.",
    "",
    "1. Run the `release_gate_check` prompt for the target environment.",
    "2. Review `release_gate_report` for blockers like disabled steps, inactive flows, risky connection references, and missing variable values.",
    "3. If the release is solution-scoped, inspect `get_solution_details` and `get_solution_dependencies`.",
    "4. If you compare against another environment, use `compare_solutions` or `compare_environment_matrix` next.",
    "5. If drift is found, use one deep compare tool like `compare_plugin_assemblies`, `compare_workflows`, or `compare_web_resources`.",
    "6. Stop the release when blockers are still open or when missing components point outside the planned solution.",
    "",
    "## Good Follow-up Questions",
    "- Which blockers are real release stops?",
    "- Which drift items are expected?",
    "- Which missing dependencies need another solution or environment variable value?",
  ].join("\n");
}

function buildPluginTroubleshootingResource(): string {
  return [
    "# Plugin Troubleshooting",
    "",
    "Use this guide when a plugin class or assembly does not behave as expected.",
    "",
    "## Quick Paths",
    "- Plugin class does not run: `investigate_plugin_failure` prompt, then `get_plugin_details`, then `list_plugin_steps`",
    "- Need DLL-wide view: `get_plugin_assembly_details`",
    "- Need workflow processes that call a workflow activity class: `find_workflow_activity_usage`",
    "- Need image details: `list_plugin_assembly_images`",
    "- Need step list by assembly: `list_plugin_assembly_steps`",
    "- Need recent runtime failures: `list_plugin_trace_logs`",
    "- Need one full runtime log: `get_plugin_trace_log_details`",
    "- Need cross-environment check: `compare_plugin_assemblies`",
    "",
    "## What To Look For",
    "- Wrong message, entity, stage, or mode",
    "- Disabled step",
    "- Missing filtering attributes",
    "- Missing or wrong pre-image or post-image",
    "- Handler exists in one environment but not another",
    "",
    "## Boundary Reminder",
    "- Plugin class tools cover `IPlugin` classes.",
    "- Assembly detail also shows workflow activities stored in the same assembly.",
    "- Workflow process usage of a `CodeActivity` class comes from workflow definitions, not plugin step registrations.",
  ].join("\n");
}

function buildEnvironmentStarterResource(config: AppConfig, environmentName: string): string {
  const environment = config.environments.find((item) => item.name === environmentName);
  const otherEnvironment =
    config.environments.find((item) => item.name !== environmentName)?.name || environmentName;

  return [
    `# Starter For ${environmentName}`,
    "",
    environment
      ? `URL: ${environment.url}`
      : "This environment name is not in the current config. Use one of the configured names instead.",
    "",
    "## Good First Prompts",
    `- \`discover_metadata\` with environment \`${environmentName}\``,
    `- \`review_solution\` with environment \`${environmentName}\``,
    `- \`release_gate_check\` with environment \`${environmentName}\``,
    "",
    "## Good First Tool Calls",
    `- \`find_metadata\` in \`${environmentName}\``,
    `- \`list_solutions\` in \`${environmentName}\``,
    `- \`release_gate_report\` in \`${environmentName}\``,
    "",
    "## Quick Paths By Task",
    `- Release risk in ${environmentName}: \`release_gate_check\`, then \`release_gate_report\``,
    `- Plugin issue in ${environmentName}: \`investigate_plugin_failure\`, then \`get_plugin_details\``,
    `- Flow dependency in ${environmentName}: \`trace_flow_dependency\`, then \`get_flow_details\``,
    "",
    "## Example Questions",
    `- In ${environmentName}, find metadata that matches 'account'.`,
    `- In ${environmentName}, review solution ContosoCore.`,
    `- Compare solution ContosoCore between ${environmentName} and ${otherEnvironment}.`,
  ].join("\n");
}

function getTemplateVariable(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value)) {
    return value[0] || fallback;
  }

  return value || fallback;
}

export function registerAllResources(server: McpServer, config: AppConfig): void {
  server.registerResource(
    "getting-started",
    STATIC_RESOURCE_URIS[0],
    {
      title: "Getting Started",
      description: "Start here for the main Dynamics 365 MCP entry points.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildGettingStartedResource(config)),
  );

  server.registerResource(
    "advanced-query-guidance",
    STATIC_RESOURCE_URIS[1],
    {
      title: "Advanced Query Guidance",
      description:
        "When to use curated tools first and when a gated FetchXML escape hatch is justified.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildAdvancedQueryGuidanceResource()),
  );

  server.registerResource(
    "environment-reference",
    STATIC_RESOURCE_URIS[2],
    {
      title: "Environment Reference",
      description: "Configured environment names and URLs.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildEnvironmentReferenceResource(config)),
  );

  server.registerResource(
    "prompt-reference",
    STATIC_RESOURCE_URIS[3],
    {
      title: "Prompt Reference",
      description: "Built-in prompt names and what they are for.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildPromptReferenceResource()),
  );

  server.registerResource(
    "tool-groups",
    STATIC_RESOURCE_URIS[4],
    {
      title: "Tool Groups",
      description: "Grouped entry points for the main tool areas.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildToolGroupsResource()),
  );

  server.registerResource(
    "task-routing",
    STATIC_RESOURCE_URIS[5],
    {
      title: "Task Routing",
      description: "Map common Dynamics 365 tasks and roles to the right prompts and tools.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildTaskRoutingResource()),
  );

  server.registerResource(
    "release-checklist",
    STATIC_RESOURCE_URIS[6],
    {
      title: "Release Checklist",
      description: "A short release-readiness path for solution and environment checks.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildReleaseChecklistResource()),
  );

  server.registerResource(
    "plugin-troubleshooting",
    STATIC_RESOURCE_URIS[7],
    {
      title: "Plugin Troubleshooting",
      description: "Common plugin failure paths and the best tools to inspect them.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildPluginTroubleshootingResource()),
  );

  const completeEnvironment: CompleteResourceTemplateCallback = (value) =>
    config.environments
      .map((environment) => environment.name)
      .filter((name) => name.toLowerCase().startsWith(value.toLowerCase()));

  server.registerResource(
    "environment-starter",
    new ResourceTemplate(ENVIRONMENT_STARTER_TEMPLATE_URI, {
      list: async () => ({
        resources: config.environments.map((environment) => ({
          uri: `d365://environments/${environment.name}/starter`,
          name: `starter-${environment.name}`,
          title: `Starter For ${environment.name}`,
          description: `Quick start notes for environment ${environment.name}.`,
          mimeType: "text/markdown",
        })),
      }),
      complete: {
        environment: completeEnvironment,
      },
    }),
    {
      title: "Environment Starter",
      description: `Quick start notes per environment. Useful prompts: ${EXPECTED_PROMPT_NAMES.join(", ")}.`,
      mimeType: "text/markdown",
    },
    async (uri, variables) =>
      markdownResource(
        uri.toString(),
        buildEnvironmentStarterResource(
          config,
          getTemplateVariable(variables.environment, config.defaultEnvironment),
        ),
      ),
  );
}
