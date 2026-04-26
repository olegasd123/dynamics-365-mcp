import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type {
  DocumentTemplateStatus,
  DocumentTemplateType,
} from "../../queries/document-template-queries.js";
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
import { listDocumentTemplates } from "./document-template-metadata.js";

const listDocumentTemplatesSchema = {
  environment: z.string().optional().describe("Environment name"),
  nameFilter: z.string().optional().describe("Optional filter for document template name"),
  associatedEntityTypeCode: z
    .string()
    .optional()
    .describe("Optional associated table logical name, for example account or contact"),
  documentType: z.enum(["excel", "word"]).optional().describe("Optional document type"),
  status: z.enum(["draft", "activated"]).optional().describe("Optional template status"),
  languageCode: z.number().int().optional().describe("Optional template language code"),
  limit: LIST_LIMIT_SCHEMA,
  cursor: LIST_CURSOR_SCHEMA,
};

type ListDocumentTemplatesParams = ToolParams<typeof listDocumentTemplatesSchema>;

export async function handleListDocumentTemplates(
  {
    environment,
    nameFilter,
    associatedEntityTypeCode,
    documentType,
    status,
    languageCode,
    limit,
    cursor,
  }: ListDocumentTemplatesParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const filters = {
      nameFilter: nameFilter || null,
      associatedEntityTypeCode: associatedEntityTypeCode || null,
      documentType: documentType || null,
      status: status || null,
      languageCode: languageCode ?? null,
    };
    const templates = await listDocumentTemplates(env, client, {
      nameFilter,
      associatedEntityTypeCode,
      documentType: documentType as DocumentTemplateType | undefined,
      status: status as DocumentTemplateStatus | undefined,
      languageCode,
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
      const text = `No document templates found in '${env.name}' with the specified filters.`;
      return createToolSuccessResponse("list_document_templates", text, text, page);
    }

    const pageSummary = buildPaginatedListSummary({
      cursor: page.cursor,
      returnedCount: page.returnedCount,
      totalCount: page.totalCount,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      itemLabelSingular: "document template",
      itemLabelPlural: "document templates",
      narrowHint:
        page.hasMore && !nameFilter
          ? "Use nameFilter, associatedEntityTypeCode, documentType, status, or languageCode to narrow the result."
          : undefined,
    });
    const filterDesc = [
      nameFilter ? `filter='${nameFilter}'` : "",
      associatedEntityTypeCode ? `table='${associatedEntityTypeCode}'` : "",
      documentType ? `type='${documentType}'` : "",
      status ? `status='${status}'` : "",
      languageCode !== undefined ? `language=${languageCode}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const text = `## Document Templates in '${env.name}'${filterDesc ? ` (${filterDesc})` : ""}\n\n${pageSummary}\n\n${formatTable(
      ["Name", "Type", "Table", "Status", "Language", "Modified", "Template ID"],
      page.items.map((template) => [
        template.name,
        template.documentTypeLabel,
        template.associatedentitytypecode || "-",
        template.statusLabel,
        template.languagecode === null ? "-" : String(template.languagecode),
        String(template.modifiedon || "").slice(0, 10) || "-",
        template.documenttemplateid,
      ]),
    )}`;

    return createToolSuccessResponse("list_document_templates", text, pageSummary, page);
  } catch (error) {
    return createToolErrorResponse("list_document_templates", error);
  }
}

export const listDocumentTemplatesTool = defineTool({
  name: "list_document_templates",
  description:
    "List Dataverse document templates with document type, table, status, and language filters.",
  schema: listDocumentTemplatesSchema,
  handler: handleListDocumentTemplates,
});

export function registerListDocumentTemplates(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, listDocumentTemplatesTool, { config, client });
}
