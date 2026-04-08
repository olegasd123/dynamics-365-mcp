import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import { formatTable } from "../../utils/formatters.js";
import {
  findMetadata,
  METADATA_COMPONENT_TYPES,
  type MetadataComponentType,
} from "./metadata-discovery.js";

export function registerFindMetadata(server: McpServer, config: AppConfig, client: DynamicsClient) {
  server.tool(
    "find_metadata",
    "Search across common Dynamics 365 metadata objects and suggest the next tool to use.",
    {
      environment: z.string().optional().describe("Environment name"),
      query: z.string().min(1).describe("Text to search for"),
      componentType: z
        .enum(METADATA_COMPONENT_TYPES)
        .optional()
        .describe("Optional metadata type filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Optional result limit"),
    },
    async ({ environment, query, componentType, limit }) => {
      try {
        const env = getEnvironment(config, environment);
        const matches = await findMetadata(env, client, {
          query,
          componentType: componentType as MetadataComponentType | undefined,
          limit,
        });

        if (matches.length === 0) {
          const text = `No metadata matches found in '${env.name}' for '${query}'.`;
          return createToolSuccessResponse("find_metadata", text, text, {
            environment: env.name,
            query,
            componentType: componentType || null,
            limit: limit || null,
            count: 0,
            items: [],
          });
        }

        const rows = matches.map((match) => [
          match.componentType,
          match.parentName ? `${match.displayName} [${match.parentName}]` : match.displayName,
          match.uniqueName || "-",
          match.solution || "-",
          match.matchReason,
          match.suggestedNextTools.join(", "),
        ]);
        const filterDesc = [
          componentType ? `componentType='${componentType}'` : "",
          `query='${query}'`,
        ]
          .filter(Boolean)
          .join(", ");

        const text = `## Metadata Matches in '${env.name}' (${filterDesc})\n\nFound ${matches.length} match(es).\n\n${formatTable(
          ["Type", "Name", "Unique / Logical", "Solution", "Match", "Next Tools"],
          rows,
        )}`;

        return createToolSuccessResponse(
          "find_metadata",
          text,
          `Found ${matches.length} metadata match(es) in '${env.name}'.`,
          {
            environment: env.name,
            query,
            componentType: componentType || null,
            limit: limit || null,
            count: matches.length,
            items: matches,
          },
        );
      } catch (error) {
        return createToolErrorResponse("find_metadata", error);
      }
    },
  );
}
