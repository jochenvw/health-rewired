import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type PatientRecord, type PatientSummary } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: 'starter',
  title: 'Starter: oncology chart with AI assistant',
  tagline: 'The example every idea builds on: a hospital chart with an assistant that reads the record for you.',
};

// Extra fake clinic context so the screen feels like a real day; only P-00x rows open a chart.
const clinicSlots = [
  { time: '08:00', id: 'P-001', type: 'Chemo day unit – paclitaxel wk 6', room: 'Chair 4', status: 'Arrived' },
  { time: '08:30', id: 'X-114', name: 'Klaus Hoffmann', dx: 'NSCLC stage IV', type: 'Follow-up', room: 'Room 2', status: 'Waiting' },
  { time: '09:15', id: 'P-002', type: 'Tumour board preparation', room: 'MDT', status: 'Scheduled' },
  { time: '10:00', id: 'X-207', name: 'Sabine Kraus', dx: 'Ovarian ca. FIGO IIIC', type: 'Consent discussion', room: 'Room 1', status: 'Scheduled' },
  { time: '10:45', id: 'P-003', type: 'Toxicity review', room: 'Room 3', status: 'Scheduled' },
  { time: '11:30', id: 'X-331', name: 'Mehmet Yilmaz', dx: 'Gastric ca. cT3N1', type: 'New referral', room: 'Room 2', status: 'Scheduled' },
  { time: '13:00', id: 'X-402', name: 'Ingrid Maier', dx: 'CLL Binet B', type: 'Telephone follow-up', room: 'Phone', status: 'Scheduled' },
];

const roles = ['Oncologist', 'Oncology nurse', 'MDT coordinator', 'Pharmacist'];

const exampleTasks = [
  "Prepare this case for tomorrow's tumour board. What is missing?",
  'What changed since the last visit, and what needs attention now?',
  'Which synthetic trials could fit, and what data is still needed to check eligibility?',
];

type Section = 'worklist' | 'chart' | 'assistant';

