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
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  fetchDocumentTemplateDetails,
  toDocumentTemplateResponseDetails,
} from "./document-template-metadata.js";

const getDocumentTemplateDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  templateName: z.string().describe("Document template name or document template id"),
  associatedEntityTypeCode: z
    .string()
    .optional()
    .describe("Optional associated table logical name, for example account or contact"),
  documentType: z.enum(["excel", "word"]).optional().describe("Optional document type"),
  status: z.enum(["draft", "activated"]).optional().describe("Optional template status"),
  languageCode: z.number().int().optional().describe("Optional template language code"),
  includeContent: z
    .boolean()
    .optional()
    .describe("Include base64 content and client data in the structured response."),
};

type GetDocumentTemplateDetailsParams = ToolParams<typeof getDocumentTemplateDetailsSchema>;

export async function handleGetDocumentTemplateDetails(
  {
    environment,
    templateName,
    associatedEntityTypeCode,
    documentType,
    status,
    languageCode,
    includeContent,
  }: GetDocumentTemplateDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const template = await fetchDocumentTemplateDetails(env, client, templateName, {
      associatedEntityTypeCode,
      documentType: documentType as DocumentTemplateType | undefined,
      status: status as DocumentTemplateStatus | undefined,
      languageCode,
    });

    const lines: string[] = [];
    lines.push(`## Document Template: ${template.name}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Type: ${template.documentTypeLabel}`);
    lines.push(`- Table: ${template.associatedentitytypecode || "-"}`);
    lines.push(`- Status: ${template.statusLabel}`);
    lines.push(`- Language: ${template.languagecode === null ? "-" : template.languagecode}`);
    lines.push(`- Created By: ${template.createdByName || "-"}`);
    lines.push(`- Modified By: ${template.modifiedByName || "-"}`);
    lines.push(`- Created: ${String(template.createdon || "").slice(0, 10) || "-"}`);
    lines.push(`- Modified: ${String(template.modifiedon || "").slice(0, 10) || "-"}`);
    lines.push(`- Version Number: ${template.versionnumber || "-"}`);

    if (template.description) {
      lines.push(`- Description: ${template.description}`);
    }

    lines.push("");
    lines.push("### Content Summary");
    lines.push(
      formatTable(
        ["Area", "Value"],
        [
          ["Content Length", String(template.summary.contentLength)],
          ["Content Size Bytes", String(template.summary.contentSizeBytes)],
          ["Content Hash", template.summary.contentHash],
          ["Client Data Length", String(template.summary.clientDataLength)],
          ["Client Data Hash", template.summary.clientDataHash],
        ],
      ),
    );

    if (includeContent) {
      lines.push("");
      lines.push("Raw base64 content is included in the structured response.");
    }

    return createToolSuccessResponse(
      "get_document_template_details",
      lines.join("\n"),
      `Loaded document template '${template.name}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          associatedEntityTypeCode: associatedEntityTypeCode || null,
          documentType: documentType || null,
          status: status || null,
          languageCode: languageCode ?? null,
          includeContent: Boolean(includeContent),
        },
        template: toDocumentTemplateResponseDetails(template, includeContent),
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_document_template_details", error);
  }
}

export const getDocumentTemplateDetailsTool = defineTool({
  name: "get_document_template_details",
  description:
    "Show one document template with metadata, content hashes, and optional base64 content.",
  schema: getDocumentTemplateDetailsSchema,
  handler: handleGetDocumentTemplateDetails,
});

export function registerGetDocumentTemplateDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getDocumentTemplateDetailsTool, { config, client });
}
