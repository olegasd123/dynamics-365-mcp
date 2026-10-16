import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { withCacheRefresh } from "../client/cache-context.js";
import type { DynamicsClient } from "../client/dynamics-client.js";
import type { AppConfig } from "../config/types.js";
import type { ToolResponse } from "./response.js";

export type ToolSchemaShape = Record<string, z.ZodTypeAny>;
export type ToolParams<TSchema extends ToolSchemaShape> = z.infer<z.ZodObject<TSchema>> & {
  refresh?: boolean;
};
type ToolHandler<TSchema extends ToolSchemaShape> = {
  bivarianceHack: (
    params: ToolParams<TSchema>,
    context: ToolContext,
  ) => Promise<ToolResponse<object>>;
}["bivarianceHack"];

export interface ToolContext {
  config: AppConfig;
  client: DynamicsClient;
}

export interface ToolBindingDefinition<TSchema extends ToolSchemaShape = ToolSchemaShape> {
  name: string;
  description: string;
  schema: TSchema;
  handler: ToolHandler<TSchema>;
}

export function defineTool<TSchema extends ToolSchemaShape>(
  definition: ToolBindingDefinition<TSchema>,
): ToolBindingDefinition<TSchema> {
  return {
    ...definition,
    schema: {
      ...definition.schema,
      refresh: z
        .boolean()
        .optional()
        .describe(
          "Set to true to fetch fresh data for every read in this call and update the cache. Defaults to false.",
        ),
    },
    handler: (params, context) =>
      withCacheRefresh(params.refresh === true, () => definition.handler(params, context)),
  };
}

export function registerTool<TSchema extends ToolSchemaShape>(
  server: McpServer,
  tool: ToolBindingDefinition<TSchema>,
  context: ToolContext,
): void {
  const bindTool = server.tool.bind(server) as unknown as (
    name: string,
    description: string,
    schema: TSchema,
    handler: (params: ToolParams<TSchema>) => Promise<ToolResponse<object>>,
  ) => void;

  bindTool(tool.name, tool.description, tool.schema, (params) => tool.handler(params, context));
}
