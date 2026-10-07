export const criteria = [
  { key: 'quality', label: 'Everyday quality of life' },
  { key: 'survivalFit', label: 'Possible survival benefit' },
  { key: 'mobility', label: 'Keep walking' },
] as const;

export type Criterion = typeof criteria[number]['key'];
export type Priorities = Record<Criterion, number>;
export const initialPriorities: Priorities = { quality: 4, survivalFit: 3, mobility: 3 };

export function rebalancePriorities(current: Priorities, changed: Criterion, value: number): Priorities {
  const nextValue = Math.max(0, Math.min(10, Math.round(value)));
  const [first, second] = criteria.map((item) => item.key).filter((key) => key !== changed);
  const remaining = 10 - nextValue;
  const previousTotal = current[first] + current[second];
  const firstValue = Math.round(remaining * (previousTotal ? current[first] / previousTotal : 0.5));
  return { ...current, [changed]: nextValue, [first]: firstValue, [second]: remaining - firstValue };
}
