import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { FormType } from "../../queries/form-queries.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareFormsData } from "./comparison-data.js";

export function registerCompareForms(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "compare_forms",
    "Compare system forms between two environments using normalized XML summaries.",
    {
      sourceEnvironment: z.string().describe("Source environment name"),
      targetEnvironment: z.string().describe("Target environment name"),
      table: z.string().optional().describe("Optional table logical name"),
      type: z.enum(["main", "quickCreate", "card"]).optional().describe("Optional form type"),
      formName: z.string().optional().describe("Optional form name filter"),
      solution: z.string().optional().describe("Optional source solution"),
      targetSolution: z.string().optional().describe("Optional target solution"),
    },
    async ({ sourceEnvironment, targetEnvironment, table, type, formName, solution, targetSolution }) => {
      try {
        const { result } = await compareFormsData(config, client, sourceEnvironment, targetEnvironment, {
          table,
          type: type as FormType | undefined,
          formName,
          solution,
          targetSolution,
        });

        const text = formatDiffResult(result, sourceEnvironment, targetEnvironment, "name");
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    },
  );
}
