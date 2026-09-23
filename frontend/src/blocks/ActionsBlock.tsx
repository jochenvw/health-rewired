import { useState } from 'react';
import type { BlockProps } from './registry';

type Decision = 'approved' | 'dismissed' | undefined;

/** Human-in-the-loop: every proposed action needs an explicit human decision. */
export function ActionsBlock({ block }: BlockProps) {
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const decide = (index: number, decision: Decision) =>
    setDecisions((current) => ({ ...current, [index]: current[index] === decision ? undefined : decision }));

  return (
    <div className="block-body">
      {block.body && <p className="prose">{block.body}</p>}
      <ul className="actions">
        {block.items.map((item, index) => (
          <li key={index} data-decision={decisions[index]}>
            <div>
              <strong>{item.label}</strong>
              {item.detail && <p>{item.detail}</p>}
            </div>
            <div className="decision-buttons" role="group" aria-label="Human decision">
              <button type="button" onClick={() => decide(index, 'approved')} aria-pressed={decisions[index] === 'approved'}>
                Approve
              </button>
              <button type="button" onClick={() => decide(index, 'dismissed')} aria-pressed={decisions[index] === 'dismissed'}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">The agent proposes. A human decides.</p>
    </div>
  );
}
