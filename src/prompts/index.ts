import { z } from "zod";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";

export const EXPECTED_PROMPT_NAMES = [
  "compare_solution",
  "discover_metadata",
  "investigate_table_change",
  "review_solution",
] as const;

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
}
