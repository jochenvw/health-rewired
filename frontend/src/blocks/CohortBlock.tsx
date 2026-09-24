import type { UIItem } from '../api';
import type { BlockProps } from './registry';

/**
 * Cohort-explorer summary: eligible / ineligible / unknown patient counts, each item traceable to
 * its record. The agent (live or deterministic) is free to phrase labels; we recognise the status
 * word wherever it appears rather than assuming an exact format.
 */
function classify(item: UIItem): 'eligible' | 'ineligible' | 'unknown' | undefined {
  const text = `${item.label} ${item.detail ?? ''}`.toLowerCase();
  if (text.includes('ineligible')) return 'ineligible';
  if (text.includes('unknown')) return 'unknown';
  if (text.includes('eligible')) return 'eligible';
  return undefined;
}

export function CohortBlock({ block }: BlockProps) {
  const counts = { eligible: 0, ineligible: 0, unknown: 0 } as Record<string, number>;
  for (const item of block.items) {
    const status = classify(item);
    if (status) counts[status] += 1;
  }

  return (
    <div className="block-body">
      {block.body && <p className="prose">{block.body}</p>}
      <div className="cohort-stats">
        <div className="cohort-stat" data-status="eligible">
          <strong>{counts.eligible}</strong>
          <span>Eligible</span>
        </div>
        <div className="cohort-stat" data-status="ineligible">
          <strong>{counts.ineligible}</strong>
          <span>Ineligible</span>
        </div>
        <div className="cohort-stat" data-status="unknown">
          <strong>{counts.unknown}</strong>
          <span>Unknown</span>
        </div>
      </div>
      <ul className="evidence">
        {block.items.map((item, index) => (
          <li key={index} data-severity={item.severity ?? (classify(item) === 'unknown' ? 'warning' : undefined)}>
            <strong>{item.label}</strong>
            {item.detail && <p>{item.detail}</p>}
            {item.source && <span className="source">Source: {item.source}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
