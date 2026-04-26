export function formatDuplicateRuleConditions(rule: {
  conditions: Array<{
    baseAttributeName: string;
    matchingAttributeName: string;
    operatorLabel: string;
    operatorParam: number | null;
  }>;
}): string {
  return (
    rule.conditions
      .map((condition) => {
        const parameter = condition.operatorParam === null ? "" : ` ${condition.operatorParam}`;
        return `${condition.baseAttributeName}->${condition.matchingAttributeName} (${condition.operatorLabel}${parameter})`;
      })
      .join("; ") || "-"
  );
}

export function getDuplicateRuleMatchedAttributes(
  rule: { conditions: Array<{ baseAttributeName: string }> },
  attributes: string[],
): string[] {
  const attributeSet = new Set(attributes.map((attribute) => attribute.toLowerCase()));
  return rule.conditions
    .map((condition) => condition.baseAttributeName.toLowerCase())
    .filter((attribute) => attributeSet.has(attribute));
}
