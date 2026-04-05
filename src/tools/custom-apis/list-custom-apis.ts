import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { formatTable } from "../../utils/formatters.js";
import { listCustomApis } from "./custom-api-metadata.js";

export function registerListCustomApis(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_custom_apis",
    "List Dataverse Custom APIs with binding and execution settings.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional name or unique name filter"),
    },
    async ({ environment, nameFilter }) => {
      try {
        const env = getEnvironment(config, environment);
        const apis = await listCustomApis(env, client, nameFilter);

        if (apis.length === 0) {
          return {
            content: [
              { type: "text" as const, text: `No custom APIs found in '${env.name}'.` },
            ],
          };
        }

        const rows = apis.map((api) => [
          api.name,
          api.uniquename,
          api.bindingTypeLabel,
          api.boundentitylogicalname || "-",
          api.isfunction ? "Function" : "Action",
          api.allowedProcessingStepLabel,
          api.workflowsdkstepenabled ? "Yes" : "No",
          api.stateLabel,
        ]);

        const text = `## Custom APIs in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\nFound ${apis.length} custom API(s).\n\n${formatTable(
          [
            "Name",
            "Unique Name",
            "Binding",
            "Bound Entity",
            "Kind",
            "Step Type",
            "Workflow Step",
            "State",
          ],
          rows,
        )}`;

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
