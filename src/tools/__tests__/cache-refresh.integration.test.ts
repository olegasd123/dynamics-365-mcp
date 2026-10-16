import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { TokenManager } from "../../auth/token-manager.js";
import { DynamicsClient } from "../../client/dynamics-client.js";
import { registerAllTools } from "../index.js";
import { createTestConfig } from "./tool-test-helpers.js";

describe("tool cache refresh", () => {
  it("refreshes form and view helper reads through MCP and reuses the fresh results", async () => {
    const config = createTestConfig(["dev", "prod"]);
    let version = "old";
    const send = vi.fn(async ({ url }: { url: string }) => {
      const form = {
        formid: "00000000-0000-4000-8000-000000000001",
        name: "Main",
        objecttypecode: "account",
        type: 2,
        formxml: `<form><tabs><tab name="${version}" /></tabs></form>`,
      };
      const view = {
        savedqueryid: "00000000-0000-4000-8000-000000000002",
        name: "Active Accounts",
        returnedtypecode: "account",
        fetchxml: `<fetch><entity name="account"><attribute name="${version}" /></entity></fetch>`,
      };
      return {
        durationMs: 0,
        response: new Response(
          JSON.stringify({
            value: [url.includes("systemforms") ? form : view],
          }),
        ),
      };
    });
    const dynamicsClient = new DynamicsClient({} as TokenManager, { retryPolicy: { send } });
    const server = new McpServer({ name: "refresh-test", version: "1" });
    registerAllTools(server, config, dynamicsClient);
    const client = new Client({ name: "refresh-test-client", version: "1" });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const calls = [
        { name: "get_form_details", arguments: { environment: "dev", formName: "Main" } },
        {
          name: "get_view_fetchxml",
          arguments: { environment: "dev", viewName: "Active Accounts" },
        },
      ];
      for (const call of calls) {
        expect(JSON.stringify((await client.callTool(call)).structuredContent)).toContain("old");
      }
      send.mockClear();
      version = "new";
      for (const call of calls) {
        expect(
          JSON.stringify(
            (
              await client.callTool({
                ...call,
                arguments: { ...call.arguments, refresh: false },
              })
            ).structuredContent,
          ),
        ).toContain("old");
      }
      expect(send).not.toHaveBeenCalled();

      for (const call of calls) {
        const response = await client.callTool({
          ...call,
          arguments: { ...call.arguments, refresh: true },
        });
        expect(response.isError).not.toBe(true);
        expect(JSON.stringify(response.structuredContent)).toContain("new");
      }
      // Each detail tool refreshes its list lookup and its detail read.
      expect(send).toHaveBeenCalledTimes(4);
      send.mockClear();
      for (const call of calls) {
        expect(JSON.stringify((await client.callTool(call)).structuredContent)).toContain("new");
      }
      expect(send).not.toHaveBeenCalled();

      const comparisonCall = {
        name: "compare_forms",
        arguments: { sourceEnvironment: "dev", targetEnvironment: "prod" },
      };
      await client.callTool(comparisonCall);
      send.mockClear();
      await client.callTool(comparisonCall);
      expect(send).not.toHaveBeenCalled();
      const compared = await client.callTool({
        ...comparisonCall,
        arguments: { ...comparisonCall.arguments, refresh: true },
      });
      expect(compared.isError).not.toBe(true);
      const requestedHosts = new Set(send.mock.calls.map(([request]) => new URL(request.url).host));
      expect(requestedHosts).toEqual(new Set(["dev.crm.dynamics.com", "prod.crm.dynamics.com"]));

      const invalid = await client.callTool({
        ...calls[0],
        arguments: { ...calls[0].arguments, refresh: "true" },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });
});
