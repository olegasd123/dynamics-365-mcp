import { describe, expect, it } from "vitest";
import { AuthenticationError } from "../../auth/token-manager.js";
import { DynamicsApiError, DynamicsRequestError } from "../../client/errors.js";
import { EnvironmentNotFoundError } from "../../config/environments.js";
import { AmbiguousMatchError } from "../tool-errors.js";
import {
  buildPaginatedListData,
  buildPaginatedListSummary,
  createToolErrorResponse,
  DEFAULT_LIST_LIMIT,
} from "../response.js";

describe("paginated list helpers", () => {
  it("builds consistent page metadata", () => {
    const page = buildPaginatedListData(
      [{ id: "1" }, { id: "2" }, { id: "3" }],
      { environment: "dev" },
      { limit: 2 },
    );

    expect(page).toMatchObject({
      environment: "dev",
      limit: 2,
      cursor: null,
      returnedCount: 2,
      totalCount: 3,
      hasMore: true,
      nextCursor: "2",
      items: [{ id: "1" }, { id: "2" }],
    });
  });

  it("uses the default limit when none is provided", () => {
    const page = buildPaginatedListData(
      Array.from({ length: DEFAULT_LIST_LIMIT + 1 }, (_, index) => ({ id: String(index + 1) })),
      { environment: "dev" },
    );

    expect(page.limit).toBe(DEFAULT_LIST_LIMIT);
    expect(page.returnedCount).toBe(DEFAULT_LIST_LIMIT);
    expect(page.hasMore).toBe(true);
  });

  it("rejects invalid cursors", () => {
    expect(() =>
      buildPaginatedListData([{ id: "1" }], { environment: "dev" }, { cursor: "next" }),
    ).toThrow("Invalid cursor 'next'");
  });

  it("builds continuation guidance for truncated pages", () => {
    const summary = buildPaginatedListSummary({
      cursor: null,
      returnedCount: 2,
      totalCount: 5,
      hasMore: true,
      nextCursor: "2",
      itemLabelSingular: "table",
      itemLabelPlural: "tables",
      narrowHint: "Use nameFilter to narrow the result.",
    });

    expect(summary).toBe(
      "Showing 2 of 5 tables. Recommended next step: ask for the next page with cursor='2' and the same filters. Use nameFilter to narrow the result.",
    );
  });
});

describe("createToolErrorResponse", () => {
  it("adds machine-readable fields for Dynamics API errors", () => {
    const response = createToolErrorResponse(
      "list_tables",
      new DynamicsApiError("prod", 429, "RateLimited", "Rate limit exceeded"),
    );

    expect(response.structuredContent).toMatchObject({
      version: "1",
      tool: "list_tables",
      ok: false,
      error: {
        name: "DynamicsApiError",
        code: "dynamics_api_error",
        environment: "prod",
        statusCode: 429,
        odataErrorCode: "RateLimited",
        retryable: true,
      },
    });
  });

  it("adds machine-readable fields for request errors", () => {
    const response = createToolErrorResponse(
      "list_tables",
      new DynamicsRequestError("dev", "timeout", "Request timed out"),
    );

    expect(response.structuredContent).toMatchObject({
      error: {
        name: "DynamicsRequestError",
        code: "dynamics_request_timeout",
        environment: "dev",
        kind: "timeout",
        retryable: true,
      },
    });
  });

  it("adds machine-readable fields for authentication errors", () => {
    const response = createToolErrorResponse(
      "list_tables",
      new AuthenticationError("test", "Bad secret", "invalid_client"),
    );

    expect(response.structuredContent).toMatchObject({
      error: {
        name: "AuthenticationError",
        code: "authentication_failed",
        environment: "test",
        errorCode: "invalid_client",
        retryable: false,
      },
    });
  });

  it("adds machine-readable fields for missing environments", () => {
    const response = createToolErrorResponse(
      "list_tables",
      new EnvironmentNotFoundError("missing", ["dev", "prod"]),
    );

    expect(response.structuredContent).toMatchObject({
      error: {
        name: "EnvironmentNotFoundError",
        code: "environment_not_found",
        environment: "missing",
        availableEnvironments: ["dev", "prod"],
        retryable: false,
      },
    });
  });

  it("adds machine-readable fields for ambiguous choices", () => {
    const response = createToolErrorResponse(
      "get_ribbon_button_details",
      new AmbiguousMatchError("Ribbon button 'add fax' is ambiguous.", {
        parameter: "location",
        options: [
          { value: "form", label: "form: form/Add Fax" },
          { value: "homepageGrid", label: "homepageGrid: homepageGrid/Add Fax" },
        ],
      }),
    );

    expect(response.structuredContent).toMatchObject({
      error: {
        name: "AmbiguousMatchError",
        code: "ambiguous_match",
        parameter: "location",
        options: [
          { value: "form", label: "form: form/Add Fax" },
          { value: "homepageGrid", label: "homepageGrid: homepageGrid/Add Fax" },
        ],
        retryable: false,
      },
    });
  });
});
