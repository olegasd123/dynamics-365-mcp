import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchEnvironmentVariableDetails } from "./alm-metadata.js";

const getEnvironmentVariableDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  variableName: z.string().describe("Environment variable schema name or display name"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type GetEnvironmentVariableDetailsParams = ToolParams<typeof getEnvironmentVariableDetailsSchema>;

export async function handleGetEnvironmentVariableDetails(
  { environment, variableName, solution }: GetEnvironmentVariableDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const variable = await fetchEnvironmentVariableDetails(env, client, variableName, solution);
    const lines: string[] = [];

    lines.push(`## Environment Variable: ${variable.schemaname}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Display Name: ${variable.displayname || "-"}`);
    lines.push(`- Type: ${variable.typeLabel}`);
    lines.push(`- Default Value: ${variable.defaultvalue || "-"}`);
    lines.push(
      `- Current Value: ${variable.hasCurrentValue ? variable.currentValue || "(empty)" : "-"}`,
    );
    lines.push(`- Effective Value: ${variable.effectiveValue || "-"}`);
    lines.push(`- Value Schema: ${variable.valueschema || "-"}`);
    lines.push(`- Managed: ${variable.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${variable.modifiedon.slice(0, 10)}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    lines.push("");
    lines.push("### Value Records");
    if (variable.values.length === 0) {
      lines.push("No current value records.");
    } else {
      lines.push(
        formatTable(
          ["Value", "Managed", "Modified"],
          variable.values.map((value) => [
            value.value || "(empty)",
            value.ismanaged ? "Yes" : "No",
            value.modifiedon.slice(0, 10),
          ]),
        ),
      );
    }

    return createToolSuccessResponse(
      "get_environment_variable_details",
      lines.join("\n"),
      `Loaded environment variable '${variable.schemaname}' in '${env.name}'.`,
      {
        environment: env.name,
        solution: solution || null,
        variable,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_environment_variable_details", error);
  }
}

export const getEnvironmentVariableDetailsTool = defineTool({
  name: "get_environment_variable_details",
  description: "Show one environment variable with default and current value details.",
  schema: getEnvironmentVariableDetailsSchema,
  handler: handleGetEnvironmentVariableDetails,
});

export function registerGetEnvironmentVariableDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getEnvironmentVariableDetailsTool, { config, client });
}
