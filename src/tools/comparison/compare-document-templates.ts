import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { registerTool } from "../tool-definition.js";
import type {
  DocumentTemplateStatus,
  DocumentTemplateType,
} from "../../queries/document-template-queries.js";
import { compareDocumentTemplatesData } from "./comparison-data.js";
import { createComparisonTool } from "./comparison-tool-factory.js";

const compareDocumentTemplatesSchema = {
  sourceEnvironment: z.string().describe("Source environment name"),
  targetEnvironment: z.string().describe("Target environment name"),
  nameFilter: z.string().optional().describe("Filter by document template name"),
  associatedEntityTypeCode: z
    .string()
    .optional()
    .describe("Filter by associated table logical name, for example account or contact"),
  documentType: z.enum(["excel", "word"]).optional().describe("Filter by document type"),
  status: z.enum(["draft", "activated"]).optional().describe("Filter by template status"),
  languageCode: z.number().int().optional().describe("Filter by template language code"),
  compareContent: z
    .boolean()
    .optional()
    .describe("Compare content and client data hashes. Default: false"),
};

export const compareDocumentTemplatesTool = createComparisonTool({
  name: "compare_document_templates",
  description:
    "Compare Dataverse document templates between two environments with optional content hash comparison.",
  schema: compareDocumentTemplatesSchema,
  comparisonLabel: "document templates",
  nameField: "name",
  getSourceEnvironment: (params) => params.sourceEnvironment,
  getTargetEnvironment: (params) => params.targetEnvironment,
  compare: (params, { config, client }) =>
    compareDocumentTemplatesData(
      config,
      client,
      params.sourceEnvironment,
      params.targetEnvironment,
      {
        nameFilter: params.nameFilter,
        associatedEntityTypeCode: params.associatedEntityTypeCode,
        documentType: params.documentType as DocumentTemplateType | undefined,
        status: params.status as DocumentTemplateStatus | undefined,
        languageCode: params.languageCode,
        compareContent: params.compareContent,
      },
    ),
  buildData: ({ params, comparison, sourceEnvironment, targetEnvironment }) => ({
    sourceEnvironment,
    targetEnvironment,
    filters: {
      nameFilter: params.nameFilter || null,
      associatedEntityTypeCode: params.associatedEntityTypeCode || null,
      documentType: params.documentType || null,
      status: params.status || null,
      languageCode: params.languageCode ?? null,
      compareContent: params.compareContent || false,
    },
    comparison: comparison.result,
  }),
});

export const handleCompareDocumentTemplates = compareDocumentTemplatesTool.handler;

export function registerCompareDocumentTemplates(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, compareDocumentTemplatesTool, { config, client });
}
