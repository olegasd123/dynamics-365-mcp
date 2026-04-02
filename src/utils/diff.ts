export interface DiffResult<T> {
  onlyInSource: T[];
  onlyInTarget: T[];
  differences: {
    key: string;
    source: T;
    target: T;
    changedFields: { field: string; sourceValue: unknown; targetValue: unknown }[];
  }[];
  matching: number;
}

export function diffCollections<T extends Record<string, unknown>>(
  source: T[],
  target: T[],
  keyFn: (item: T) => string,
  compareFields: string[]
): DiffResult<T> {
  const sourceMap = new Map<string, T>();
  const targetMap = new Map<string, T>();

  for (const item of source) {
    sourceMap.set(keyFn(item), item);
  }
  for (const item of target) {
    targetMap.set(keyFn(item), item);
  }

  const onlyInSource: T[] = [];
  const onlyInTarget: T[] = [];
  const differences: DiffResult<T>["differences"] = [];
  let matching = 0;

  for (const [key, sourceItem] of sourceMap) {
    const targetItem = targetMap.get(key);
    if (!targetItem) {
      onlyInSource.push(sourceItem);
      continue;
    }

    const changedFields: { field: string; sourceValue: unknown; targetValue: unknown }[] = [];
    for (const field of compareFields) {
      const sv = sourceItem[field];
      const tv = targetItem[field];
      if (JSON.stringify(sv) !== JSON.stringify(tv)) {
        changedFields.push({ field, sourceValue: sv, targetValue: tv });
      }
    }

    if (changedFields.length > 0) {
      differences.push({ key, source: sourceItem, target: targetItem, changedFields });
    } else {
      matching++;
    }
  }

  for (const [key, targetItem] of targetMap) {
    if (!sourceMap.has(key)) {
      onlyInTarget.push(targetItem);
    }
  }

  return { onlyInSource, onlyInTarget, differences, matching };
}
