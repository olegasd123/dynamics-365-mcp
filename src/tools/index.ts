import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";
import { getRegisteredToolManifest } from "./manifest.js";
import { registerTool } from "./tool-definition.js";

export function registerAllTools(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
): void {
  for (const tool of getRegisteredToolManifest(config)) {
    registerTool(server, tool as never, { config, client });
  }
}
