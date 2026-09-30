import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type PatientRecord, type PatientSummary, type UIItem } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '34',
  issue: 34,
  title: 'AI pre-board tumour board analysis',
  tagline:
    'Specialist AI agents debate a complex case the evening before tumour board, so contradictions surface before the meeting.',
};

// This prototype prepares one complex, hardcoded case end to end.
const COMPLEX_PATIENT_ID = 'P-001';

// A realistic tumour board worklist for tomorrow; only the complex case (P-001) opens a full chart.
const worklistSlots = [
  { time: '08:30', id: COMPLEX_PATIENT_ID, name: undefined as string | undefined, dx: undefined as string | undefined, note: 'Neoadjuvant, HER2 result pending', complex: true },
  { time: '08:45', id: 'P-002', name: undefined, dx: undefined, note: 'New nodule on surveillance CT', complex: false },
  { time: '09:00', id: 'P-003', name: undefined, dx: undefined, note: 'Rising CEA in surveillance', complex: false },
  { time: '09:15', id: 'X-514', name: 'Hannelore Fischer', dx: 'Pancreatic ca. cT3N1', note: 'New referral, imaging only', complex: false },
];

type Section = 'worklist' | 'case' | 'analysis';

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: "Tomorrow's tumour board",
    explain: 'The worklist for tomorrow. Anna Berger is flagged complex – open her case to prepare it tonight.',
  },
  {
    id: 'case',
    title: 'Review the case',
    explain: 'The record as it stands: luminal B breast cancer with an equivocal HER2 result still pending ISH.',
  },
  {
    id: 'analysis',
    title: 'Convene the AI specialists',
    explain:
      'Six specialists state a hypothesis, challenge each other directly, then converge into a consensus board.',
  },
];

const debateStages: Stage[] = [
  { label: 'Six specialists forming initial hypotheses', detail: 'Oncologist, radiologist, pathologist, molecular, trial, RWE', ms: 700 },
  { label: 'Molecular specialist checking outstanding testing', detail: 'HER2 ISH not yet resulted', ms: 700 },
  { label: 'Trial specialist screening trials.csv against toxicity grade', detail: 'find_similar_patients("breast")', ms: 800 },
  { label: 'Challenge round: specialists contesting each other\u2019s evidence', detail: 'Naming who challenges whom, and why', ms: 900 },
  { label: 'Converging into the consensus board', detail: 'Agreed · disputed · missing · human decision' },
];

export default function TumourBoardAgent() {
  const [section, setSection] = useState<Section>('worklist');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId] = useState(COMPLEX_PATIENT_ID);
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    api.patients().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    api.patient(patientId).then(setRecord).catch(() => setRecord(null));
  }, [patientId]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const rows = worklistSlots.map((s) => ({
    ...s,
    name: s.name ?? byId.get(s.id)?.name ?? s.id,
    dx: s.dx ?? byId.get(s.id)?.diagnosis ?? '',
  }));

  const openCase = (id: string) => {
    if (id !== COMPLEX_PATIENT_ID) {
      setNotice('This prototype prepares one complex case end to end: Anna Berger (P-001), highlighted above.');
      return;
    }
    setNotice(null);
    setSection('case');
  };

  return (
    <HospitalShell
      module="Tumour board preparation"
      guide={
        <StoryGuide
          steps={story}
          current={section}
          onGo={(id) => {
            if (id !== 'worklist' && !record) {
              setNotice("Open Anna Berger's case first.");
              return;
            }
            setNotice(null);
            setSection(id as Section);
          }}
          nextLabel={section === 'worklist' ? 'Open Anna Berger' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: "Tomorrow's board", badge: worklistSlots.length },
        { id: 'case', label: 'Case chart' },
        { id: 'analysis', label: 'AI pre-board analysis', badge: hasResult ? '✓' : undefined },
      ]}
      active={section}
      onNav={(id) => (id === 'worklist' ? setSection('worklist') : record ? setSection(id as Section) : openCase(COMPLEX_PATIENT_ID))}
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
          <span>Munich Breast Tumour Board · Wed 09:15 · MDT room</span>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn primary" onClick={() => (record ? setSection('analysis') : openCase(COMPLEX_PATIENT_ID))}>
            Prepare AI pre-board analysis
          </button>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}
      {section === 'worklist' && (
        <Panel title={`Tumour board worklist · ${new Date().toLocaleDateString('de-DE')}`}>
          <span className="hx-eyebrow">Where am I · tomorrow&rsquo;s MDT worklist</span>
          <DataTable
            rowKey={(r) => r.id}
            rows={rows}
            selected={patientId}
            onSelect={(r) => openCase(r.id)}
            rowTone={(r) => (r.complex ? 'warn' : undefined)}
            columns={[
              { key: 'time', label: 'Time', width: '70px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'note', label: 'Prep note' },
              {
                key: 'complex',
                label: 'Status',
                render: (r) => (r.complex ? <Pill tone="warn">Complex – prepare tonight</Pill> : <Pill tone="neutral">Routine</Pill>),
              },
            ]}
          />
        </Panel>
      )}
      {section === 'case' &&
        (record ? <CaseChart record={record} /> : <Panel title="Patient chart">Loading…</Panel>)}
      {section === 'analysis' && (
        <Analysis patientId={patientId} onResult={setHasResult} debateStages={debateStages} />
      )}
    </HospitalShell>
  );
}

