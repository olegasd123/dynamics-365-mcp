import type { EnvironmentConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";

const DEFAULT_QUERY_CHUNK_SIZE = 25;

export function chunkValues<T>(values: T[], chunkSize = DEFAULT_QUERY_CHUNK_SIZE): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function queryRecordsByFieldValuesInChunks<T extends Record<string, unknown>>(
  env: EnvironmentConfig,
  client: DynamicsClient,
  entitySet: string,
  values: string[],
  matchField: string,
  buildQuery: (chunkIds: string[]) => string,
  options?: {
    chunkSize?: number;
    uniqueField?: string;
  },
): Promise<T[]> {
  const uniqueValues = [...new Set(values.filter(Boolean))];
  if (uniqueValues.length === 0) {
    return [];
  }

  const valueSet = new Set(uniqueValues);
  const results = await Promise.all(
    chunkValues(uniqueValues, options?.chunkSize).map((chunk) =>
      client.query<T>(env, entitySet, buildQuery(chunk)),
    ),
  );

  const filtered = results.flat().filter((record) => {
    const value = String(record[matchField] || "");
    return Boolean(value) && valueSet.has(value);
  });

  if (!options?.uniqueField) {
    return filtered;
  }

  const seen = new Set<string>();
  return filtered.filter((record) => {
    const uniqueValue = String(record[options.uniqueField as string] || "");
    if (!uniqueValue || seen.has(uniqueValue)) {
      return false;
    }

    seen.add(uniqueValue);
    return true;
  });
}

export async function queryRecordsByIdsInChunks<T extends Record<string, unknown>>(
  env: EnvironmentConfig,
  client: DynamicsClient,
  entitySet: string,
  ids: string[],
  idField: string,
  buildQuery: (chunkIds: string[]) => string,
  chunkSize = DEFAULT_QUERY_CHUNK_SIZE,
): Promise<T[]> {
  return queryRecordsByFieldValuesInChunks(env, client, entitySet, ids, idField, buildQuery, {
    chunkSize,
    uniqueField: idField,
  });
}
