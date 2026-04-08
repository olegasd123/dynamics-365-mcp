import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchCustomApiDetails } from "./custom-api-metadata.js";

export function registerGetCustomApiDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_custom_api_details",
    "Show one Custom API with request and response metadata.",
    {
      environment: z.string().optional().describe("Environment name"),
      apiName: z.string().describe("Custom API display name or unique name"),
    },
    async ({ environment, apiName }) => {
      try {
        const env = getEnvironment(config, environment);
        const details = await fetchCustomApiDetails(env, client, apiName);
        const lines: string[] = [];

        lines.push(`## Custom API: ${details.api.name}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Unique Name: ${details.api.uniquename}`);
        lines.push(`- Display Name: ${details.api.displayname || "-"}`);
        lines.push(`- Binding: ${details.api.bindingTypeLabel}`);
        lines.push(`- Bound Entity: ${details.api.boundentitylogicalname || "-"}`);
        lines.push(`- Kind: ${details.api.isfunction ? "Function" : "Action"}`);
        lines.push(`- Private: ${details.api.isprivate ? "Yes" : "No"}`);
        lines.push(`- Allowed Step Type: ${details.api.allowedProcessingStepLabel}`);
        lines.push(`- Workflow Step Enabled: ${details.api.workflowsdkstepenabled ? "Yes" : "No"}`);
        lines.push(`- Execute Privilege: ${details.api.executeprivilegename || "-"}`);
        lines.push(`- Managed: ${details.api.ismanaged ? "Yes" : "No"}`);
        lines.push(`- State: ${details.api.stateLabel}`);
        lines.push(`- Plugin Type Id: ${details.api.plugintypeid || "-"}`);
        lines.push(`- SDK Message Id: ${details.api.sdkmessageid || "-"}`);
        lines.push(`- Power Fx Rule Id: ${details.api.powerfxruleid || "-"}`);
        lines.push(`- Modified: ${String(details.api.modifiedon || "").slice(0, 10)}`);

        if (details.api.description) {
          lines.push(`- Description: ${details.api.description}`);
        }

        lines.push("");
        lines.push("### Request Parameters");
        if (details.requestParameters.length === 0) {
          lines.push("No request parameters.");
        } else {
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Type", "Optional", "Entity", "State"],
              details.requestParameters.map((parameter) => [
                parameter.name,
                parameter.uniquename || "-",
                parameter.typeLabel,
                parameter.isoptional ? "Yes" : "No",
                parameter.logicalentityname || "-",
                parameter.stateLabel,
              ]),
            ),
          );
        }

        lines.push("");
        lines.push("### Response Properties");
        if (details.responseProperties.length === 0) {
          lines.push("No response properties.");
        } else {
          lines.push(
            formatTable(
              ["Name", "Unique Name", "Type", "Entity", "State"],
              details.responseProperties.map((property) => [
                property.name,
                property.uniquename || "-",
                property.typeLabel,
                property.logicalentityname || "-",
                property.stateLabel,
              ]),
            ),
          );
        }

        return createToolSuccessResponse(
          "get_custom_api_details",
          lines.join("\n"),
          `Loaded custom API '${details.api.name}' in '${env.name}'.`,
          {
            environment: env.name,
            api: details.api,
            requestParameters: details.requestParameters,
            responseProperties: details.responseProperties,
          },
        );
      } catch (error) {
        return createToolErrorResponse("get_custom_api_details", error);
      }
    },
  );
}
