import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import type { FormType } from "../../queries/form-queries.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import { listForms } from "./form-metadata.js";

const STATE_LABELS: Record<number, string> = {
  0: "Inactive",
  1: "Active",
};

const listFormsSchema = {
  environment: z.string().optional().describe("Environment name"),
  table: z.string().optional().describe("Optional table logical name"),
  type: z.enum(["main", "quickCreate", "card"]).optional().describe("Form type filter"),
  nameFilter: z.string().optional().describe("Optional form name filter"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
};

type ListFormsParams = ToolParams<typeof listFormsSchema>;

export async function handleListForms(
  { environment, table, type, nameFilter, solution }: ListFormsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const forms = await listForms(env, client, {
      table,
      type: type as FormType | undefined,
      nameFilter,
      solution,
    });

    if (forms.length === 0) {
      const text = `No forms found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_forms", text, text, {
        environment: env.name,
        filters: {
          table: table || null,
          type: type || null,
          nameFilter: nameFilter || null,
          solution: solution || null,
        },
        count: 0,
        items: [],
      });
    }

    const rows = forms.map((form) => [
      form.objecttypecode,
      form.typeLabel,
      form.name,
      form.uniquename || "-",
      form.isdefault ? "Yes" : "No",
      STATE_LABELS[form.formactivationstate] || String(form.formactivationstate),
      form.ismanaged ? "Yes" : "No",
      String(form.modifiedon || "").slice(0, 10),
    ]);

    const filterDesc = [
      table ? `table='${table}'` : "",
      type ? `type='${type}'` : "",
      nameFilter ? `filter='${nameFilter}'` : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Forms in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\nFound ${forms.length} form(s).\n\n${formatTable(
      ["Table", "Type", "Name", "Unique Name", "Default", "State", "Managed", "Modified"],
      rows,
    )}`;
    return createToolSuccessResponse(
      "list_forms",
      text,
      `Found ${forms.length} form(s) in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          table: table || null,
          type: type || null,
          nameFilter: nameFilter || null,
          solution: solution || null,
        },
        count: forms.length,
        items: forms,
      },
    );
  } catch (error) {
    return createToolErrorResponse("list_forms", error);
  }
}

export const listFormsTool = defineTool({
  name: "list_forms",
  description: "List model-driven app forms. Supports main, quick create, and card forms.",
  schema: listFormsSchema,
  handler: handleListForms,
});

export function registerListForms(server: McpServer, config: AppConfig, client: DynamicsClient) {
  registerTool(server, listFormsTool, { config, client });
}
