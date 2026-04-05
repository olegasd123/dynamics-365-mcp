import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
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
          return {
            content: [{ type: "text" as const, text: `No security roles found in '${env.name}'.` }],
          };
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
