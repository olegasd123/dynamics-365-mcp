import { describe, expect, it } from "vitest";
import { registerGetDocumentTemplateDetails } from "../get-document-template-details.js";
import { registerListDocumentTemplates } from "../list-document-templates.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const TEMPLATE_CONTENT = Buffer.from("template bytes").toString("base64");
const CLIENT_DATA = "<client><table>account</table></client>";

describe("document template tools", () => {
  it("lists document templates with type and status labels", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Account Quote",
            description: "Quote document",
            associatedentitytypecode: "account",
            documenttype: 2,
            languagecode: 1033,
            status: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListDocumentTemplates(server as never, config, client);

    const response = await server.getHandler("list_document_templates")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Account Quote");
    expect(response.content[0].text).toContain("Word");
    expect(response.content[0].text).toContain("Activated");
    expect(response.structuredContent).toMatchObject({
      data: {
        totalCount: 1,
        items: [
          {
            name: "Account Quote",
            documentTypeLabel: "Word",
            statusLabel: "Activated",
          },
        ],
      },
    });
  });

  it("loads one document template with content summary and hides raw content by default", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Account Quote",
            description: "Quote document",
            associatedentitytypecode: "account",
            documenttype: 2,
            languagecode: 1033,
            status: false,
            modifiedon: "2025-01-02T00:00:00Z",
            clientdata: CLIENT_DATA,
            content: TEMPLATE_CONTENT,
            versionnumber: "123",
          },
        ],
      },
    });

    registerGetDocumentTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_document_template_details")({
      templateName: "Account Quote",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Content Summary");
    expect(response.content[0].text).toContain("Content Hash");
    expect(response.content[0].text).not.toContain(TEMPLATE_CONTENT);
    expect(response.structuredContent).toMatchObject({
      data: {
        template: {
          name: "Account Quote",
          documentTypeLabel: "Word",
          summary: {
            contentLength: TEMPLATE_CONTENT.length,
            contentSizeBytes: 14,
            clientDataLength: CLIENT_DATA.length,
          },
        },
      },
    });
    expect(
      (response.structuredContent as { data: { template: Record<string, unknown> } }).data.template
        .content,
    ).toBeUndefined();
  });

  it("includes raw base64 content when requested", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Account Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
            status: true,
            clientdata: CLIENT_DATA,
            content: TEMPLATE_CONTENT,
          },
        ],
      },
    });

    registerGetDocumentTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_document_template_details")({
      templateName: "Account Quote",
      includeContent: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("structured response");
    expect(response.structuredContent).toMatchObject({
      data: {
        template: {
          clientdata: CLIENT_DATA,
          content: TEMPLATE_CONTENT,
        },
      },
    });
  });

  it("returns structured retry options when the document template name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
          },
          {
            documenttemplateid: "template-2",
            name: "Quote",
            associatedentitytypecode: "contact",
            documenttype: 1,
          },
        ],
      },
    });

    registerGetDocumentTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_document_template_details")({
      templateName: "Quote",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching template");
    expect(response.structuredContent).toMatchObject({
      tool: "get_document_template_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "templateName",
        options: [
          { value: "template-1", label: "Word/account/Quote (template-1)" },
          { value: "template-2", label: "Excel/contact/Quote (template-2)" },
        ],
        retryable: false,
      },
    });
  });
});
