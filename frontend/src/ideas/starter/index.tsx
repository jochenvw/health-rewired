import { FormEvent, useEffect, useState } from 'react';
import { api, type AgentResult, type PatientSummary } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: 'starter',
  title: 'Starter agent',
  tagline: 'The assistant every idea builds on: it reads synthetic patient records and shows what matters.',
};

const roles = ['Oncologist', 'Oncology nurse', 'MDT coordinator', 'Pharmacist', 'Patient'];

const exampleTasks = [
  "Prepare this case for tomorrow's tumour board. What is missing?",
  'What changed since the last visit, and what needs attention now?',
  'Which synthetic trials could fit, and what data is still needed to check eligibility?',
];

export default function StarterAgent() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState('P-001');
  const [role, setRole] = useState(roles[2]);
  const [task, setTask] = useState(exampleTasks[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
    <section className="canvas">
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
  );
}