export default function StarterAgent() {
  const [section, setSection] = useState<Section>('worklist');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState('P-001');
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.patients().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    setRecord(null);
    api.patient(patientId).then(setRecord).catch(() => setRecord(null));
  }, [patientId]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const worklist = clinicSlots.map((s) => ({
    ...s,
    name: s.name ?? byId.get(s.id)?.name ?? s.id,
    dx: s.dx ?? byId.get(s.id)?.diagnosis ?? '',
  }));

  const openPatient = (id: string) => {
    if (!id.startsWith('P-')) {
      setNotice('This chart is not part of the synthetic demo data. Open one of the highlighted patients.');
      return;
    }
    setNotice(null);
    setPatientId(id);
    setSection('chart');
  };

  const flagged = record?.labs.filter((l) => l.flag).length ?? 0;

  return (
    <HospitalShell
      module="Oncology clinic"
      nav={[
        { id: 'worklist', label: 'Clinic worklist', badge: worklist.length },
        { id: 'chart', label: 'Patient chart', badge: flagged || undefined },
        { id: 'assistant', label: 'AI assistant' },
      ]}
      active={section}
      onNav={(id) => setSection(id as Section)}
      patient={
        section === 'worklist' || !record
          ? null
          : {
              id: record.id,
              name: record.name,
              age: record.age,
              sex: record.sex,
              diagnosis: `${record.diagnosis.primary} · ${record.diagnosis.stage} · ECOG ${record.ecog}`,
            }
      }
      toolbar={
        <>
          <label>
            Patient{' '}
            <select value={patientId} onChange={(e) => openPatient(e.target.value)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={() => setNotice('Printed to ward printer ONK-3B (demo).')}>
            Print
          </button>
          <button type="button" className="hx-btn primary" onClick={() => setSection('assistant')}>
            Ask assistant
          </button>
        </>
      }
    >
      {notice && (
        <Panel title="Information">
          {notice}
        </Panel>
      )}
      {section === 'worklist' && (
        <Panel title={`Clinic worklist · Medical Oncology · ${new Date().toLocaleDateString('de-DE')}`}>
          <DataTable
            rowKey={(r) => r.id}
            rows={worklist}
            selected={patientId}
            onSelect={(r) => openPatient(r.id)}
            columns={[
              { key: 'time', label: 'Time', width: '60px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'type', label: 'Visit' },
              { key: 'room', label: 'Location' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <Pill tone={r.status === 'Arrived' ? 'ok' : r.status === 'Waiting' ? 'warn' : 'neutral'}>{r.status}</Pill>,
              },
            ]}
          />
        </Panel>
      )}
      {section === 'chart' && (record ? <Chart record={record} /> : <Panel title="Patient chart">Loading record…</Panel>)}
      {section === 'assistant' && <Assistant patientId={patientId} />}
    </HospitalShell>
  );
}

function Chart({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState('summary');
  const [ack, setAck] = useState<Set<string>>(new Set());
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'results', label: `Results (${record.labs.length})` },
          { id: 'therapy', label: 'Therapy & medication' },
          { id: 'symptoms', label: 'Patient-reported' },
          { id: 'history', label: 'History' },
        ]}
      />
      {tab === 'summary' && (
        <div className="hx-grid">
          <Panel title="Diagnosis">
            <dl className="hx-facts">
              <dt>Primary</dt>
              <dd>{record.diagnosis.primary}</dd>
              <dt>Diagnosed</dt>
              <dd>{record.diagnosis.date}</dd>
              <dt>Stage</dt>
              <dd>{record.diagnosis.stage}</dd>
              {record.diagnosis.grade !== undefined && (
                <>
                  <dt>Grade</dt>
                  <dd>G{record.diagnosis.grade}</dd>
                </>
              )}
              {Object.entries(record.diagnosis.biomarkers).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v.includes('pending') ? <Pill tone="warn">{v}</Pill> : v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Open issues">
            {record.open_questions.length === 0 ? (
              <span className="hx-empty">None recorded.</span>
            ) : (
              record.open_questions.map((q) => (
                <p key={q} style={{ margin: '0 0 6px' }}>
                  <Pill tone="crit">Open</Pill> {q}
                </p>
              ))
            )}
            <p style={{ margin: '8px 0 0' }}>
              <strong>Comorbidities:</strong> {record.comorbidities.join('; ') || '–'}
            </p>
          </Panel>
        </div>
      )}
      {tab === 'results' && (
        <Panel title="Laboratory results">
          <DataTable
            rowKey={(l) => `${l.date}-${l.test}`}
            rows={[...record.labs].sort((a, b) => b.date.localeCompare(a.date))}
            rowTone={(l) => (l.flag ? (ack.has(`${l.date}-${l.test}`) ? undefined : 'crit') : undefined)}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'test', label: 'Test' },
              { key: 'value', label: 'Result', render: (l) => <strong>{`${l.value} ${l.unit}`}</strong> },
              { key: 'ref', label: 'Reference' },
              {
                key: 'flag',
                label: 'Flag',
                render: (l) => (l.flag ? <Pill tone={l.flag === 'low' ? 'warn' : 'crit'}>{l.flag.toUpperCase()}</Pill> : ''),
              },
              {
                key: 'ack',
                label: '',
                render: (l) => {
                  const key = `${l.date}-${l.test}`;
                  if (!l.flag) return '';
                  return ack.has(key) ? (
                    <Pill tone="ok">Acknowledged</Pill>
                  ) : (
                    <button type="button" className="hx-btn" onClick={() => setAck(new Set(ack).add(key))}>
                      Acknowledge
                    </button>
                  );
                },
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'therapy' && (
        <div className="hx-grid">
          <Panel title="Systemic therapy">
            <DataTable
              rowKey={(t) => t.regimen}
              rows={record.treatments}
              columns={[
                { key: 'type', label: 'Line' },
                { key: 'regimen', label: 'Regimen' },
                { key: 'start', label: 'Start' },
                { key: 'cycle', label: 'Progress' },
                { key: 'status', label: 'Status', render: (t) => <Pill tone="info">{t.status}</Pill> },
              ]}
            />
          </Panel>
          <Panel title="Current medication">
            <DataTable
              rowKey={(m) => m}
              rows={record.medications}
              columns={[{ key: 'm', label: 'Medication', render: (m) => m }]}
            />
          </Panel>
        </div>
      )}
      {tab === 'symptoms' && (
        <Panel title="Patient-reported outcomes (app)">
          <DataTable
            rowKey={(s) => `${s.date}-${s.symptom}`}
            rows={record.patient_reported}
            rowTone={(s) => (s.grade >= 2 ? 'warn' : undefined)}
            empty="No patient-reported symptoms."
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'symptom', label: 'Symptom' },
              { key: 'grade', label: 'CTCAE grade', render: (s) => <Pill tone={s.grade >= 2 ? 'warn' : 'neutral'}>G{s.grade}</Pill> },
            ]}
          />
        </Panel>
      )}
      {tab === 'history' && (
        <Panel title="Clinical course">
          <DataTable
            rowKey={(e) => `${e.date}-${e.event}`}
            rows={[...record.timeline].reverse()}
            columns={[
              { key: 'date', label: 'Date', width: '110px' },
              { key: 'event', label: 'Event' },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

function Assistant({ patientId }: { patientId: string }) {
  const [role, setRole] = useState(roles[0]);
  const [task, setTask] = useState(exampleTasks[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSigned(false);
    try {
      setResult(await api.runAgent({ task, patient_id: patientId, role }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 2fr)' }}>
      <Panel title="Request">
        <form className="agent-form" onSubmit={run}>
          <label>
            Your role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Question
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={4} />
          </label>
          <div className="chip-row">
            {exampleTasks.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => setTask(example)}>
                {example}
              </button>
            ))}
          </div>
          <button className="hx-btn primary" type="submit" disabled={loading || task.trim().length < 3}>
            {loading ? 'Assistant is reading the record…' : 'Ask assistant'}
          </button>
        </form>
      </Panel>
      <Panel
        title={result ? result.headline : 'Assistant output'}
        actions={
          result && (
            <>
              <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>
                {result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
              </Pill>
              <button type="button" className="hx-btn primary" disabled={signed} onClick={() => setSigned(true)}>
                {signed ? 'Filed to chart ✓' : 'Review & file to chart'}
              </button>
            </>
          )
        }
      >
        {error && <p className="error">{error}</p>}
        {!result && !error && <span className="hx-empty">Ask a question to see a draft. Nothing is filed until you approve it.</span>}
        {result && (
          <div className="result" aria-live="polite">
            {result.note && <p className="note">{result.note}</p>}
            {result.trace.length > 0 && (
              <ol className="trace" aria-label="What the assistant looked at">
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
      </Panel>
    </div>
  );
}
