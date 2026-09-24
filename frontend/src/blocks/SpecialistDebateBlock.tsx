import { useState } from 'react';
import type { BlockProps } from './registry';

const CONSENSUS_COLUMNS: { group: 'agreed' | 'disputed' | 'missing' | 'human_decision'; label: string; hint: string }[] = [
  { group: 'agreed', label: 'Agreed', hint: 'Specialists converge here' },
  { group: 'disputed', label: 'Still disputed', hint: 'Unresolved disagreement' },
  { group: 'missing', label: 'Missing before MDT', hint: 'Evidence to chase before the meeting' },
  { group: 'human_decision', label: 'Human decision', hint: 'The tumour board decides' },
];

type Decision = 'approved' | 'dismissed' | undefined;

/**
 * The signature view for the AI European Tumour Board: specialist hypotheses side by side, the
 * direct challenges between them, and a consensus board separating what converges from what a
 * human still has to resolve or decide.
 */
export function SpecialistDebateBlock({ block }: BlockProps) {
  const [openChallenge, setOpenChallenge] = useState<number | null>(0);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const decide = (index: number, decision: Decision) =>
    setDecisions((current) => ({ ...current, [index]: current[index] === decision ? undefined : decision }));
  const specialists = block.specialists ?? [];
  const challenges = block.challenges ?? [];

  return (
    <div className="block-body specialist-debate">
      {block.body && <p className="prose">{block.body}</p>}

      <h5 className="debate-heading">Specialist hypotheses</h5>
      <div className="specialist-grid">
        {specialists.map((s, index) => (
          <article key={index} className="specialist-card">
            <header>
              <strong>{s.role}</strong>
              <span className={`confidence-pill confidence-${s.confidence}`}>{s.confidence} confidence</span>
            </header>
            <p className="specialist-hypothesis">{s.hypothesis}</p>
            <p className="specialist-evidence">{s.evidence}</p>
            {s.source && <span className="source">Source: {s.source}</span>}
          </article>
        ))}
      </div>

      {challenges.length > 0 && (
        <>
          <h5 className="debate-heading">Challenge round</h5>
          <ol className="challenge-round" aria-label="Specialists challenging each other">
            {challenges.map((c, index) => {
              const open = openChallenge === index;
              return (
                <li key={index} className={open ? 'open' : undefined}>
                  <button
                    type="button"
                    className="challenge-summary"
                    aria-expanded={open}
                    onClick={() => setOpenChallenge(open ? null : index)}
                  >
                    <span className="challenge-arrow">{c.challenger}</span>
                    <span className="challenge-vs">challenges</span>
                    <span className="challenge-arrow">{c.challenged}</span>
                    {c.resolved && <span className="resolved-pill">Resolved</span>}
                  </button>
                  {open && (
                    <div className="challenge-detail">
                      <p>
                        <strong>Contested evidence:</strong> {c.contested_evidence}
                      </p>
                      <p>{c.detail}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      <h5 className="debate-heading">Consensus board</h5>
      <div className="consensus-board">
        {CONSENSUS_COLUMNS.map((col) => {
          const items = block.items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.group === col.group);
          return (
            <section key={col.group} className={`consensus-col consensus-${col.group}`}>
              <header>
                <strong>{col.label}</strong>
                <span>{col.hint}</span>
              </header>
              {items.length === 0 ? (
                <span className="hx-empty">None recorded.</span>
              ) : (
                <ul>
                  {items.map(({ item, index }) => (
                    <li key={index} data-decision={col.group === 'human_decision' ? decisions[index] : undefined}>
                      <strong>{item.label}</strong>
                      {item.detail && <p>{item.detail}</p>}
                      {item.source && <span className="source">Source: {item.source}</span>}
                      {col.group === 'human_decision' && (
                        <div className="decision-buttons" role="group" aria-label="Human decision">
                          <button
                            type="button"
                            onClick={() => decide(index, 'approved')}
                            aria-pressed={decisions[index] === 'approved'}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(index, 'dismissed')}
                            aria-pressed={decisions[index] === 'dismissed'}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="hint">The specialists propose. The tumour board decides.</p>
    </div>
  );
}
