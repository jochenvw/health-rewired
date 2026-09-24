import { useEffect, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '27',
  issue: 27,
  title: 'Patients like mine who were left out of trials',
  tagline:
    "What actually happened to patients who did or didn't meet a trial's criteria — with a traceable reason for every patient, not a black box.",
};

type Trial = {
  trial_id: string;
  title: string;
  cancer_type: string;
  key_inclusion: string;
  key_exclusion: string;
};

const outcomeOptions = ['lab trend', 'imaging', 'patient-reported symptoms'];

export default function CohortExplorer() {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialId, setTrialId] = useState('');
  const [outcome, setOutcome] = useState(outcomeOptions[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'build' | 'simulate' | null>(null);

  useEffect(() => {
    request<Trial[]>('/api/ideas/27/trials')
      .then((data) => {
        setTrials(data);
        if (data[0]) setTrialId(data[0].trial_id);
      })
      .catch(() => setTrials([]));
  }, []);

  const selectedTrial = trials.find((t) => t.trial_id === trialId);

  const run = async (simulate: boolean) => {
    if (!selectedTrial) return;
    setLoading(simulate ? 'simulate' : 'build');
    setError(null);
    try {
      setResult(
        await request<AgentResult>('/api/ideas/27/run', {
          method: 'POST',
          body: JSON.stringify({
            trial_id: selectedTrial.trial_id,
            treatment: selectedTrial.title,
            subgroup: selectedTrial.key_inclusion,
            outcome,
            simulate,
          }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="canvas">
      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(false);
        }}
      >
        <div className="field-row">
          <label>
            Treatment / synthetic trial
            <select value={trialId} onChange={(e) => setTrialId(e.target.value)}>
              {trials.map((t) => (
                <option key={t.trial_id} value={t.trial_id}>
                  {t.trial_id} · {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {outcomeOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </div>
        {selectedTrial && (
          <p className="hint">
            Subgroup (from trial criteria): {selectedTrial.key_inclusion} · Excludes: {selectedTrial.key_exclusion}
          </p>
        )}
        <div className="chip-row">
          <button className="button primary" type="submit" disabled={loading !== null || !selectedTrial}>
            {loading === 'build' ? 'Building cohort…' : 'Propose & build cohort'}
          </button>
          <button
            className="button ghost"
            type="button"
            onClick={() => run(true)}
            disabled={loading !== null || !selectedTrial || !result}
          >
            {loading === 'simulate' ? 'Simulating…' : 'Simulate new data & rerun'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <div className="result" aria-live="polite">
          <div className="result-header">
            <h3>{result.headline}</h3>
            <span className={`mode mode-${result.mode}`}>
              {result.mode === 'copilot' ? 'Live Copilot SDK agent' : 'Deterministic demo'}
            </span>
          </div>
          {result.note && <p className="note">{result.note}</p>}
          {result.trace.length > 0 && (
            <ol className="trace" aria-label="What the agent did">
              {result.trace.map((step, index) => (
                <li key={index} title={step.arguments ?? undefined}>
                  {step.tool}
                </li>
              ))}
            </ol>
          )}
          <div className="blocks">
            {result.blocks.map((block, index) => (
              <RenderBlock key={index} block={block} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
