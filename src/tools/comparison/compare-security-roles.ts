import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { diffCollections } from "../../utils/diff.js";
import { formatNamedDiffSection } from "./diff-section.js";
import { fetchRolePrivilegesForComparison } from "../security/role-metadata.js";

const compareSecurityRolesSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  roleName: z.string().describe("Security role name or role id"),
  sourceBusinessUnit: z
    .string()
    .optional()
    .describe(
      "Optional source business unit name. If missing, use the default global business unit.",
    ),
  targetBusinessUnit: z
    .string()
    .optional()
    .describe(
      "Optional target business unit name. If missing, use the default global business unit.",
    ),
};

type CompareSecurityRolesParams = ToolParams<typeof compareSecurityRolesSchema>;

export async function handleCompareSecurityRoles(
  {
    sourceEnvironment,
    targetEnvironment,
    roleName,
    sourceBusinessUnit,
    targetBusinessUnit,
  }: CompareSecurityRolesParams,
  { config, client }: ToolContext,
) {
  try {
    const sourceEnv = getEnvironment(config, sourceEnvironment);
    const targetEnv = getEnvironment(config, targetEnvironment);
    const [sourceRole, targetRole] = await Promise.all([
      fetchRolePrivilegesForComparison(sourceEnv, client, roleName, sourceBusinessUnit),
      fetchRolePrivilegesForComparison(targetEnv, client, roleName, targetBusinessUnit),
    ]);

    const roleDiff = diffCollections([sourceRole.role], [targetRole.role], (role) => role.name, [
      "businessUnitName",
      "ismanaged",
    ]);
    const privilegeDiff = diffCollections(
      sourceRole.privileges,
      targetRole.privileges,
      (privilege) => privilege.privilegeName,
      ["accessRightLabel", "depthDisplay", "recordfilterid"],
    );

    const lines: string[] = [];
    const warnings = [...sourceRole.warnings, ...targetRole.warnings];
    if (warnings.length > 0) {
      lines.push(...warnings.map((warning) => `Warning: ${warning}`), "");
    }
    lines.push("## Security Role Comparison");
    lines.push(
      `- Source: ${sourceEnvironment} :: ${sourceRole.role.name} [${sourceRole.role.businessUnitName}]`,
    );
    lines.push(
      `- Target: ${targetEnvironment} :: ${targetRole.role.name} [${targetRole.role.businessUnitName}]`,
    );
    lines.push("");
    lines.push(
      formatNamedDiffSection({
        title: "Role",
        result: roleDiff,
        sourceLabel: sourceEnvironment,
        targetLabel: targetEnvironment,
        nameField: "name",
      }),
    );
    lines.push("");
    lines.push(
      formatNamedDiffSection({
        title: "Privileges",
        result: privilegeDiff,
        sourceLabel: sourceEnvironment,
        targetLabel: targetEnvironment,
        nameField: "privilegeName",
      }),
    );

    return createToolSuccessResponse(
      "compare_security_roles",
      lines.join("\n"),
      `Compared security role '${roleName}' between '${sourceEnvironment}' and '${targetEnvironment}'.`,
      {
        sourceEnvironment,
        targetEnvironment,
        roleName,
        warnings,
        sourceBusinessUnit: sourceRole.role.businessUnitName || null,
        targetBusinessUnit: targetRole.role.businessUnitName || null,
        roleComparison: roleDiff,
        privilegeComparison: privilegeDiff,
      },
    );
  } catch (error) {
    return createToolErrorResponse("compare_security_roles", error);
  }
}

export const compareSecurityRolesTool = defineTool({
  name: "compare_security_roles",
  description: "Compare one security role between two environments.",
  schema: compareSecurityRolesSchema,
  handler: handleCompareSecurityRoles,
});

export function registerCompareSecurityRoles(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareSecurityRolesTool, { config, client });
}
