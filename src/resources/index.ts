import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  ResourceTemplate,
  type CompleteResourceTemplateCallback,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import { EXPECTED_PROMPT_NAMES } from "../prompts/index.js";

export const STATIC_RESOURCE_URIS = [
  "d365://guides/getting-started",
  "d365://reference/environments",
  "d365://reference/prompts",
  "d365://reference/tool-groups",
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
    "Use this server when you need to inspect Dynamics 365 metadata, compare environments, or trace usage risk.",
    "",
    "## Configured Environments",
    environmentList,
    "",
    `Default environment: \`${config.defaultEnvironment}\``,
    "",
    "## Best First Steps",
    "- Use the `discover_metadata` prompt if you know a name but not the right tool yet.",
    "- Use the `review_solution` prompt to inspect one solution.",
    "- Use the `compare_solution` prompt to compare one solution across environments.",
    "- Read `d365://reference/tool-groups` to see the main tool areas.",
    "",
    "## Useful Entry Tools",
    "- `find_metadata` for broad discovery",
    "- `list_solutions` before a solution deep dive",
    "- `environment_health_report` for a wide environment check",
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

function buildPromptReferenceResource(): string {
  return [
    "# Built-in MCP Prompts",
    "",
    "- `discover_metadata`: start broad when you know only a name or text fragment",
    "- `review_solution`: inspect one solution and summarize risks",
    "- `compare_solution`: compare one solution between two environments",
    "- `investigate_table_change`: check usage and trigger risk before a change",
    "",
    "These prompts are conversation starters. They guide the client toward the right tool sequence.",
  ].join("\n");
}

function buildToolGroupsResource(): string {
  return [
    "# Tool Groups",
    "",
    "## Discovery",
    "- `find_metadata`",
    "",
    "## Solutions And ALM",
    "- `list_solutions`, `get_solution_details`, `get_solution_dependencies`",
    "- `list_environment_variables`, `list_connection_references`, `list_app_modules`, `list_dashboards`",
    "",
    "## Schema And UI",
    "- `list_tables`, `get_table_schema`, `list_table_columns`, `list_table_relationships`",
    "- `list_forms`, `get_form_details`, `list_views`, `get_view_details`, `get_view_fetchxml`",
    "",
    "## Automation And Runtime",
    "- `list_workflows`, `list_actions`, `list_cloud_flows`, `get_flow_details`",
    "- `list_custom_apis`, `get_custom_api_details`",
    "- `list_plugins`, `list_plugin_assemblies`, `get_plugin_details`, `get_plugin_assembly_details`",
    "",
    "## Usage And Comparison",
    "- `find_table_usage`, `find_column_usage`, `find_web_resource_usage`, `analyze_impact`",
    "- `compare_solutions`, `compare_table_schema`, `compare_views`, `compare_workflows`, `compare_plugin_assemblies`",
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
    `- \`investigate_table_change\` with environment \`${environmentName}\``,
    "",
    "## Good First Tool Calls",
    `- \`find_metadata\` in \`${environmentName}\``,
    `- \`list_solutions\` in \`${environmentName}\``,
    `- \`environment_health_report\` in \`${environmentName}\``,
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
    "environment-reference",
    STATIC_RESOURCE_URIS[1],
    {
      title: "Environment Reference",
      description: "Configured environment names and URLs.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildEnvironmentReferenceResource(config)),
  );

  server.registerResource(
    "prompt-reference",
    STATIC_RESOURCE_URIS[2],
    {
      title: "Prompt Reference",
      description: "Built-in prompt names and what they are for.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildPromptReferenceResource()),
  );

  server.registerResource(
    "tool-groups",
    STATIC_RESOURCE_URIS[3],
    {
      title: "Tool Groups",
      description: "Grouped entry points for the main tool areas.",
      mimeType: "text/markdown",
    },
    async (uri) => markdownResource(uri.toString(), buildToolGroupsResource()),
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
