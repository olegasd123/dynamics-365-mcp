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
import { AmbiguousMatchError } from "../tool-errors.js";

const compareSecurityRolesSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  roleName: z.string().describe("Security role name or role id"),
  sourceRoleName: z
    .string()
    .optional()
    .describe("Optional source role name or role id override. Defaults to roleName."),
  targetRoleName: z
    .string()
    .optional()
    .describe("Optional target role name or role id override. Defaults to roleName."),
  sourceBusinessUnit: z
    .string()
    .optional()
    .describe(
      "Optional source business unit name or id. If missing, use the default global business unit.",
    ),
  targetBusinessUnit: z
    .string()
    .optional()
    .describe(
      "Optional target business unit name or id. If missing, use the default global business unit.",
    ),
};

type CompareSecurityRolesParams = ToolParams<typeof compareSecurityRolesSchema>;

export async function handleCompareSecurityRoles(
  {
    sourceEnvironment,
    targetEnvironment,
    roleName,
    sourceRoleName,
    targetRoleName,
    sourceBusinessUnit,
    targetBusinessUnit,
  }: CompareSecurityRolesParams,
  { config, client }: ToolContext,
) {
  try {
    const sourceEnv = getEnvironment(config, sourceEnvironment);
    const targetEnv = getEnvironment(config, targetEnvironment);
    const sourceRoleRef = sourceRoleName || roleName;
    const targetRoleRef = targetRoleName || roleName;
    const sourceRole = await fetchComparisonRolePrivileges({
      env: sourceEnv,
      client,
      roleRef: sourceRoleRef,
      businessUnit: sourceBusinessUnit,
      roleParameter: "sourceRoleName",
      businessUnitParameter: "sourceBusinessUnit",
    });
    const targetRole = await fetchComparisonRolePrivileges({
      env: targetEnv,
      client,
      roleRef: targetRoleRef,
      businessUnit: targetBusinessUnit,
      roleParameter: "targetRoleName",
      businessUnitParameter: "targetBusinessUnit",
    });

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
        sourceRoleName: sourceRoleRef,
        targetRoleName: targetRoleRef,
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

async function fetchComparisonRolePrivileges(params: {
  env: AppConfig["environments"][number];
  client: DynamicsClient;
  roleRef: string;
  businessUnit?: string;
  roleParameter: "sourceRoleName" | "targetRoleName";
  businessUnitParameter: "sourceBusinessUnit" | "targetBusinessUnit";
}) {
  const { env, client, roleRef, businessUnit, roleParameter, businessUnitParameter } = params;

  try {
    return await fetchRolePrivilegesForComparison(env, client, roleRef, businessUnit);
  } catch (error) {
    throw remapComparisonError(error, { roleParameter, businessUnitParameter });
  }
}

function remapComparisonError(
  error: unknown,
  parameters: {
    roleParameter: "sourceRoleName" | "targetRoleName";
    businessUnitParameter: "sourceBusinessUnit" | "targetBusinessUnit";
  },
): unknown {
  if (!(error instanceof AmbiguousMatchError)) {
    return error;
  }

  const parameter =
    error.parameter === "businessUnitName"
      ? parameters.businessUnitParameter
      : error.parameter === "roleName"
        ? parameters.roleParameter
        : error.parameter;

  return new AmbiguousMatchError(error.message, {
    parameter,
    options: error.options,
  });
}
