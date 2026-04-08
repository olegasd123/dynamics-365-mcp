import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listSecurityRoles } from "./role-metadata.js";

export function registerListSecurityRoles(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "list_security_roles",
    "List security roles with business unit context.",
    {
      environment: z.string().optional().describe("Environment name"),
      nameFilter: z.string().optional().describe("Optional role name filter"),
    },
    async ({ environment, nameFilter }) => {
      try {
        const env = getEnvironment(config, environment);
        const roles = await listSecurityRoles(env, client, nameFilter);

        if (roles.length === 0) {
          const text = `No security roles found in '${env.name}'.`;
          return createToolSuccessResponse("list_security_roles", text, text, {
            environment: env.name,
            nameFilter: nameFilter || null,
            count: 0,
            items: [],
          });
        }

        const text = `## Security Roles in '${env.name}'${nameFilter ? ` (filter='${nameFilter}')` : ""}\n\nFound ${roles.length} role(s).\n\n${formatTable(
          ["Name", "Business Unit", "Managed", "Modified"],
          roles.map((role) => [
            role.name,
            role.businessUnitName || "-",
            role.ismanaged ? "Yes" : "No",
            String(role.modifiedon || "").slice(0, 10),
          ]),
        )}`;

        return createToolSuccessResponse(
          "list_security_roles",
          text,
          `Found ${roles.length} security role(s) in '${env.name}'.`,
          {
            environment: env.name,
            nameFilter: nameFilter || null,
            count: roles.length,
            items: roles,
          },
        );
      } catch (error) {
        return createToolErrorResponse("list_security_roles", error);
      }
    },
  );
}
