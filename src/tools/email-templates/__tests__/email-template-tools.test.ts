import { describe, expect, it } from "vitest";
import { registerGetEmailTemplateDetails } from "../get-email-template-details.js";
import { registerListEmailTemplates } from "../list-email-templates.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

const TEMPLATE_BODY = "<p>Hello {{contact.firstname}}</p>";
const TEMPLATE_XML = "<template><datafieldname name='firstname' /></template>";

describe("email template tools", () => {
  it("lists email templates with type and scope labels", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        templates: [
          {
            templateid: "template-1",
            title: "Welcome Contact",
            description: "Welcome email",
            templatetypecode: "contact",
            subject: "Welcome",
            mimetype: "text/html",
            languagecode: 1033,
            ispersonal: false,
            ismanaged: true,
            isrecommended: true,
            usedcount: 3,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListEmailTemplates(server as never, config, client);

    const response = await server.getHandler("list_email_templates")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Welcome Contact");
    expect(response.content[0].text).toContain("organization");
    expect(response.structuredContent).toMatchObject({
      data: {
        totalCount: 1,
        items: [{ title: "Welcome Contact", templatetypecode: "contact" }],
      },
    });
  });

  it("lists solution email templates without loading full solution inventory", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client, calls } = createRecordingClient({
      dev: {
        solutions: [
          {
            solutionid: "sol-1",
            friendlyname: "Contoso Core",
            uniquename: "Contoso_Core",
            version: "1.0.0.0",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
        solutioncomponents: [
          {
            solutioncomponentid: "sc-template-1",
            objectid: "template-1",
            componenttype: 36,
            rootsolutioncomponentid: "",
          },
          {
            solutioncomponentid: "sc-view-1",
            objectid: "view-1",
            componenttype: 26,
            rootsolutioncomponentid: "",
          },
        ],
        templates: [
          {
            templateid: "template-1",
            title: "Welcome Contact",
            description: "Welcome email",
            templatetypecode: "contact",
            subject: "Welcome",
            mimetype: "text/html",
            languagecode: 1033,
            ispersonal: false,
            ismanaged: true,
            usedcount: 3,
            modifiedon: "2025-01-02T00:00:00Z",
          },
        ],
      },
    });

    registerListEmailTemplates(server as never, config, client);

    const response = await server.getHandler("list_email_templates")({
      solution: "Contoso_Core",
      nameFilter: "Welcome",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Welcome Contact");
    expect(calls.map((call) => call.entitySet)).toEqual([
      "solutions",
      "solutioncomponents",
      "templates",
    ]);
  });

  it("loads one email template with content summary and hides raw content by default", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        templates: [
          {
            templateid: "template-1",
            title: "Welcome Contact",
            description: "Welcome email",
            templatetypecode: "contact",
            subject: "Welcome {{contact.firstname}}",
            mimetype: "text/html",
            languagecode: 1033,
            ispersonal: false,
            ismanaged: true,
            isrecommended: false,
            usedcount: 3,
            modifiedon: "2025-01-02T00:00:00Z",
            body: TEMPLATE_BODY,
            safehtml: TEMPLATE_BODY,
            presentationxml: TEMPLATE_XML,
            subjectsafehtml: "Welcome {{contact.firstname}}",
            subjectpresentationxml: "",
            componentstate: 0,
            versionnumber: "123",
          },
        ],
      },
    });

    registerGetEmailTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_email_template_details")({
      templateName: "Welcome Contact",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Content Summary");
    expect(response.content[0].text).toContain("contact.firstname");
    expect(response.content[0].text).not.toContain(TEMPLATE_BODY);
    expect(response.structuredContent).toMatchObject({
      data: {
        template: {
          title: "Welcome Contact",
          summary: {
            placeholders: ["contact.firstname", "firstname"],
          },
        },
      },
    });
    expect(
      (response.structuredContent as { data: { template: Record<string, unknown> } }).data.template
        .body,
    ).toBeUndefined();
  });

  it("includes raw content when requested", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        templates: [
          {
            templateid: "template-1",
            title: "Welcome Contact",
            templatetypecode: "contact",
            subject: "Welcome",
            ispersonal: false,
            body: TEMPLATE_BODY,
            safehtml: TEMPLATE_BODY,
            presentationxml: TEMPLATE_XML,
          },
        ],
      },
    });

    registerGetEmailTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_email_template_details")({
      templateName: "Welcome Contact",
      includeRawContent: true,
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(TEMPLATE_BODY);
    expect(response.structuredContent).toMatchObject({
      data: {
        template: {
          body: TEMPLATE_BODY,
          safehtml: TEMPLATE_BODY,
          presentationxml: TEMPLATE_XML,
        },
      },
    });
  });

  it("returns structured retry options when the email template name is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        templates: [
          {
            templateid: "template-1",
            title: "Welcome",
            templatetypecode: "contact",
            ispersonal: false,
          },
          {
            templateid: "template-2",
            title: "Welcome",
            templatetypecode: "account",
            ispersonal: false,
          },
        ],
      },
    });

    registerGetEmailTemplateDetails(server as never, config, client);

    const response = await server.getHandler("get_email_template_details")({
      templateName: "Welcome",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching template");
    expect(response.structuredContent).toMatchObject({
      tool: "get_email_template_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "templateName",
        options: [
          { value: "template-1", label: "contact/organization/Welcome (template-1)" },
          { value: "template-2", label: "account/organization/Welcome (template-2)" },
        ],
        retryable: false,
      },
    });
  });
});
