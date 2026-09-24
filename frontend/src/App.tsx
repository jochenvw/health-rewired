import { FormEvent, useEffect, useState } from 'react';
import { api, type AgentResult, type PatientSummary, type Status } from './api';
import { RenderBlock } from './blocks/registry';

const roles = ['Oncologist', 'Oncology nurse', 'MDT coordinator', 'Pharmacist', 'Patient'];

const OUTCOME_RISK_TASK = 'Assess outcome risk across labs, imaging and biomarkers, and ground it in a matching trial.';

const exampleTasks = [
  "Prepare this case for tomorrow's tumour board. What is missing?",
  'What changed since the last visit, and what needs attention now?',
  'Which synthetic trials could fit, and what data is still needed to check eligibility?',
  OUTCOME_RISK_TASK,
];

const repoUrl = 'https://github.com/jochenvw/health-rewired';
const newIdeaUrl = `${repoUrl}/issues/new?template=oncology-idea.yml`;
const ideasUrl = `${repoUrl}/issues`;

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState('P-001');
  const [role, setRole] = useState(roles[2]);
  const [task, setTask] = useState(exampleTasks[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [outcomeResult, setOutcomeResult] = useState<AgentResult | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null));
    api.patients().then(setPatients).catch(() => setPatients([]));
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

  const showOutcomeRisk = async () => {
    setOutcomeLoading(true);
    setOutcomeError(null);
    try {
      setOutcomeResult(await api.runAgent({ task: OUTCOME_RISK_TASK, patient_id: patientId, role: 'Oncologist' }));
    } catch (err) {
      setOutcomeError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setOutcomeLoading(false);
    }
  };

  const outcomeRiskBlocks = outcomeResult?.blocks.filter((block) => block.type === 'outcome_risk') ?? [];
  const patientOptions = patients.length ? patients : [{ id: 'P-001', name: 'P-001', age: 0, diagnosis: '' }];

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
          <a href={newIdeaUrl} target="_blank" rel="noreferrer">
            Submit an idea
          </a>
          <a href={ideasUrl} target="_blank" rel="noreferrer">
            Browse ideas
          </a>
        </nav>
      </header>

      <section className="hero idea-hero">
        <p className="eyebrow">Predict outcomes</p>
        <h1>
          See the outcome risk, <span className="accent">not just a number.</span>
        </h1>
        <p className="lede">
          For the oncologist reviewing a case between visits: an agent reasons across labs, imaging and biomarkers
          together, flags an emerging concern, and grounds it in a matching trial — always for you to approve, edit
          or dismiss.
        </p>
        <div className="cta-row">
          <label>
            Synthetic patient
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {patientOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.name}
                  {p.diagnosis ? ` · ${p.diagnosis}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="button primary" type="button" onClick={showOutcomeRisk} disabled={outcomeLoading}>
            {outcomeLoading ? 'Assessing…' : 'Show outcome risk'}
          </button>
        </div>

        {outcomeError && <p className="error">{outcomeError}</p>}

        {outcomeResult && (
          <div className="result" aria-live="polite">
            <div className="result-header">
              <h3>{outcomeResult.headline}</h3>
              <span className={`mode mode-${outcomeResult.mode}`}>
                {outcomeResult.mode === 'copilot' ? 'Live Copilot SDK agent' : 'Deterministic demo'}
              </span>
            </div>
            {outcomeResult.note && <p className="note">{outcomeResult.note}</p>}
            {outcomeRiskBlocks.length > 0 ? (
              <div className="blocks">
                {outcomeRiskBlocks.map((block, index) => (
                  <RenderBlock key={index} block={block} />
                ))}
              </div>
            ) : (
              <p className="note">No outcome-risk concern flagged for this patient right now.</p>
            )}
          </div>
        )}
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
                {patientOptions.map((p) => (
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

      <footer className="footer">
        <span>Health Rewired · Oncology Hackathon 2026 · Munich</span>
        <span>
          v{status?.version ?? '–'} · Copilot: {status?.copilot.auth_mode ?? 'unknown'}
        </span>
      </footer>
    </div>
  );
}
