import { describe, expect, it } from "vitest";
import { registerGetConnectionReferenceDetails } from "../get-connection-reference-details.js";
import { registerListConnectionReferences } from "../list-connection-references.js";
import {
  FakeServer,
  createRecordingClient,
  createTestConfig,
} from "../../__tests__/tool-test-helpers.js";

describe("connection reference tools", () => {
  it("lists connection references with connection status", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_sharedoffice365",
            connectionreferencedisplayname: "Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
      },
    });

    registerListConnectionReferences(server as never, config, client);

    const response = await server.getHandler("list_connection_references")({});

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Missing Connection");
    expect(response.structuredContent).toMatchObject({
      tool: "list_connection_references",
      ok: true,
      data: {
        count: 1,
      },
    });
  });

  it("loads one connection reference with derived connector fields", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_sharedoffice365",
            connectionreferencedisplayname: "Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "shared-office-1",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
      },
    });

    registerGetConnectionReferenceDetails(server as never, config, client);

    const response = await server.getHandler("get_connection_reference_details")({
      referenceName: "Office 365",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("Connector: shared_office365");
    expect(response.content[0].text).toContain("Connection Status: Connected");
    expect(response.structuredContent).toMatchObject({
      data: {
        reference: {
          connectionStatus: "Connected",
          connectorName: "shared_office365",
        },
      },
    });
  });

  it("returns structured retry options when the connection reference is ambiguous", async () => {
    const server = new FakeServer();
    const config = createTestConfig(["dev"]);
    const { client } = createRecordingClient({
      dev: {
        connectionreferences: [
          {
            connectionreferenceid: "conn-1",
            connectionreferencelogicalname: "contoso_sharedoffice365_a",
            connectionreferencedisplayname: "Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
          {
            connectionreferenceid: "conn-2",
            connectionreferencelogicalname: "contoso_sharedoffice365_b",
            connectionreferencedisplayname: "Office 365",
            connectorid: "/providers/Microsoft.PowerApps/apis/shared_office365",
            connectionid: "",
            ismanaged: false,
            modifiedon: "2025-01-02T00:00:00Z",
            statecode: 0,
          },
        ],
      },
    });

    registerGetConnectionReferenceDetails(server as never, config, client);

    const response = await server.getHandler("get_connection_reference_details")({
      referenceName: "Office 365",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain("Choose a matching connection reference");
    expect(response.structuredContent).toMatchObject({
      tool: "get_connection_reference_details",
      ok: false,
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "referenceName",
        options: [
          {
            value: "contoso_sharedoffice365_a",
            label: "Office 365 (contoso_sharedoffice365_a)",
          },
          {
            value: "contoso_sharedoffice365_b",
            label: "Office 365 (contoso_sharedoffice365_b)",
          },
        ],
        retryable: false,
      },
    });
  });
});
