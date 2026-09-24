import { useEffect, useState } from 'react';
import { api, type AgentResult, type PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-37.css';

export const meta: IdeaMeta = {
  id: '37',
  issue: 37,
  title: 'Patients like mine, across Europe',
  tagline: "For a patient who doesn't fit any trial, see how comparable patients across Europe were treated and what happened to them.",
};

const PATIENT_ID = 'P-002';

const APPROACHES = [
  { id: 'biopsy_or_liquid_first', label: 'Confirm with (liquid) biopsy before changing therapy' },
  { id: 'continue_tki_watchful', label: 'Continue current targeted therapy, watchful imaging' },
  { id: 'local_ablative_add', label: 'Local ablative treatment to the new site, continue therapy' },
  { id: 'switch_systemic', label: 'Switch systemic therapy without confirming the new finding first' },
] as const;

type Section = 'worklist' | 'chart' | 'network' | 'decide';

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'Morning worklist',
    explain: "Markus Huber's case doesn't fit any trial: a new, indeterminate nodule after a partial response. Open his chart.",
  },
  {
    id: 'chart',
    title: 'Review the chart',
    explain: 'EGFR-mutant lung cancer, responding — until this new finding. No local experience says what to do next.',
  },
  {
    id: 'network',
    title: 'Ask the European network',
    explain: 'The assistant sends a structured, privacy-preserving query to a simulated network of hospitals across Europe.',
  },
  {
    id: 'decide',
    title: 'Decide & feed back',
    explain: 'You and the patient decide. Recording the outcome helps the next clinician who sees someone like him.',
  },
];

const networkStages: Stage[] = [
  { label: 'Turning the profile into a comparability query', detail: 'Lung adenocarcinoma · EGFR exon 19 deletion · oligometastatic', ms: 700 },
  { label: 'Querying the network — each hospital searches locally', detail: 'Only counts and summaries leave each site, never raw records', ms: 900 },
  { label: 'Charité Berlin · AKH Wien · Gustave Roussy · 6 more sites responding', ms: 900 },
  { label: 'Grouping comparable patients by the approach they received', ms: 800 },
  { label: 'Checking whether the evidence is strong enough to lean on', detail: 'Cohort size, hospital spread, follow-up length' },
];

