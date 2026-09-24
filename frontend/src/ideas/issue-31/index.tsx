import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type PatientRecord, type PatientSummary, type Trial } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '31',
  issue: 31,
  title: 'Early warning for lung cancer outcomes',
  tagline: 'For the oncologist reviewing a case between visits: spot a rising risk before the next scan.',
};

const DEFAULT_PATIENT = 'P-002';
const TASK = 'Assess outcome risk across labs, imaging and biomarkers, and ground it in a matching trial.';

// Extra fake clinic context so the worklist feels like a real day; only P-00x rows open a chart.
const clinicSlots = [
  { time: '08:00', id: 'X-118', name: 'Renate Vogel', dx: 'Follicular lymphoma', type: 'Surveillance', room: 'Room 1', status: 'Waiting' },
  { time: '08:45', id: 'P-001', type: 'Chemo day unit – paclitaxel wk 5', room: 'Chair 4', status: 'Arrived' },
  { time: '09:30', id: 'P-002', type: 'Tumour board preparation', room: 'MDT', status: 'New nodule' },
  { time: '10:15', id: 'X-249', name: 'Josef Brandt', dx: 'Prostate ca. Gleason 7', type: 'Follow-up', room: 'Room 2', status: 'Scheduled' },
  { time: '11:00', id: 'P-003', type: 'Surveillance review', room: 'Room 3', status: 'Rising CEA' },
  { time: '13:30', id: 'X-356', name: 'Petra Lindner', dx: 'Melanoma stage II', type: 'New referral', room: 'Room 1', status: 'Scheduled' },
];

type Section = 'worklist' | 'chart' | 'risk';

