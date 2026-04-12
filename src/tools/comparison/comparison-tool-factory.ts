import type { DiffResult } from "../../utils/diff.js";
import { formatDiffResult } from "../../utils/formatters.js";
import { createToolErrorResponse, createToolSuccessResponse } from "../response.js";
import {
  defineTool,
  type ToolBindingDefinition,
  type ToolContext,
  type ToolParams,
  type ToolSchemaShape,
} from "../tool-definition.js";

interface ComparisonResultLike {
  result: DiffResult<Record<string, unknown>>;
}

interface ComparisonToolArgs<
  TSchema extends ToolSchemaShape,
  TComparison extends ComparisonResultLike,
> {
  params: ToolParams<TSchema>;
  context: ToolContext;
  comparison: TComparison;
  sourceEnvironment: string;
  targetEnvironment: string;
}

interface CreateComparisonToolOptions<
  TSchema extends ToolSchemaShape,
  TComparison extends ComparisonResultLike,
  TResponseData extends object,
> {
  name: string;
  description: string;
  schema: TSchema;
  comparisonLabel: string;
  nameField?: string;
  getSourceEnvironment: (params: ToolParams<TSchema>) => string;
  getTargetEnvironment: (params: ToolParams<TSchema>) => string;
  compare: (params: ToolParams<TSchema>, context: ToolContext) => Promise<TComparison>;
  prepareComparison?: (args: ComparisonToolArgs<TSchema, TComparison>) => void | Promise<void>;
  formatText?: (args: ComparisonToolArgs<TSchema, TComparison>) => string;
  buildSummary?: (args: ComparisonToolArgs<TSchema, TComparison>) => string;
  buildData: (args: ComparisonToolArgs<TSchema, TComparison>) => TResponseData;
}

export function createComparisonTool<
  TSchema extends ToolSchemaShape,
  TComparison extends ComparisonResultLike,
  TResponseData extends object,
>(
  options: CreateComparisonToolOptions<TSchema, TComparison, TResponseData>,
): ToolBindingDefinition<TSchema> {
  const handler: ToolBindingDefinition<TSchema>["handler"] = async (params, context) => {
    try {
      const sourceEnvironment = options.getSourceEnvironment(params);
      const targetEnvironment = options.getTargetEnvironment(params);
      const comparison = await options.compare(params, context);
      const args = {
        params,
        context,
        comparison,
        sourceEnvironment,
        targetEnvironment,
      };

      await options.prepareComparison?.(args);

      const text =
        options.formatText?.(args) ||
        formatDiffResult(
          comparison.result,
          sourceEnvironment,
          targetEnvironment,
          options.nameField || "name",
        );
      const summary =
        options.buildSummary?.(args) ||
        `Compared ${options.comparisonLabel} between '${sourceEnvironment}' and '${targetEnvironment}'.`;

      return createToolSuccessResponse(options.name, text, summary, options.buildData(args));
    } catch (error) {
      return createToolErrorResponse(options.name, error);
    }
  };

  return defineTool({
    name: options.name,
    description: options.description,
    schema: options.schema,
    handler,
  });
}