export default function EuropeanLearningNetwork() {
  const [section, setSection] = useState<Section>('worklist');
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [logCount, setLogCount] = useState(0);

  useEffect(() => {
    api.patient(PATIENT_ID).then(setRecord).catch(() => setRecord(null));
    refreshLog();
  }, []);

  const refreshLog = () => {
    fetch('/api/ideas/37/log')
      .then((r) => r.json())
      .then((entries: unknown[]) => setLogCount(entries.length))
      .catch(() => undefined);
  };

  const askNetwork = async () => {
    setRuns((n) => n + 1);
    setResult(null);
    setError(null);
    setLoading(true);
    setStarted(true);
    try {
      const response = await fetch('/api/ideas/37/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'Find patients like mine across the European network, show the treatment approaches taken and what happened, and flag weak evidence.',
          patient_id: PATIENT_ID,
        }),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      setResult(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The network query could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const flagged = record?.labs.filter((l) => l.flag).length ?? 0;

  return (
    <HospitalShell
      module="Molecular tumour board · European network"
      guide={<StoryGuide steps={story} current={section} onGo={(id) => setSection(id as Section)} />}
      nav={[
        { id: 'worklist', label: 'Clinic worklist' },
        { id: 'chart', label: 'Patient chart', badge: flagged || undefined },
        { id: 'network', label: 'Patients like mine' },
        { id: 'decide', label: 'Decide & feed back', badge: logCount || undefined },
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
              diagnosis: `${record.diagnosis.primary} · ${record.diagnosis.stage}`,
            }
      }
      toolbar={
        section !== 'worklist' && (
          <>
            <span className="hx-spacer" />
            <button type="button" className="hx-btn primary" onClick={() => setSection('network')}>
              Find patients like mine
            </button>
          </>
        )
      }
    >
      {section === 'worklist' && (
        <Panel title="Molecular tumour board worklist">
          <DataTable
            rowKey={(r) => r.id}
            rows={[
              { id: 'P-002', name: 'Markus Huber', dx: 'NSCLC, EGFR exon 19del, IVA', reason: 'New indeterminate nodule after response', status: 'Needs discussion' },
              { id: 'X-114', name: 'Klaus Hoffmann', dx: 'NSCLC stage IV', reason: 'Routine follow-up', status: 'Scheduled' },
              { id: 'X-207', name: 'Sabine Kraus', dx: 'Ovarian ca. FIGO IIIC', reason: 'Consent discussion', status: 'Scheduled' },
            ]}
            selected={record?.id}
            onSelect={(r) => (r.id === 'P-002' ? setSection('chart') : setSection('worklist'))}
            columns={[
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'reason', label: 'Reason for board' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <Pill tone={r.status === 'Needs discussion' ? 'crit' : 'neutral'}>{r.status}</Pill>,
              },
            ]}
          />
        </Panel>
      )}
      {section === 'chart' && (record ? <Chart record={record} /> : <Panel title="Patient chart">Loading…</Panel>)}
      {section === 'network' && (
        <NetworkPanel
          key={runs}
          started={started}
          loading={loading}
          error={error}
          result={result}
          onAsk={askNetwork}
        />
      )}
      {section === 'decide' && <DecidePanel onRecorded={refreshLog} logCount={logCount} />}
    </HospitalShell>
  );
}

function Chart({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState('summary');
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'imaging', label: `Imaging (${record.imaging?.length ?? 0})` },
          { id: 'therapy', label: 'Therapy' },
          { id: 'history', label: 'History' },
        ]}
      />
      {tab === 'summary' && (
        <div className="hx-grid">
          <Panel title="Diagnosis">
            <dl className="hx-facts">
              <dt>Primary</dt>
              <dd>{record.diagnosis.primary}</dd>
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
          <Panel title="Why this case doesn't fit a trial">
            {record.open_questions.length === 0 ? (
              <span className="hx-empty">None recorded.</span>
            ) : (
              record.open_questions.map((q) => (
                <p key={q} style={{ margin: '0 0 6px' }}>
                  <Pill tone="crit">Open</Pill> {q}
                </p>
              ))
            )}
          </Panel>
        </div>
      )}
      {tab === 'imaging' && (
        <Panel title="Imaging">
          <DataTable
            rowKey={(i) => `${i.date}-${i.modality}`}
            rows={record.imaging ?? []}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'modality', label: 'Modality' },
              { key: 'result', label: 'Result' },
            ]}
          />
        </Panel>
      )}
      {tab === 'therapy' && (
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

function NetworkPanel({
  started,
  loading,
  error,
  result,
  onAsk,
}: {
  started: boolean;
  loading: boolean;
  error: string | null;
  result: AgentResult | null;
  onAsk: () => void;
}) {
  return (
    <Panel
      title={result ? result.headline : 'Patients like mine, across the European network'}
      actions={
        <button type="button" className="hx-btn primary" disabled={loading} onClick={onAsk}>
          {loading ? (
            <>
              <span className="hx-spinner" aria-hidden /> Querying the network…
            </>
          ) : (
            'Find patients like mine'
          )}
        </button>
      }
    >
      {error && <p className="error">{error}</p>}
      <Backstage
        title="Behind the scenes – the simulated European network"
        stages={networkStages}
        running={started}
        holdLast
        release={!loading}
        note="No raw patient record leaves a hospital – each site only ever returns counts and summaries."
      />
      {!result && !error && !started && (
        <span className="hx-empty">Click "Find patients like mine" to query the simulated network.</span>
      )}
      {result && (
        <div className="result" aria-live="polite">
          {result.note && <p className="note">{result.note}</p>}
          <div className="blocks">
            {result.blocks.map((block, index) => (
              <RenderBlock key={index} block={block} />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function DecidePanel({ onRecorded, logCount }: { onRecorded: () => void; logCount: number }) {
  const [approach, setApproach] = useState<(typeof APPROACHES)[number]['id']>('biopsy_or_liquid_first');
  const [treatment, setTreatment] = useState('Liquid biopsy for resistance mutations; continue osimertinib pending results.');
  const [outcome, setOutcome] = useState('Outcome not yet known – following up at 8 weeks.');
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);

  const record = async () => {
    setBusy(true);
    try {
      await fetch('/api/ideas/37/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: PATIENT_ID,
          approach_category: approach,
          chosen_treatment: treatment,
          outcome_note: outcome,
        }),
      });
      setRecorded(true);
      onRecorded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1fr)' }}>
      <Panel title="The oncologist's and patient's decision">
        <form className="agent-form" onSubmit={(e) => e.preventDefault()}>
          <label>
            Approach chosen
            <select value={approach} onChange={(e) => setApproach(e.target.value as typeof approach)}>
              {APPROACHES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            What was decided
            <textarea value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={3} />
          </label>
          <label>
            Outcome so far
            <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} />
          </label>
          <button
            type="button"
            className="hx-btn primary"
            disabled={busy || recorded}
            onClick={record}
          >
            {recorded ? 'Fed back to the network ✓' : busy ? 'Recording…' : 'Record for the network'}
          </button>
        </form>
      </Panel>
      <Panel title="Shared learning system">
        <p className="prose">
          Nothing is shared until you record it here. Once confirmed, this case joins the same aggregated pool the
          network just queried – so the next clinician who sees a patient like Markus benefits from what happened to
          him.
        </p>
        <p className="prose">
          <strong>{logCount}</strong> outcome{logCount === 1 ? '' : 's'} recorded to the simulated network learning
          system so far in this session.
        </p>
      </Panel>
    </div>
  );
}
