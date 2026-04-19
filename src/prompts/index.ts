import { z } from "zod";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";

export const PROMPT_REFERENCE_ITEMS = [
  {
    name: "analyze_environment_drift",
    summary: "compare one baseline with many environments and drill into the riskiest drift",
  },
  {
    name: "compare_solution",
    summary: "compare one solution between two environments",
  },
  {
    name: "discover_metadata",
    summary: "start broad when you know only a name or text fragment",
  },
  {
    name: "investigate_plugin_failure",
    summary: "inspect one plugin or assembly and trace the failing steps or images",
  },
  {
    name: "investigate_table_change",
    summary: "check usage and trigger risk before a table or column change",
  },
  {
    name: "release_gate_check",
    summary: "run a fast release-readiness pass for one environment or solution",
  },
  {
    name: "review_security_role",
    summary: "find the right security role record and inspect its privileges",
  },
  {
    name: "review_solution",
    summary: "inspect one solution and summarize the next checks",
  },
  {
    name: "trace_flow_dependency",
    summary: "inspect one cloud flow and follow its dependency path",
  },
] as const;

export const EXPECTED_PROMPT_NAMES = PROMPT_REFERENCE_ITEMS.map((item) => item.name);

const METADATA_COMPONENT_TYPES = [
  "table",
  "column",
  "form",
  "view",
  "workflow",
  "cloud_flow",
  "custom_api",
  "plugin",
  "plugin_assembly",
  "web_resource",
  "solution",
  "security_role",
  "environment_variable",
  "connection_reference",
  "app_module",
  "dashboard",
] as const;

const MATRIX_COMPONENT_TYPES = ["all", "plugins", "workflows", "web_resources"] as const;

function environmentArgument(config: AppConfig, description: string) {
  const names = config.environments.map((environment) => environment.name);
  return completable(z.string().min(1).describe(description), (value) =>
    names.filter((name) => name.toLowerCase().startsWith(value.toLowerCase())),
  );
}

function compareEnvironmentArgument(config: AppConfig, description: string) {
  return environmentArgument(config, description);
}