export default function OutcomeRisk() {
  const [section, setSection] = useState<Section>('risk');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState(DEFAULT_PATIENT);
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

  const openPatient = (id: string, target: Section = 'chart') => {
    if (!id.startsWith('P-')) {
      setNotice('This chart is not part of the synthetic demo data. Open one of the highlighted patients.');
      return;
    }
    setNotice(null);
    setPatientId(id);
    setSection(target);
  };

  const flagged = record?.labs.filter((l) => l.flag).length ?? 0;

  return (
    <HospitalShell
      module="Oncology clinic"
      nav={[
        { id: 'worklist', label: 'Clinic worklist', badge: worklist.length },
        { id: 'chart', label: 'Patient chart', badge: flagged || undefined },
        { id: 'risk', label: 'Outcome risk' },
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
            <select value={patientId} onChange={(e) => openPatient(e.target.value, section === 'worklist' ? 'chart' : section)}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn primary" onClick={() => setSection('risk')}>
            Show outcome risk
          </button>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}
      {section === 'worklist' && (
        <Panel title={`Clinic worklist · Medical Oncology · ${new Date().toLocaleDateString('de-DE')}`}>
          <DataTable
            rowKey={(r) => r.id}
            rows={worklist}
            selected={patientId}
            onSelect={(r) => openPatient(r.id, r.id.startsWith('P-') ? 'risk' : 'chart')}
            columns={[
              { key: 'time', label: 'Time', width: '60px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'type', label: 'Visit' },
              { key: 'room', label: 'Location' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => (
                  <Pill tone={r.status === 'Arrived' ? 'ok' : r.status === 'Waiting' || r.status === 'Scheduled' ? 'neutral' : 'warn'}>
                    {r.status}
                  </Pill>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {section === 'chart' && (record ? <Chart record={record} /> : <Panel title="Patient chart">Loading record…</Panel>)}
      {section === 'risk' && (record ? <OutcomeRiskPanel record={record} /> : <Panel title="Outcome risk">Loading record…</Panel>)}
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
          { id: 'imaging', label: `Imaging (${record.imaging?.length ?? 0})` },
          { id: 'therapy', label: 'Therapy' },
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
              {Object.entries(record.diagnosis.biomarkers).map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
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
      {tab === 'imaging' && (
        <Panel title="Imaging">
          <DataTable
            rowKey={(i) => `${i.date}-${i.modality}`}
            rows={[...(record.imaging ?? [])].sort((a, b) => b.date.localeCompare(a.date))}
            empty="No imaging recorded."
            columns={[
              { key: 'date', label: 'Date', width: '110px' },
              { key: 'modality', label: 'Modality' },
              { key: 'result', label: 'Finding', render: (i) => i.result },
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
                { key: 'status', label: 'Status', render: (t) => <Pill tone="info">{t.status}</Pill> },
              ]}
            />
          </Panel>
          <Panel title="Current medication">
            <DataTable rowKey={(m) => m} rows={record.medications} columns={[{ key: 'm', label: 'Medication', render: (m) => m }]} />
          </Panel>
        </div>
      )}
    </>
  );
}

type Action = 'acknowledged' | 'mdt' | undefined;

function OutcomeRiskPanel({ record }: { record: PatientRecord }) {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [action, setAction] = useState<Action>(undefined);

  useEffect(() => {
    api.sampleData<Trial[]>('trials.csv').then(setTrials).catch(() => setTrials([]));
  }, []);

  const assess = useMemo(
    () => async () => {
      setLoading(true);
      setError(null);
      setAction(undefined);
      try {
        setResult(await api.runIdea('31', { task: TASK, patient_id: record.id, role: 'Oncologist' }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
      } finally {
        setLoading(false);
      }
    },
    [record.id],
  );

  useEffect(() => {
    assess();
  }, [assess]);

  const outcomeBlocks = result?.blocks.filter((b) => b.type === 'outcome_risk') ?? [];
  const otherBlocks = result?.blocks.filter((b) => b.type !== 'outcome_risk') ?? [];
  const matchedTrialId = outcomeBlocks[0]?.items
    .map((i) => `${i.label} ${i.detail ?? ''}`.match(/[A-Z]{2,4}-[A-Z]{2,4}-\d+/)?.[0])
    .find((id): id is string => Boolean(id));

  const cancerKind = record.diagnosis.primary.toLowerCase();
  const relevantTrials = trials.filter((t) => cancerKind.includes(t.cancer_type));

  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 3fr) minmax(280px, 2fr)' }}>
      <Panel
        title={result ? result.headline : `Assessing outcome risk for ${record.name}…`}
        actions={
          <>
            {result && <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>}
            <button type="button" className="hx-btn" disabled={loading} onClick={() => assess()}>
              {loading ? 'Assessing…' : 'Re-assess'}
            </button>
          </>
        }
      >
        {error && <p className="error">{error}</p>}
        {loading && !result && <span className="hx-empty">Reading labs, imaging and biomarkers…</span>}
        {result && outcomeBlocks.length === 0 && (
          <span className="hx-empty">No emerging outcome concern found for {record.name} right now.</span>
        )}
        {outcomeBlocks.map((block, index) => (
          <RenderBlock key={index} block={block} />
        ))}
        {otherBlocks.length > 0 && <div className="blocks">{otherBlocks.map((block, index) => <RenderBlock key={index} block={block} />)}</div>}
        {outcomeBlocks.length > 0 && (
          <div className="decision-buttons" role="group" aria-label="Clinician action" style={{ marginTop: 12 }}>
            <button type="button" className="hx-btn" aria-pressed={action === 'acknowledged'} onClick={() => setAction('acknowledged')}>
              Acknowledge
            </button>
            <button type="button" className="hx-btn primary" aria-pressed={action === 'mdt'} onClick={() => setAction('mdt')}>
              Discuss at MDT
            </button>
          </div>
        )}
        {action === 'acknowledged' && <p className="hint">Acknowledged — noted in the case record, no referral made.</p>}
        {action === 'mdt' && <p className="hint">Added to the next tumour board agenda for discussion.</p>}
      </Panel>
      <Panel title="Matching trials">
        <DataTable
          rowKey={(t) => t.trial_id}
          rows={relevantTrials}
          selected={matchedTrialId}
          empty="No synthetic trials for this cancer type."
          columns={[
            { key: 'trial_id', label: 'Trial', render: (t) => <strong>{t.trial_id}</strong> },
            { key: 'title', label: 'Title' },
            { key: 'phase', label: 'Phase', width: '60px' },
            { key: 'key_inclusion', label: 'Key inclusion' },
          ]}
        />
      </Panel>
    </div>
  );
}
