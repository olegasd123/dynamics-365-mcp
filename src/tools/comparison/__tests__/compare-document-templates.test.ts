import { describe, expect, it } from "vitest";
import { registerCompareDocumentTemplates } from "../compare-document-templates.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_document_templates", () => {
  it("compares document template metadata by table, type, and name", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Account Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
            status: false,
            languagecode: 1033,
            description: "Prod description",
          },
        ],
      },
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-2",
            name: "Account Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
            status: true,
            languagecode: 1033,
            description: "Dev description",
          },
        ],
      },
    });

    registerCompareDocumentTemplates(server as never, config, client);

    const response = await server.getHandler("compare_document_templates")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      associatedEntityTypeCode: "account",
      documentType: "word",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("status");
    expect(response.content[0].text).toContain("description");
    expect(response.structuredContent).toMatchObject({
      data: {
        filters: {
          associatedEntityTypeCode: "account",
          documentType: "word",
          compareContent: false,
        },
        comparison: {
          differences: [
            {
              key: "account | 2 | Account Quote",
              changedFields: expect.arrayContaining([
                expect.objectContaining({ field: "status" }),
                expect.objectContaining({ field: "description" }),
              ]),
            },
          ],
        },
      },
    });
  });

  it("shows content hash drift when compareContent is enabled", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        documenttemplates: [
          {
            documenttemplateid: "template-1",
            name: "Account Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
            status: false,
            content: "prod-content",
            clientdata: "same-client-data",
          },
        ],
      },
      dev: {
        documenttemplates: [
          {
            documenttemplateid: "template-2",
            name: "Account Quote",
            associatedentitytypecode: "account",
            documenttype: 2,
            status: false,
            content: "dev-content",
            clientdata: "same-client-data",
          },
        ],
      },
    });

    registerCompareDocumentTemplates(server as never, config, client);

    const response = await server.getHandler("compare_document_templates")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      compareContent: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("contentHash");
    expect(response.structuredContent).toMatchObject({
      data: {
        filters: {
          compareContent: true,
        },
        comparison: {
          differences: [
            {
              key: "account | 2 | Account Quote",
              changedFields: [expect.objectContaining({ field: "contentHash" })],
            },
          ],
        },
      },
    });
    const diff = (
      response.structuredContent as {
        data: {
          comparison: {
            differences: Array<{
              source: Record<string, unknown>;
              target: Record<string, unknown>;
            }>;
          };
        };
      }
    ).data.comparison.differences[0];
    expect(diff.source.content).toBeUndefined();
    expect(diff.source.clientdata).toBeUndefined();
    expect(diff.target.content).toBeUndefined();
    expect(diff.target.clientdata).toBeUndefined();
  });
});