export function registerAllPrompts(server: McpServer, config: AppConfig): void {
  server.registerPrompt(
    "discover_metadata",
    {
      title: "Discover Metadata",
      description: "Find metadata in one environment and move to the right detail tool.",
      argsSchema: {
        environment: environmentArgument(config, "Environment name like dev or prod"),
        query: z.string().min(2).describe("Search text like account, sync, or contoso"),
        componentType: z
          .enum(METADATA_COMPONENT_TYPES)
          .optional()
          .describe("Optional component type to narrow the search"),
      },
    },
    ({ environment, query, componentType }) => ({
      description: `Discover metadata in '${environment}' for '${query}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Help me find Dynamics 365 metadata in environment "${environment}" that matches "${query}".`,
              componentType
                ? `Start with \`find_metadata\` and limit it to component type "${componentType}".`
                : "Start with `find_metadata` without a component type filter unless the first result set is too broad.",
              "After the first search, call the best follow-up detail or list tool for the strongest match.",
              "Keep the answer short and explain why the chosen follow-up tool fits the match.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review_solution",
    {
      title: "Review Solution",
      description: "Inspect one solution, summarize it, and point to the next checks.",
      argsSchema: {
        environment: environmentArgument(config, "Environment that contains the solution"),
        solution: z.string().min(1).describe("Solution display name or unique name"),
        focus: z
          .string()
          .optional()
          .describe("Optional focus like dependencies, plugins, flows, or tables"),
      },
    },
    ({ environment, solution, focus }) => ({
      description: `Review solution '${solution}' in '${environment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Review the Dynamics 365 solution "${solution}" in environment "${environment}".`,
              "Use `get_solution_details` first.",
              focus
                ? `Keep extra attention on ${focus}.`
                : "If the result shows dependency risk or missing context, use `get_solution_dependencies` next.",
              "Summarize version, managed state, publisher, key component groups, and the main risks or follow-up checks.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compare_solution",
    {
      title: "Compare Solution",
      description: "Compare one solution across two environments.",
      argsSchema: {
        sourceEnvironment: compareEnvironmentArgument(config, "Source environment name like dev"),
        targetEnvironment: compareEnvironmentArgument(
          config,
          "Target environment name like test or prod",
        ),
        solution: z.string().min(1).describe("Solution display name or unique name"),
      },
    },
    ({ sourceEnvironment, targetEnvironment, solution }) => ({
      description: `Compare solution '${solution}' between '${sourceEnvironment}' and '${targetEnvironment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Compare the Dynamics 365 solution "${solution}" between "${sourceEnvironment}" and "${targetEnvironment}".`,
              "Start with `compare_solutions`.",
              "If there are important differences, recommend the next compare tool to inspect the risky area in more detail.",
              "Keep the report short and put the highest-risk differences first.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "investigate_plugin_failure",
    {
      title: "Investigate Plugin Failure",
      description: "Inspect one plugin or assembly and narrow the likely failure path.",
      argsSchema: {
        environment: environmentArgument(config, "Environment where the plugin failure happens"),
        pluginName: z.string().optional().describe("Optional plugin class name or full type name"),
        assemblyName: z.string().optional().describe("Optional plugin assembly name"),
        symptom: z
          .string()
          .optional()
          .describe("Short symptom like step does not fire or image data is empty"),
      },
    },
    ({ environment, pluginName, assemblyName, symptom }) => {
      const firstTool =
        assemblyName && !pluginName ? "get_plugin_assembly_details" : "get_plugin_details";
      const followUpTool =
        assemblyName && !pluginName ? "list_plugin_assembly_images" : "list_plugin_steps";

      return {
        description: `Investigate plugin failure in '${environment}'.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                pluginName
                  ? `Investigate why plugin class "${pluginName}" is failing in environment "${environment}".`
                  : `Investigate why plugin assembly "${assemblyName || "unknown assembly"}" is failing in environment "${environment}".`,
                assemblyName ? `Keep the scope on assembly "${assemblyName}".` : "",
                symptom ? `Current symptom: ${symptom}.` : "",
                `Start with \`${firstTool}\`.`,
                `Then use \`${followUpTool}\` to narrow the failing step or image path.`,
                "If the metadata looks correct but the failure still happens, check recent runtime errors with `list_plugin_trace_logs`.",
                "Summarize the likely failure point, the affected message and entity, and the next manual check if the metadata alone is not enough.",
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "investigate_table_change",
    {
      title: "Investigate Table Change",
      description: "Check usage and trigger risk before changing a table or column.",
      argsSchema: {
        environment: environmentArgument(config, "Environment where the change will happen"),
        table: z.string().min(1).describe("Table logical name like account"),
        column: z.string().optional().describe("Optional column logical name like name"),
      },
    },
    ({ environment, table, column }) => ({
      description: `Investigate change impact for '${table}' in '${environment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              column
                ? `Investigate the impact of changing column "${column}" on table "${table}" in environment "${environment}".`
                : `Investigate the impact of changing table "${table}" in environment "${environment}".`,
              column
                ? "Use `find_column_usage` first, then use `analyze_update_triggers` if update risk matters."
                : "Use `find_table_usage` first, then use `analyze_create_triggers` or `analyze_update_triggers` if trigger risk matters.",
              "Summarize direct usage, trigger risk, and the best next tool if more detail is needed.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "release_gate_check",
    {
      title: "Release Gate Check",
      description: "Run a fast release-readiness pass for one environment or solution.",
      argsSchema: {
        environment: environmentArgument(
          config,
          "Environment that is about to receive or ship a release",
        ),
        solution: z.string().optional().describe("Optional solution display name or unique name"),
        compareWith: z
          .string()
          .optional()
          .describe("Optional second environment for drift or release comparison"),
      },
    },
    ({ environment, solution, compareWith }) => ({
      description: `Run a release gate check for '${environment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              solution
                ? `Run a release gate check for solution "${solution}" in environment "${environment}".`
                : `Run a release gate check for environment "${environment}".`,
              "Start with `release_gate_report`.",
              compareWith
                ? `Then use \`compare_solutions\` to compare the release scope with "${compareWith}".`
                : "Then use `get_solution_dependencies` when the first pass shows dependency or missing-component risk.",
              "Summarize blockers first, then warnings, then the next tool to use if a blocker needs deeper review.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "review_security_role",
    {
      title: "Review Security Role",
      description: "Find the right security role record and inspect its privileges.",
      argsSchema: {
        environment: environmentArgument(config, "Environment that contains the role"),
        roleName: z.string().min(1).describe("Security role name"),
        businessUnit: z
          .string()
          .optional()
          .describe("Optional business unit. If missing, use the default global business unit."),
      },
    },
    ({ environment, roleName, businessUnit }) => ({
      description: `Review security role '${roleName}' in '${environment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Review the security role "${roleName}" in environment "${environment}".`,
              businessUnit
                ? `Limit the role to business unit "${businessUnit}".`
                : "If business unit is not provided, use the default global business unit.",
              "Start with `list_security_roles` to confirm the right role record.",
              "Then use `get_role_privileges` for the selected role.",
              "Summarize the main access level risks and call out any ambiguity if many matching roles exist.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "analyze_environment_drift",
    {
      title: "Analyze Environment Drift",
      description: "Compare one baseline with many environments and drill into the riskiest drift.",
      argsSchema: {
        baselineEnvironment: compareEnvironmentArgument(
          config,
          "Baseline environment name like prod",
        ),
        targetEnvironments: z
          .string()
          .min(1)
          .describe("Comma-separated target environments like dev, test"),
        componentType: z
          .enum(MATRIX_COMPONENT_TYPES)
          .optional()
          .describe("Optional drift area. Default: all"),
      },
    },
    ({ baselineEnvironment, targetEnvironments, componentType }) => {
      const followUpTool =
        componentType === "plugins"
          ? "compare_plugin_assemblies"
          : componentType === "workflows"
            ? "compare_workflows"
            : "compare_web_resources";

      return {
        description: `Analyze environment drift from '${baselineEnvironment}'.`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Analyze drift from baseline environment "${baselineEnvironment}" to target environments "${targetEnvironments}".`,
                `Start with \`compare_environment_matrix\`${
                  componentType && componentType !== "all"
                    ? ` and limit it to component type "${componentType}".`
                    : "."
                }`,
                `Then use \`${followUpTool}\` on the highest-risk row from the matrix.`,
                "Summarize where drift is highest and explain why the chosen deep check is the best next step.",
              ].join("\n"),
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "trace_flow_dependency",
    {
      title: "Trace Flow Dependency",
      description: "Inspect one cloud flow and follow its dependency path.",
      argsSchema: {
        environment: environmentArgument(config, "Environment that contains the cloud flow"),
        flowName: z.string().min(1).describe("Cloud flow display name or unique name"),
        solution: z.string().optional().describe("Optional solution display name or unique name"),
      },
    },
    ({ environment, flowName, solution }) => ({
      description: `Trace cloud flow '${flowName}' in '${environment}'.`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Trace dependencies for cloud flow "${flowName}" in environment "${environment}".`,
              solution ? `Keep the scope on solution "${solution}".` : "",
              "Start with `get_flow_details`.",
              solution
                ? "Then use `get_solution_dependencies` to check how the flow depends on other solution components."
                : "Then use `list_connection_references` if the flow summary shows connection references that may be broken or missing.",
              "Summarize triggers, actions, connections, and the main dependency risk in a short report.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    }),
  );
}
