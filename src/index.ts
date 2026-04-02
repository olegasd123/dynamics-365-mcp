#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/environments.js";
import { TokenManager } from "./auth/token-manager.js";
import { DynamicsClient } from "./client/dynamics-client.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const config = loadConfig();

  const server = new McpServer({
    name: "dynamics-365-mcp",
    version: "0.1.0",
  });

  const tokenManager = new TokenManager();
  const client = new DynamicsClient(tokenManager);

  registerAllTools(server, config, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start Dynamics 365 MCP server:", error);
  process.exit(1);
});
