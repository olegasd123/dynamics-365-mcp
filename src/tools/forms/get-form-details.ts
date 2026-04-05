import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../../config/types.js";
import { getEnvironment } from "../../config/environments.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import type { FormType } from "../../queries/form-queries.js";
import { formatTable } from "../../utils/formatters.js";
import { fetchFormDetails } from "./form-metadata.js";

const STATE_LABELS: Record<number, string> = {
  0: "Inactive",
  1: "Active",
};

export function registerGetFormDetails(
  server: McpServer,
  config: AppConfig,
  client: DynamicsClient,
) {
  server.tool(
    "get_form_details",
    "Show one form with a normalized XML summary.",
    {
      environment: z.string().optional().describe("Environment name"),
      formName: z.string().describe("Form display name or unique name"),
      table: z.string().optional().describe("Optional table logical name"),
      type: z.enum(["main", "quickCreate", "card"]).optional().describe("Optional form type"),
      solution: z.string().optional().describe("Optional solution display name or unique name"),
    },
    async ({ environment, formName, table, type, solution }) => {
      try {
        const env = getEnvironment(config, environment);
        const form = await fetchFormDetails(env, client, formName, {
          table,
          type: type as FormType | undefined,
          solution,
        });

        const lines: string[] = [];
        lines.push(`## Form: ${form.name}`);
        lines.push(`- Environment: ${env.name}`);
        lines.push(`- Table: ${form.objecttypecode}`);
        lines.push(`- Type: ${form.typeLabel}`);
        lines.push(`- Unique Name: ${form.uniquename || "-"}`);
        lines.push(`- Default: ${form.isdefault ? "Yes" : "No"}`);
        lines.push(`- State: ${STATE_LABELS[form.formactivationstate] || form.formactivationstate}`);
        lines.push(`- Managed: ${form.ismanaged ? "Yes" : "No"}`);
        lines.push(`- Published: ${String(form.publishedon || "").slice(0, 10)}`);
        lines.push(`- Modified: ${String(form.modifiedon || "").slice(0, 10)}`);
        lines.push(`- Solution Filter: ${solution || "-"}`);

        if (form.description) {
          lines.push(`- Description: ${form.description}`);
        }

        lines.push("");
        lines.push("### XML Summary");
        lines.push(
          formatTable(
            ["Area", "Values"],
            [
              ["Tabs", form.summary.tabs.join(", ") || "-"],
              ["Sections", form.summary.sections.join(", ") || "-"],
              ["Controls", form.summary.controls.join(", ") || "-"],
              ["Libraries", form.summary.libraries.join(", ") || "-"],
              ["Handlers", String(form.summary.handlerCount)],
              ["Summary Hash", form.summary.hash],
            ],
          ),
        );

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [
            { type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` },
          ],
          isError: true,
        };
      }
    },
  );
}
