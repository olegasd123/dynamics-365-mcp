import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";
import { TOOL_MANIFEST } from "./manifest.js";

export function registerAllTools(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
): void {
  for (const tool of TOOL_MANIFEST) {
    tool.register(server, config, client);
  }
}
