import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchRolePrivileges } from "./role-metadata.js";

const getRolePrivilegesSchema = {
  environment: z.string().optional().describe("Environment name"),
  roleName: z.string().describe("Security role name or role id"),
  businessUnit: z
    .string()
    .optional()
    .describe(
      "Optional business unit name or id. If missing, use the default global business unit.",
    ),
};

type GetRolePrivilegesParams = ToolParams<typeof getRolePrivilegesSchema>;

export async function handleGetRolePrivileges(
  { environment, roleName, businessUnit }: GetRolePrivilegesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const details = await fetchRolePrivileges(env, client, roleName, businessUnit);
    const lines: string[] = [];

    lines.push(`## Security Role: ${details.role.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Business Unit: ${details.role.businessUnitName || "-"}`);
    lines.push(`- Managed: ${details.role.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Modified: ${String(details.role.modifiedon || "").slice(0, 10)}`);
    lines.push(`- Privileges: ${details.privileges.length}`);
    lines.push("");
    lines.push(
      formatTable(
        ["Privilege", "Access Right", "Depth", "Filter Id", "Managed"],
        details.privileges.map((privilege) => [
          privilege.privilegeName,
          privilege.accessRightLabel || "-",
          privilege.depthDisplay || "-",
          privilege.recordfilterid || "-",
          privilege.ismanaged ? "Yes" : "No",
        ]),
      ),
    );

    return createToolSuccessResponse(
      "get_role_privileges",
      lines.join("\n"),
      `Loaded privileges for role '${details.role.name}' in '${env.name}'.`,
      {
        environment: env.name,
        businessUnit: details.role.businessUnitName || null,
        role: details.role,
        privilegeCount: details.privileges.length,
        privileges: details.privileges,
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_role_privileges", error);
  }
}

export const getRolePrivilegesTool = defineTool({
  name: "get_role_privileges",
  description: "Show privileges for one security role.",
  schema: getRolePrivilegesSchema,
  handler: handleGetRolePrivileges,
});

export function registerGetRolePrivileges(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getRolePrivilegesTool, { config, client });
}
