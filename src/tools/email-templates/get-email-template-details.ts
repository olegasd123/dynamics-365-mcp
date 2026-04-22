import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { EmailTemplateScope } from "../../queries/email-template-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { defineTool, registerTool, type ToolContext, type ToolParams } from "../tool-definition.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  fetchEmailTemplateDetails,
  toEmailTemplateResponseDetails,
} from "./email-template-metadata.js";

const COMPONENT_STATE_LABELS: Record<number, string> = {
  0: "Published",
  1: "Unpublished",
  2: "Deleted",
  3: "Deleted Unpublished",
};

const getEmailTemplateDetailsSchema = {
  environment: z.string().optional().describe("Environment name"),
  templateName: z.string().describe("Email template title or template id"),
  templateTypeCode: z
    .string()
    .optional()
    .describe("Optional template type table logical name, for example account or contact"),
  scope: z.enum(["personal", "organization", "all"]).optional().describe("Email template scope"),
  languageCode: z.number().int().optional().describe("Optional template language code"),
  solution: z.string().optional().describe("Optional solution display name or unique name"),
  includeRawContent: z
    .boolean()
    .optional()
    .describe("Include body, safe HTML, and presentation XML in the text and structured response."),
};

type GetEmailTemplateDetailsParams = ToolParams<typeof getEmailTemplateDetailsSchema>;

export async function handleGetEmailTemplateDetails(
  {
    environment,
    templateName,
    templateTypeCode,
    scope,
    languageCode,
    solution,
    includeRawContent,
  }: GetEmailTemplateDetailsParams,
  { config, client }: ToolContext,
) {
  try {
    const env = getEnvironment(config, environment);
    const template = await fetchEmailTemplateDetails(env, client, templateName, {
      templateTypeCode,
      scope: scope as EmailTemplateScope | undefined,
      languageCode,
      solution,
    });

    const lines: string[] = [];
    lines.push(`## Email Template: ${template.title}`);
    lines.push(`- Environment: ${env.name}`);
    lines.push(`- Type: ${template.templatetypecode || "-"}`);
    lines.push(`- Scope: ${template.scope}`);
    lines.push(`- Language: ${template.languagecode === null ? "-" : template.languagecode}`);
    lines.push(`- MIME Type: ${template.mimetype || "-"}`);
    lines.push(`- Managed: ${template.ismanaged ? "Yes" : "No"}`);
    lines.push(`- Recommended: ${template.isrecommended ? "Yes" : "No"}`);
    lines.push(`- Used Count: ${template.usedcount === null ? "-" : template.usedcount}`);
    lines.push(
      `- Component State: ${
        template.componentstate === null
          ? "-"
          : COMPONENT_STATE_LABELS[template.componentstate] || template.componentstate
      }`,
    );
    lines.push(`- Owner: ${template.ownerName || "-"}`);
    lines.push(`- Modified: ${String(template.modifiedon || "").slice(0, 10) || "-"}`);
    lines.push(`- Solution Filter: ${solution || "-"}`);

    if (template.description) {
      lines.push(`- Description: ${template.description}`);
    }

    lines.push("");
    lines.push("### Content Summary");
    lines.push(
      formatTable(
        ["Area", "Value"],
        [
          ["Subject", template.subject || "-"],
          ["Subject Length", String(template.summary.subjectLength)],
          ["Body Length", String(template.summary.bodyLength)],
          ["Safe HTML Length", String(template.summary.safeHtmlLength)],
          ["Presentation XML Length", String(template.summary.presentationXmlLength)],
          ["Subject Safe HTML Length", String(template.summary.subjectSafeHtmlLength)],
          ["Subject XML Length", String(template.summary.subjectPresentationXmlLength)],
          ["Placeholders", template.summary.placeholders.join(", ") || "-"],
          ["Body Hash", template.summary.bodyHash],
          ["Safe HTML Hash", template.summary.safeHtmlHash],
          ["Presentation XML Hash", template.summary.presentationXmlHash],
        ],
      ),
    );

    if (includeRawContent) {
      lines.push("");
      lines.push("### Body");
      lines.push("");
      lines.push("```html");
      lines.push(template.body);
      lines.push("```");
      lines.push("");
      lines.push("### Safe HTML");
      lines.push("");
      lines.push("```html");
      lines.push(template.safehtml);
      lines.push("```");
      lines.push("");
      lines.push("### Presentation XML");
      lines.push("");
      lines.push("```xml");
      lines.push(template.presentationxml);
      lines.push("```");
      lines.push("");
      lines.push("### Subject Presentation XML");
      lines.push("");
      lines.push("```xml");
      lines.push(template.subjectpresentationxml);
      lines.push("```");
    }

    return createToolSuccessResponse(
      "get_email_template_details",
      lines.join("\n"),
      `Loaded email template '${template.title}' in '${env.name}'.`,
      {
        environment: env.name,
        filters: {
          templateTypeCode: templateTypeCode || null,
          scope: scope || null,
          languageCode: languageCode ?? null,
          solution: solution || null,
          includeRawContent: Boolean(includeRawContent),
        },
        template: toEmailTemplateResponseDetails(template, includeRawContent),
      },
    );
  } catch (error) {
    return createToolErrorResponse("get_email_template_details", error);
  }
}

export const getEmailTemplateDetailsTool = defineTool({
  name: "get_email_template_details",
  description:
    "Show one email template with subject, content hashes, placeholders, and optional raw content.",
  schema: getEmailTemplateDetailsSchema,
  handler: handleGetEmailTemplateDetails,
});

export function registerGetEmailTemplateDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  registerTool(server, getEmailTemplateDetailsTool, { config, client });
}
