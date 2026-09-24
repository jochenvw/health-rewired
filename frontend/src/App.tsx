import { FormEvent, useEffect, useState } from 'react';
import { api, type AgentResult, type PatientSummary, type Status, type TrialSummary } from './api';
import { RenderBlock } from './blocks/registry';

const roles = ['Oncologist', 'Oncology nurse', 'MDT coordinator', 'Pharmacist', 'Patient'];

const exampleTasks = [
  "Prepare this case for tomorrow's tumour board. What is missing?",
  'What changed since the last visit, and what needs attention now?',
  'Which synthetic trials could fit, and what data is still needed to check eligibility?',
];

const outcomeOptions = ['lab trend', 'imaging', 'patient-reported symptoms'];
const repoUrl = 'https://github.com/jochenvw/health-rewired';
const newIdeaUrl = `${repoUrl}/issues/new?template=oncology-idea.yml`;
const ideasUrl = `${repoUrl}/issues`;

const steps = [
  { title: 'Share your idea', body: 'Open a GitHub issue and describe it in plain language. No code needed.' },
  { title: 'Get coached', body: 'An AI coach replies within minutes to help sharpen the clinical insight.' },
  { title: 'See it live', body: 'GitHub Copilot builds it and posts a link to your working prototype.' },
];

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState('P-001');
  const [role, setRole] = useState(roles[2]);
  const [task, setTask] = useState(exampleTasks[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [trials, setTrials] = useState<TrialSummary[]>([]);
  const [trialId, setTrialId] = useState('');
  const [outcome, setOutcome] = useState(outcomeOptions[0]);
  const [cohortResult, setCohortResult] = useState<AgentResult | null>(null);
  const [cohortError, setCohortError] = useState<string | null>(null);
  const [cohortLoading, setCohortLoading] = useState<'build' | 'simulate' | null>(null);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
    api.patients().then(setPatients).catch(() => setPatients([]));
    api.trials().then((data) => {
      setTrials(data);
      if (data[0]) setTrialId(data[0].trial_id);
    }).catch(() => setTrials([]));
  }, []);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await api.runAgent({ task, patient_id: patientId, role }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const selectedTrial = trials.find((t) => t.trial_id === trialId);

  const runCohort = async (simulate: boolean) => {
    if (!selectedTrial) return;
    setCohortLoading(simulate ? 'simulate' : 'build');
    setCohortError(null);
    try {
      setCohortResult(
        await api.runAgent({
          task: 'Define, build and explain a synthetic real-world cohort for this question.',
          trial_id: selectedTrial.trial_id,
          treatment: selectedTrial.title,
          subgroup: selectedTrial.key_inclusion,
          outcome,
          role,
          simulate,
        }),
      );
    } catch (err) {
      setCohortError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setCohortLoading(null);
    }
  };

  const renderResult = (agentResult: AgentResult) => (
    <div className="result" aria-live="polite">
      <div className="result-header">
        <h3>{agentResult.headline}</h3>
        <span className={`mode mode-${agentResult.mode}`}>
          {agentResult.mode === 'copilot' ? 'Live Copilot SDK agent' : 'Deterministic demo'}
        </span>
      </div>
      {agentResult.note && <p className="note">{agentResult.note}</p>}
      {agentResult.trace.length > 0 && (
        <ol className="trace" aria-label="What the agent did">
          {agentResult.trace.map((step, index) => (
            <li key={index} title={step.arguments ?? undefined}>
              {step.tool}
            </li>
          ))}
        </ol>
      )}
      <div className="blocks">
        {agentResult.blocks.map((block, index) => (
          <RenderBlock key={index} block={block} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="disclaimer" role="note">
        Hackathon prototype · synthetic data only · not for clinical use
        {status?.preview_label && <span className="preview-pill">Preview {status.preview_label}</span>}
      </div>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ✦
          </span>
          <div>
            <strong>Health Rewired</strong>
            <span>Oncology Hackathon 2026 · Munich</span>
          </div>
        </div>
        <nav aria-label="Main">
          <a href="#canvas">Agent canvas</a>
          <a href="#cohort">Cohort explorer</a>
          <a href={ideasUrl} target="_blank" rel="noreferrer">
            Browse ideas
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>
          Bring your oncology idea. <span className="accent">We'll build it.</span>
        </h1>
        <p className="lede">
          Describe your idea in a GitHub issue. An AI coach helps you sharpen it, then GitHub Copilot turns it into a
          working prototype.
        </p>
        <div className="cta-row">
          <a className="button primary" href={newIdeaUrl} target="_blank" rel="noreferrer">
            Submit your idea on GitHub →
          </a>
          <a className="button ghost" href={ideasUrl} target="_blank" rel="noreferrer">
            See other ideas
          </a>
        </div>
      </section>

      <section className="steps">
        {steps.map((step, index) => (
          <article key={step.title} className="step">
            <span className="step-index">{String(index + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </section>

      <section id="canvas" className="canvas">
        <div className="canvas-intro">
          <p className="eyebrow">Starter agent</p>
          <h2>Every prototype starts from this agent.</h2>
          <p>Try it on synthetic patients to see what your idea can build on.</p>
        </div>

        <form className="agent-form" onSubmit={run}>
          <div className="field-row">
            <label>
              Synthetic patient
              <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                {(patients.length ? patients : [{ id: 'P-001', name: 'P-001', age: 0, diagnosis: '' }]).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                    {p.diagnosis ? ` · ${p.diagnosis}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Task for the agent
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} />
          </label>
          <div className="chip-row">
            {exampleTasks.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => setTask(example)}>
                {example}
              </button>
            ))}
          </div>
          <button className="button primary" type="submit" disabled={loading || task.trim().length < 3}>
            {loading ? 'Agent is working…' : 'Run agent'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        {result && renderResult(result)}
      </section>

      <section id="cohort" className="canvas">
        <div className="canvas-intro">
          <p className="eyebrow">Cohort explorer</p>
          <h2>Turn a clinical question into a traceable, continuously-updated cohort.</h2>
          <p>
            Pick a treatment/trial, subgroup and outcome. The agent proposes explicit cohort rules, classifies every
            synthetic patient as eligible, ineligible or unknown against the trial's criteria — always with a source
            record — and describes what happened. It never claims the difference proves a treatment effect. Use
            "Simulate new data" to add fictional follow-up and see whether the finding still holds.
          </p>
        </div>

        <form
          className="agent-form"
          onSubmit={(event) => {
            event.preventDefault();
            runCohort(false);
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
            <button className="button primary" type="submit" disabled={cohortLoading !== null || !selectedTrial}>
              {cohortLoading === 'build' ? 'Building cohort…' : 'Propose & build cohort'}
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => runCohort(true)}
              disabled={cohortLoading !== null || !selectedTrial || !cohortResult}
            >
              {cohortLoading === 'simulate' ? 'Simulating…' : 'Simulate new data & rerun'}
            </button>
          </div>
        </form>

        {cohortError && <p className="error">{cohortError}</p>}

        {cohortResult && renderResult(cohortResult)}
      </section>

      <footer className="footer">
        <span>Health Rewired · Oncology Hackathon 2026 · Munich</span>
        <span>
          v{status?.version ?? '–'} · Copilot: {status?.copilot.auth_mode ?? 'unknown'}
        </span>
      </footer>
    </div>
  );
}
