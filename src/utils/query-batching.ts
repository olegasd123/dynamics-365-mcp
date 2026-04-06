import type { EnvironmentConfig } from "../config/types.js";
import type { DynamicsClient } from "../client/dynamics-client.js";

const DEFAULT_ID_CHUNK_SIZE = 40;

export function chunkValues<T>(values: T[], chunkSize = DEFAULT_ID_CHUNK_SIZE): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function queryRecordsByIdsInChunks<T extends Record<string, unknown>>(
  env: EnvironmentConfig,
  client: DynamicsClient,
  entitySet: string,
  ids: string[],
  idField: string,
  buildQuery: (chunkIds: string[]) => string,
  chunkSize = DEFAULT_ID_CHUNK_SIZE,
): Promise<T[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const idSet = new Set(uniqueIds);
  const results = await Promise.all(
    chunkValues(uniqueIds, chunkSize).map((chunk) =>
      client.query<T>(env, entitySet, buildQuery(chunk)),
    ),
  );

  const seen = new Set<string>();
  return results.flat().filter((record) => {
    const id = String(record[idField] || "");
    if (!id || !idSet.has(id) || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}
