import { useEffect, useState } from 'react';
import { api, type AgentResult, type PatientSummary } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '31',
  issue: 31,
  title: 'Early warning for lung cancer outcomes',
  tagline: 'For the oncologist reviewing a case between visits: spot a rising risk before the next scan.',
};

const TASK = 'Assess outcome risk across labs, imaging and biomarkers, and ground it in a matching trial.';
const DEFAULT_PATIENT = 'P-002';

export default function OutcomeRisk() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState(DEFAULT_PATIENT);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.patients().then(setPatients).catch(() => setPatients([]));
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.runIdea('31', { task: TASK, patient_id: patientId, role: 'Oncologist' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const patientOptions = patients.length ? patients : [{ id: DEFAULT_PATIENT, name: DEFAULT_PATIENT, age: 0, diagnosis: '' }];

  return (
    <section className="canvas">
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
      </div>
      <button className="button primary" type="button" onClick={run} disabled={loading}>
        {loading ? 'Assessing…' : 'Show outcome risk'}
      </button>

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
