import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { FormType } from "../../queries/form-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { compareFormsData } from "./comparison-data.js";

export function registerCompareForms(server: McpServer, config: AppConfig, client: DynamicsClient) {
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
    async ({
      sourceEnvironment,
      targetEnvironment,
      table,
      type,
      formName,
      solution,
      targetSolution,
    }) => {
      try {
        const {
          result,
          warnings = [],
          sourceCandidateCount,
          targetCandidateCount,
          truncated,
        } = await compareFormsData(config, client, sourceEnvironment, targetEnvironment, {
          table,
          type: type as FormType | undefined,
          formName,
          solution,
          targetSolution,
        });

        const lines: string[] = [];
        if (warnings.length > 0) {
          lines.push(...warnings.map((warning) => `Warning: ${warning}`), "");
        }
        lines.push(formatDiffResult(result, sourceEnvironment, targetEnvironment, "name"));
        const text = lines.join("\n");
        return createToolSuccessResponse(
          "compare_forms",
          text,
          `Compared forms between '${sourceEnvironment}' and '${targetEnvironment}'.`,
          {
            sourceEnvironment,
            targetEnvironment,
            filters: {
              table: table || null,
              type: type || null,
              formName: formName || null,
              solution: solution || null,
              targetSolution: targetSolution || null,
            },
            warnings,
            sourceCandidateCount:
              sourceCandidateCount ?? result.onlyInSource.length + result.differences.length,
            targetCandidateCount:
              targetCandidateCount ?? result.onlyInTarget.length + result.differences.length,
            truncated: truncated || false,
            comparison: result,
          },
        );
      } catch (error) {
        return createToolErrorResponse("compare_forms", error);
      }
    },
  );
}
