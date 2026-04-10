import { describe, expect, it } from "vitest";
import type { EnvironmentConfig } from "../../config/types.js";
import type { DynamicsClient } from "../../client/dynamics-client.js";
import { queryRecordsByFieldValuesInChunks, queryRecordsByIdsInChunks } from "../query-batching.js";

describe("query batching", () => {
  const env: EnvironmentConfig = {
    name: "dev",
    url: "https://dev.crm.dynamics.com",
    tenantId: "tenant",
    clientId: "client",
    clientSecret: "secret",
  };

  it("keeps all child records when matching by a parent field", async () => {
    const calls: string[] = [];
    const records = [
      { childid: "child-1", parentid: "parent-1" },
      { childid: "child-2", parentid: "parent-1" },
      { childid: "child-3", parentid: "parent-2" },
      { childid: "child-4", parentid: "parent-2" },
    ];
    const client = {
      async query<T>(_: EnvironmentConfig, __: string, queryParams?: string): Promise<T[]> {
        calls.push(String(queryParams || ""));
        const requestedIds = extractQuotedIds(queryParams);
        return records.filter((record) => requestedIds.includes(record.parentid)) as T[];
      },
    } as DynamicsClient;

    const result = await queryRecordsByFieldValuesInChunks<{ childid: string; parentid: string }>(
      env,
      client,
      "children",
      ["parent-1", "parent-2"],
      "parentid",
      buildIdsQuery,
      { chunkSize: 1 },
    );

    expect(result.map((record) => record.childid)).toEqual([
      "child-1",
      "child-2",
      "child-3",
      "child-4",
    ]);
    expect(calls).toHaveLength(2);
  });

  it("deduplicates results when matching by record id", async () => {
    const calls: string[] = [];
    const records = [
      { recordid: "id-1", name: "One" },
      { recordid: "id-1", name: "One" },
      { recordid: "id-2", name: "Two" },
      { recordid: "id-3", name: "Three" },
    ];
    const client = {
      async query<T>(_: EnvironmentConfig, __: string, queryParams?: string): Promise<T[]> {
        calls.push(String(queryParams || ""));
        const requestedIds = extractQuotedIds(queryParams);
        return records.filter((record) => requestedIds.includes(record.recordid)) as T[];
      },
    } as DynamicsClient;

    const result = await queryRecordsByIdsInChunks<{ recordid: string; name: string }>(
      env,
      client,
      "records",
      ["id-1", "id-2"],
      "recordid",
      buildIdsQuery,
      1,
    );

    expect(result).toEqual([
      { recordid: "id-1", name: "One" },
      { recordid: "id-2", name: "Two" },
    ]);
    expect(calls).toHaveLength(2);
  });
});

function buildIdsQuery(ids: string[]): string {
  return ids.map((id) => `id eq '${id}'`).join(" or ");
}

function extractQuotedIds(queryParams?: string): string[] {
  return [...String(queryParams || "").matchAll(/'([^']+)'/g)].map((match) => match[1]);
}
