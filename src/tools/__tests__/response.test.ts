import { describe, expect, it } from "vitest";
import {
  buildPaginatedListData,
  buildPaginatedListSummary,
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
      "Showing 2 of 5 tables. Use cursor='2' to continue. Use nameFilter to narrow the result.",
    );
  });
});
