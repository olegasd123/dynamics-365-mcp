import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchTableMessages } from "./table-message-metadata.js";

const listTableMessagesSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().describe("Table logical name, schema name, or display name"),
};

type ListTableMessagesParams = ToolParams<typeof listTableMessagesSchema>;

export async function handleListTableMessages(
  { environment, table }: ListTableMessagesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const result = await fetchTableMessages(env, client, table);
    const lines: string[] = [];

    lines.push(`## Table Messages: ${result.table.logicalName}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Display Name: ${result.table.displayName || "-"}`);
    lines.push(
      `- Summary: Platform SDK Messages ${result.sdkMessages.length} | Bound Custom Actions ${result.customActions.length} | Bound Custom APIs ${result.customApis.length}`,
    );

    if (result.sdkMessages.length > 0) {
      lines.push("");
      lines.push("### Platform SDK Messages");
      lines.push(
        formatTable(
          ["Message", "Custom Processing Step", "Filter Count"],
          result.sdkMessages.map((message) => [
            message.name,
            message.customProcessingStepAllowed ? "Yes" : "No",
            String(message.filterIds.length),
          ]),
        ),
      );
    }

    if (result.customActions.length > 0) {
      lines.push("");
      lines.push("### Bound Custom Actions");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "State", "Managed", "Modified"],
          result.customActions.map((action) => [
            action.name,
            action.uniquename || "-",
            action.stateLabel,
            action.ismanaged ? "Yes" : "No",
            action.modifiedon.slice(0, 10) || "-",
          ]),
        ),
      );
    }

    if (result.customApis.length > 0) {
      lines.push("");
      lines.push("### Bound Custom APIs");
      lines.push(
        formatTable(
          ["Name", "Unique Name", "Binding", "Kind", "Step Type", "Workflow Step", "State"],
          result.customApis.map((api) => [
            api.name,
            api.uniquename || "-",
            api.bindingTypeLabel,
            api.isfunction ? "Function" : "Action",
            api.allowedProcessingStepLabel,
            api.workflowsdkstepenabled ? "Yes" : "No",
            api.stateLabel,
          ]),
        ),
      );
    }

    if (
      result.sdkMessages.length === 0 &&
      result.customActions.length === 0 &&
      result.customApis.length === 0
    ) {
      lines.push("");
      lines.push(
        "No platform SDK messages, bound custom actions, or bound Custom APIs were found.",
      );
    }

    return createToolSuccessResponse(
      "list_table_messages",
      lines.join("\n"),
      `Loaded message metadata for table '${result.table.logicalName}' in '${env.name}'.`,
      {
        environment: env.name,
        table: result.table,
        counts: {
          sdkMessages: result.sdkMessages.length,
          customActions: result.customActions.length,
          customApis: result.customApis.length,
        },
        sdkMessages: result.sdkMessages,
        customActions: result.customActions,
        customApis: result.customApis,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_table_messages", error);
  }
}

export const listTableMessagesTool = defineTool({
  name: "list_table_messages",
  description:
    "List platform SDK messages plus bound custom actions and Custom APIs for one Dataverse table.",
  schema: listTableMessagesSchema,
  handler: handleListTableMessages,
});

export function registerListTableMessages(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listTableMessagesTool, { config, client });
}