function CaseChart({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState('summary');
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'results', label: `Results (${record.labs.length})` },
          { id: 'reported', label: 'Patient-reported' },
          { id: 'history', label: 'Clinical course' },
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
          <Panel title="Open questions">
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
            rowTone={(l) => (l.flag ? (l.flag === 'high' ? 'crit' : 'warn') : undefined)}
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
            ]}
          />
        </Panel>
      )}
      {tab === 'reported' && (
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

function Analysis({
  patientId,
  onResult,
  debateStages,
}: {
  patientId: string;
  onResult: (has: boolean) => void;
  debateStages: Stage[];
}) {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);

  const counts = useMemo(() => {
    const items: UIItem[] = result?.blocks.flatMap((b) => b.items) ?? [];
    if (items.length === 0) return null;
    const tally = { agreed: 0, disputed: 0, missing: 0, humanDecision: 0 };
    for (const item of items) {
      if (item.group === 'agreed') tally.agreed += 1;
      else if (item.group === 'disputed') tally.disputed += 1;
      else if (item.group === 'missing') tally.missing += 1;
      else if (item.group === 'human_decision') tally.humanDecision += 1;
    }
    return tally;
  }, [result]);

  const run = async () => {
    setRuns((n) => n + 1);
    setResult(null);
    onResult(false);
    setLoading(true);
    setStarted(true);
    setError(null);
    try {
      const outcome = await api.runIdeaAgent('/api/ideas/34/analyze', {
        task: 'Prepare an AI pre-board analysis for tomorrow\u2019s tumour board.',
        patient_id: patientId,
        role: 'MDT coordinator',
      });
      setResult(outcome);
      onResult(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI specialists could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel
      title={result ? result.headline : 'AI pre-board analysis'}
      actions={
        <>
          {result && (
            <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>
          )}
          <button type="button" className="hx-btn primary" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Specialists are debating…
              </>
            ) : result ? (
              'Run again'
            ) : (
              'Prepare AI pre-board analysis'
            )}
          </button>
        </>
      }
    >
      <span className="hx-eyebrow">Current task · convene the six specialists, then converge to a consensus board</span>
      {error && <p className="error">{error}</p>}
      <Backstage
        key={runs}
        title="Behind the scenes – the specialist debate"
        stages={debateStages}
        running={started}
        holdLast
        release={!loading}
        note="Six specialist personas (oncologist, radiologist, pathologist, molecular, trial, real-world-evidence) are one Copilot SDK agent reasoning through six angles, then a fixed demo debate without a token."
      />
      {!result && !error && !started && (
        <span className="hx-empty">
          Click "Prepare AI pre-board analysis" to convene the specialists. Nothing is decided until the tumour board
          reviews it.
        </span>
      )}
      {result && (
        <div className="result" aria-live="polite">
          {result.note && <p className="note">{result.note}</p>}
          {counts && (
            <div
              className={`hx-attention ${counts.disputed > 0 ? 'hx-attention-crit' : counts.missing > 0 ? 'hx-attention-warn' : 'hx-attention-ok'}`}
              role="status"
            >
              <strong>What needs attention:</strong>
              <span>
                {counts.agreed} agreed · {counts.disputed} still disputed · {counts.missing} missing before MDT ·{' '}
                {counts.humanDecision} for the board to decide
              </span>
            </div>
          )}
          {result.trace.length > 0 && (
            <ol className="trace" aria-label="What the specialists looked at">
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
          <p className="hint">
            The tumour board owns the diagnosis, treatment decision and conversation with the patient. Approve, edit or
            dismiss each proposed point above before it goes into the meeting brief.
          </p>
        </div>
      )}
    </Panel>
  );
}
