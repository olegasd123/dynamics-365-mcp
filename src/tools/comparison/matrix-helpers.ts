import type { DiffResult } from "../../utils/diff.js";

export type MatrixStatus =
  | "same"
  | "different"
  | "only_in_baseline"
  | "only_in_target"
  | "absent";

export interface MatrixSummary {
  environment: string;
  matching: number;
  differences: number;
  onlyInBaseline: number;
  onlyInTarget: number;
}

export interface MatrixRow {
  key: string;
  statuses: Record<string, MatrixStatus>;
}

export interface MatrixDifferenceDetail {
  key: string;
  fieldsByEnvironment: Record<string, string[]>;
}

export interface MatrixSnapshot<T extends Record<string, unknown>> {
  environment: string;
  sourceItems: T[];
  targetItems: T[];
  result: DiffResult<T>;
}

export interface MatrixReport {
  summaries: MatrixSummary[];
  rows: MatrixRow[];
  differenceDetails: MatrixDifferenceDetail[];
  omittedRowCount: number;
  totalDriftRows: number;
}

interface PreparedSnapshot<T extends Record<string, unknown>> {
  environment: string;
  sourceKeys: Set<string>;
  targetKeys: Set<string>;
  differenceKeys: Set<string>;
  result: DiffResult<T>;
}

export function buildMatrixReport<T extends Record<string, unknown>>(
  snapshots: MatrixSnapshot<T>[],
  keyFn: (item: T) => string,
  maxRows: number,
): MatrixReport {
  const summaries = snapshots.map((snapshot) => ({
    environment: snapshot.environment,
    matching: snapshot.result.matching,
    differences: snapshot.result.differences.length,
    onlyInBaseline: snapshot.result.onlyInSource.length,
    onlyInTarget: snapshot.result.onlyInTarget.length,
  }));

  const preparedSnapshots = snapshots.map((snapshot) => prepareSnapshot(snapshot, keyFn));
  const allKeys = collectAllKeys(preparedSnapshots);

  const rows: MatrixRow[] = [];
  const detailsByKey = new Map<string, Record<string, string[]>>();

  for (const key of allKeys) {
    const statuses: Record<string, MatrixStatus> = {};
    let hasDrift = false;

    for (const snapshot of preparedSnapshots) {
      const status = resolveMatrixStatus(snapshot, key);
      statuses[snapshot.environment] = status;
      if (status !== "same" && status !== "absent") {
        hasDrift = true;
      }

      const diff = snapshot.result.differences.find((item) => item.key === key);
      if (diff) {
        detailsByKey.set(key, {
          ...(detailsByKey.get(key) || {}),
          [snapshot.environment]: diff.changedFields.map((field) => field.field),
        });
      }
    }

    if (hasDrift) {
      rows.push({ key, statuses });
    }
  }

  const limitedRows = rows.slice(0, maxRows);
  const limitedRowKeys = new Set(limitedRows.map((row) => row.key));
  const differenceDetails = [...detailsByKey.entries()]
    .filter(([key]) => limitedRowKeys.has(key))
    .map(([key, fieldsByEnvironment]) => ({ key, fieldsByEnvironment }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    summaries,
    rows: limitedRows,
    differenceDetails,
    omittedRowCount: Math.max(rows.length - limitedRows.length, 0),
    totalDriftRows: rows.length,
  };
}

export function formatMatrixStatus(status: MatrixStatus): string {
  switch (status) {
    case "same":
      return "same";
    case "different":
      return "diff";
    case "only_in_baseline":
      return "missing";
    case "only_in_target":
      return "extra";
    case "absent":
      return "-";
  }
}

function prepareSnapshot<T extends Record<string, unknown>>(
  snapshot: MatrixSnapshot<T>,
  keyFn: (item: T) => string,
): PreparedSnapshot<T> {
  return {
    environment: snapshot.environment,
    sourceKeys: new Set(snapshot.sourceItems.map(keyFn)),
    targetKeys: new Set(snapshot.targetItems.map(keyFn)),
    differenceKeys: new Set(snapshot.result.differences.map((item) => item.key)),
    result: snapshot.result,
  };
}

function collectAllKeys<T extends Record<string, unknown>>(snapshots: PreparedSnapshot<T>[]): string[] {
  const keys = new Set<string>();

  for (const snapshot of snapshots) {
    for (const key of snapshot.sourceKeys) {
      keys.add(key);
    }
    for (const key of snapshot.targetKeys) {
      keys.add(key);
    }
  }

  return [...keys].sort((left, right) => left.localeCompare(right));
}

function resolveMatrixStatus<T extends Record<string, unknown>>(
  snapshot: PreparedSnapshot<T>,
  key: string,
): MatrixStatus {
  if (snapshot.sourceKeys.has(key) && snapshot.targetKeys.has(key)) {
    return snapshot.differenceKeys.has(key) ? "different" : "same";
  }
  if (snapshot.sourceKeys.has(key)) {
    return "only_in_baseline";
  }
  if (snapshot.targetKeys.has(key)) {
    return "only_in_target";
  }
  return "absent";
}
