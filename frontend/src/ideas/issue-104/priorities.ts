export const criteria = [
  { key: 'quality', label: 'Limit treatment-related fatigue' },
  { key: 'survivalFit', label: 'Reduce the chance of cancer returning' },
  { key: 'mobility', label: 'Avoid treatment-related side effects' },
] as const;

export type Criterion = typeof criteria[number]['key'];
export type Priorities = Record<Criterion, number>;
export const initialPriorities: Priorities = { quality: 4, survivalFit: 3, mobility: 3 };
export const avoidanceControls = [
  { key: 'hairLoss', label: 'Avoid hair loss' },
  { key: 'nausea', label: 'Avoid nausea and vomiting' },
  { key: 'handFoot', label: 'Avoid hand–foot syndrome' },
] as const;
export type Avoidance = typeof avoidanceControls[number]['key'];

export function preferenceScores(weights: Priorities, optionScores: readonly Priorities[], avoided: readonly Avoidance[] = [],
  avoidanceFits: readonly Record<Avoidance, number>[] = []): number[] {
  return optionScores.map((option, i) => {
    const base = criteria.reduce((sum, item) => sum + weights[item.key] * option[item.key], 0);
    const extra = avoided.reduce((sum, key) => sum + avoidanceFits[i][key], 0);
    return Math.round((base + extra) * 10 / (10 + avoided.length));
  });
}

export function rebalancePriorities(current: Priorities, changed: Criterion, value: number): Priorities {
  const nextValue = Math.max(0, Math.min(10, Math.round(value)));
  const [first, second] = criteria.map((item) => item.key).filter((key) => key !== changed);
  const remaining = 10 - nextValue;
  const previousTotal = current[first] + current[second];
  const firstValue = Math.round(remaining * (previousTotal ? current[first] / previousTotal : 0.5));
  return { ...current, [changed]: nextValue, [first]: firstValue, [second]: remaining - firstValue };
}
