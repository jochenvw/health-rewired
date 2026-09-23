import { FormEvent, useEffect, useState } from 'react';
import { api, type AgentResult, type PatientSummary, type Status } from './api';
import { RenderBlock } from './blocks/registry';

const roles = ['Oncologist', 'Oncology nurse', 'MDT coordinator', 'Pharmacist', 'Patient'];

const exampleTasks = [
  "Prepare this case for tomorrow's tumour board. What is missing?",
  'What changed since the last visit, and what needs attention now?',
  'Which synthetic trials could fit, and what data is still needed to check eligibility?',
];

const steps = [
  { title: 'Open an issue', body: 'Describe your oncology idea in plain language. No code, no jargon.' },
  { title: 'Get coached', body: 'An AI coach helps sharpen the clinical insight and stretch the ambition.' },
  { title: 'Copilot builds', body: 'Once ready, GitHub Copilot implements your idea on top of this canvas.' },
  { title: 'Click the link', body: 'A live prototype appears at its own URL, right in your issue.' },
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
          <a href="#how">How it works</a>
          <a href="#canvas">Agent canvas</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Oncology Hackathon 2026 · Munich</p>
        <h1>
          Where oncology ideas become <span className="accent">agentic prototypes</span>.
        </h1>
        <p className="lede">
          This is the blank canvas every hackathon idea starts from. Clinicians bring the insight; AI agents coach,
          build and deploy. Pursue the impossible. Cross boundaries. Move from discovery to impact.
        </p>
        <div className="cta-row">
          <a className="button primary" href="#canvas">
            Try the agent
          </a>
          <a className="button ghost" href="#how">
            Start with an idea
          </a>
        </div>
      </section>

      <section id="how" className="steps">
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
          <p className="eyebrow">Agent canvas</p>
          <h2>Not a chatbot: an agent that looks things up and chooses what to show.</h2>
          <p>
            The GitHub Copilot SDK agent reads synthetic records with tools, reasons over them, and assembles the
            screen below from UI blocks. Proposed actions always wait for a human.
          </p>
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
