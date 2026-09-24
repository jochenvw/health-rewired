import { useEffect, useState, type ReactNode } from 'react';

/*
 * Storytelling pieces for idea prototypes. A prototype brings the participant's vision to life:
 * a guided walkthrough (StoryGuide) and visible, simulated "behind the scenes" work (Backstage)
 * so a clinician understands how the idea could work, step by step.
 */

export type StoryStep = { id: string; title: string; explain: ReactNode };

/** Guided-demo bar: numbered steps, what is happening now, and Back / Next. */
export function StoryGuide({
  steps,
  current,
  onGo,
  nextLabel,
}: {
  steps: StoryStep[];
  current: string;
  onGo: (id: string) => void;
  /** Label for the Next button, e.g. "Send query to hospitals". Defaults to the next step title. */
  nextLabel?: string;
}) {
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === current),
  );
  const step = steps[index];
  const next = steps[index + 1];
  const prev = steps[index - 1];
  return (
    <div className="hx-story" role="region" aria-label="Guided demo">
      <ol className="hx-story-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={i < index ? 'done' : i === index ? 'current' : undefined}>
            <button type="button" onClick={() => onGo(s.id)}>
              <span className="hx-story-num">{i < index ? '✓' : i + 1}</span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>
      <div className="hx-story-explain">
        <span className="hx-story-tag">Guided demo · step {index + 1} of {steps.length}</span>
        <span>{step?.explain}</span>
        <span className="hx-spacer" />
        {prev && (
          <button type="button" className="hx-btn" onClick={() => onGo(prev.id)}>
            ← Back
          </button>
        )}
        {next && (
          <button type="button" className="hx-btn primary" onClick={() => onGo(next.id)}>
            {nextLabel ?? next.title} →
          </button>
        )}
      </div>
    </div>
  );
}

export type Stage = {
  label: string;
  /** Shown under the label once the stage runs, e.g. "412 matching records · data stays on site". */
  detail?: ReactNode;
  /** Simulated duration in ms (default 900). */
  ms?: number;
};

/** Plays stages one after another. `holdLast` keeps the last stage spinning until `release` is true. */
export function useStages(stages: Stage[], running: boolean, opts: { holdLast?: boolean; release?: boolean } = {}) {
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!running) {
      setDone(0);
      return;
    }
    if (done >= stages.length) return;
    const isLast = done === stages.length - 1;
    if (isLast && opts.holdLast && !opts.release) return;
    const t = window.setTimeout(() => setDone((d) => d + 1), stages[done].ms ?? 900);
    return () => window.clearTimeout(t);
  }, [running, done, stages, opts.holdLast, opts.release]);
  return { done, finished: running && done >= stages.length };
}

/**
 * Visible, simulated "behind the scenes" work: each stage spins, then ticks, with an explanation.
 * Use for anything the real system would do out of sight – querying hospitals, matching criteria,
 * training a model, sending letters – so the clinician sees how the idea works.
 */
export function Backstage({
  title = 'Behind the scenes',
  stages,
  running,
  holdLast,
  release,
  onFinished,
  note,
}: {
  title?: string;
  stages: Stage[];
  running: boolean;
  holdLast?: boolean;
  release?: boolean;
  onFinished?: () => void;
  note?: ReactNode;
}) {
  const { done, finished } = useStages(stages, running, { holdLast, release });
  useEffect(() => {
    if (finished) onFinished?.();
  }, [finished]);
  if (!running) return null;
  return (
    <section className="hx-backstage" aria-live="polite">
      <header>
        <strong>{title}</strong>
        <span>{finished ? 'Completed' : 'Running…'}</span>
      </header>
      <ol>
        {stages.map((s, i) => {
          const state = i < done ? 'done' : i === done ? 'running' : 'waiting';
          return (
            <li key={i} className={state}>
              <span className="hx-stage-icon" aria-hidden>
                {state === 'done' ? '✓' : state === 'running' ? <span className="hx-spinner" /> : '○'}
              </span>
              <div>
                <div>{s.label}</div>
                {state !== 'waiting' && s.detail && <div className="hx-stage-detail">{s.detail}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {note && <p className="hx-backstage-note">{note}</p>}
    </section>
  );
}
