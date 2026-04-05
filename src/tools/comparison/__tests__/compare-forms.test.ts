import { describe, expect, it } from "vitest";
import { registerCompareForms } from "../compare-forms.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("compare_forms", () => {
  it("shows form xml drift", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["prod", "dev"]);
    const { client } = createRecordingClient({
      prod: {
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            uniquename: "contoso_account_main",
            formactivationstate: 1,
            isdefault: true,
            ismanaged: false,
            formxml:
              "<form><tabs><tab name='general'><columns><column><sections><section name='summary'><rows><row><cell><control id='name' datafieldname='name' /></cell></row></rows></section></sections></column></columns></tab></tabs></form>",
          },
        ],
      },
      dev: {
        systemforms: [
          {
            formid: "form-1",
            name: "Account Main",
            objecttypecode: "account",
            type: 2,
            uniquename: "contoso_account_main",
            formactivationstate: 1,
            isdefault: true,
            ismanaged: false,
            formxml:
              "<form><tabs><tab name='general'><columns><column><sections><section name='summary'><rows><row><cell><control id='name' datafieldname='name' /></cell><cell><control id='accountnumber' datafieldname='accountnumber' /></cell></row></rows></section></sections></column></columns></tab></tabs></form>",
          },
        ],
      },
    });

    registerCompareForms(server as never, config, client);
    const response = await server.getHandler("compare_forms")({
      sourceEnvironment: "prod",
      targetEnvironment: "dev",
      table: "account",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Account Main");
    expect(response.content[0].text).toContain("xmlSummary");
  });
});
