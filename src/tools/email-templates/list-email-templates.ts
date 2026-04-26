import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { EmailTemplateScope } from "../../queries/email-template-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import {
  LIST_CURSOR_SCHEMA,
  LIST_LIMIT_SCHEMA,
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  createToolSuccessResponse,
} from "../response.js";
import { listEmailTemplates } from "./email-template-metadata.js";

const listEmailTemplatesSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z.string().optional().describe("Optional filter for email template title"),
  templateTypeCode: z
    .string()
    .optional()
    .describe("Optional template type table logical name, for example account or contact"),
  scope: z.enum(["personal", "organization", "all"]).optional().describe("Email template scope"),
  languageCode: z.number().int().optional().describe("Optional template language code"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListEmailTemplatesParams = ToolParams<typeof listEmailTemplatesSchema>;

export async function handleListEmailTemplates(
  {
    environment,
    nameFilter,
    templateTypeCode,
    scope,
    languageCode,
    solution,
    limit,
    cursor,
  }: ListEmailTemplatesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const filters = {
      nameFilter: nameFilter || null,
      templateTypeCode: templateTypeCode || null,
      scope: scope || "all",
      languageCode: languageCode ?? null,
      solution: solution || null,
    };
    const templates = await listEmailTemplates(env, client, {
      nameFilter,
      templateTypeCode,
      scope: scope as EmailTemplateScope | undefined,
      languageCode,
      solution,
    });
    const page = buildPaginatedListData(
      templates,
      { environment: env.name, filters },
      {
        limit,
        cursor,
      },
    );

    if (page.totalCount === 0) {
      const text = `No email templates found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_email_templates", text, text, page);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "email template",
      itemLabelPlural: "email templates",
      narrowHint:
        page.hasMore && !nameFilter
          ? "Use nameFilter, templateTypeCode, languageCode, scope, or solution to narrow the result."
          : undefined,
    });
    const filterDesc = [
      nameFilter ? `filter='${nameFilter}'` : "",
      templateTypeCode ? `type='${templateTypeCode}'` : "",
      scope ? `scope='${scope}'` : "",
      languageCode !== undefined ? `language=${languageCode}` : "",
      solution ? `solution='${solution}'` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Email Templates in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(
      ["Title", "Type", "Scope", "Language", "Managed", "Used", "Modified", "Template ID"],
      page.items.map((template) => [
        template.title,
        template.templatetypecode || "-",
        template.scope,
        template.languagecode === null ? "-" : String(template.languagecode),
        template.ismanaged ? "Yes" : "No",
        template.usedcount === null ? "-" : String(template.usedcount),
        String(template.modifiedon || "").slice(0, 10) || "-",
        template.templateid,
      ]),
    )}`;

    return createToolSuccessResponse("list_email_templates", text, pageSummary, page);
  } catch (error) {
    return createToolErrorResponse("list_email_templates", error);
  }
}

export const listEmailTemplatesTool = defineTool({
  name: "list_email_templates",
  description: "List Dataverse email templates with type, scope, language, and solution filters.",
  schema: listEmailTemplatesSchema,
  handler: handleListEmailTemplates,
});

export function registerListEmailTemplates(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listEmailTemplatesTool, { config, client });
}
