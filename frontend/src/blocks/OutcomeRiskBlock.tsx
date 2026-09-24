import { useState } from 'react';
import type { BlockProps } from './registry';

type Decision = 'approved' | 'dismissed' | undefined;

/**
 * Outcome Risk panel: reasons across labs, imaging and biomarkers as one picture and grounds any
 * concern in a matching synthetic trial. The AI only drafts the note — a human always approves,
 * edits or dismisses it before it becomes part of the case record.
 */
export function OutcomeRiskBlock({ block }: BlockProps) {
  const [decision, setDecision] = useState<Decision>(undefined);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(block.body ?? '');

  const decide = (next: Decision) => setDecision((current) => (current === next ? undefined : next));

  return (
    <div className="block-body outcome-risk">
      <span className="risk-badge" data-severity={block.severity ?? 'info'}>
        {(block.severity ?? 'info').toUpperCase()} RISK
      </span>
      {editing ? (
        <textarea
          className="risk-note-edit"
          aria-label="Edit risk note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      ) : (
        note && <p className="prose">{note}</p>
      )}
      <ul className="risk-trail">
        {block.items.map((item, index) => (
          <li key={index} data-severity={item.severity ?? undefined}>
            <strong>{item.label}</strong>
            {item.detail && <p>{item.detail}</p>}
            {item.source && <span className="source">Source: {item.source}</span>}
          </li>
        ))}
      </ul>
      <div className="decision-buttons" role="group" aria-label="Human decision">
        <button type="button" onClick={() => decide('approved')} aria-pressed={decision === 'approved'}>
          Approve
        </button>
        <button type="button" onClick={() => setEditing((current) => !current)} aria-pressed={editing}>
          Edit
        </button>
        <button type="button" onClick={() => decide('dismissed')} aria-pressed={decision === 'dismissed'}>
          Dismiss
        </button>
      </div>
      <p className="hint">
        {decision === 'approved' && 'Approved — the oncologist owns this risk note in the case record.'}
        {decision === 'dismissed' && 'Dismissed — no action taken.'}
        {!decision && 'The agent proposes a risk note grounded in evidence. A human decides.'}
      </p>
    </div>
  );
}
