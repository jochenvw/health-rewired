import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-54.css';

export const meta: IdeaMeta = {
  id: '54',
  issue: 54,
  title: 'Detect immunotherapy side effects between visits',
  tagline: 'A triage worklist for nurses that combines symptoms, labs, notes and similar synthetic cases.',
};

type Tone = 'neutral' | 'ok' | 'warn' | 'crit' | 'info';
type Action = 'review' | 'call' | 'tests' | 'same-day' | 'dismiss';
type Section = 'worklist' | 'patient' | 'assistant' | 'decision' | 'low-risk';

type NetworkMatch = { similar: number; genuine: number; label: string };
type Symptom = { date: string; label: string; grade: number; source: string };
type Lab = { date: string; test: string; value: string; unit: string; flag: string };
type Note = { date: string; text: string; source: string };

type TriagePatient = {
  id: string;
  name: string;
  age: number;
  sex: string;
  diagnosis: string;
  last_visit: string;
  next_visit: string;
  source: string;
  priority: number;
  risk_label: string;
  risk_tone: 'ok' | 'warn' | 'crit';
  organ_signal: string;
  ctcae_grade: string;
  grade_rationale: string;
  protocol_step: string;
  network_match: NetworkMatch;
  symptoms: Symptom[];
  labs: Lab[];
  notes: Note[];
  draft_note: string;
};

type WorklistResponse = {
  synthetic: boolean;
  as_of: string;
  network_summary: { sites: number; checkpoint_patients: number; similar_patterns_checked: number; note: string };
  patients: TriagePatient[];
};

const HIGH_RISK_PATIENT_ID = 'IOT-5401';
const LOW_RISK_PATIENT_ID = 'IOT-5402';

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'Ranked worklist',
    explain: 'Between visits, the nurse opens a ranked list of checkpoint-immunotherapy patients with new signals.',
  },
  {
    id: 'patient',
    title: 'Open the myocarditis signal',
    explain: 'Mild symptoms become more important when they are combined with the interim troponin trend and notes.',
  },
  {
    id: 'assistant',
    title: 'Ask for triage synthesis',
    explain: 'The assistant checks symptoms, labs, notes and similar synthetic network outcomes, then proposes a grade.',
  },
  {
    id: 'decision',
    title: 'Human decision',
    explain: 'The nurse chooses whether to call, order tests or arrange same-day assessment. The AI does not contact anyone.',
  },
  {
    id: 'low-risk',
    title: 'Compare a low-risk report',
    explain: 'A second patient is explained as low-risk so the nurse can move on quickly without losing traceability.',
  },
];

const assistantStages: Stage[] = [
  { label: 'Reading symptom reports', detail: 'Digital questionnaires and telephone triage notes', ms: 650 },
  { label: 'Checking lab trends', detail: 'Troponin, ALT, bilirubin and thyroid series', ms: 750 },
  { label: 'Looking for outside-hospital signals', detail: 'Synthetic network encounter feed', ms: 700 },
  { label: 'Retrieving protocol step', detail: 'Immune-related toxicity triage protocol', ms: 650 },
  { label: 'Comparing similar synthetic cases', detail: 'Network outcomes; synthetic data only' },
];

function toneFor(patient: TriagePatient): Tone {
  return patient.risk_tone === 'crit' ? 'crit' : patient.risk_tone === 'warn' ? 'warn' : 'ok';
}

export default function Issue54ImmunotherapyTriage() {
  const [section, setSection] = useState<Section>('worklist');
  const [data, setData] = useState<WorklistResponse | null>(null);
  const [selectedId, setSelectedId] = useState(HIGH_RISK_PATIENT_ID);
  const [tab, setTab] = useState('evidence');
  const [action, setAction] = useState<Action>('review');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    api.idea<WorklistResponse>(54, '/worklist').then(setData).catch(() => setData(null));
  }, []);

  const patients = data?.patients ?? [];
  const selected = useMemo(
    () => patients.find((patient) => patient.id === selectedId) ?? patients[0],
    [patients, selectedId],
  );
  const storyStep = section;

  const go = (id: string, opts: { story?: boolean } = {}) => {
    const next = id as Section;
    if (next === 'low-risk') {
      setSelectedId(LOW_RISK_PATIENT_ID);
      setAction('dismiss');
      setTab('evidence');
    } else if (opts.story && next !== 'worklist') {
      setSelectedId(HIGH_RISK_PATIENT_ID);
      if (action === 'dismiss') setAction('review');
    }
    setSection(next);
  };

  const runAssistant = async (nextAction = action) => {
    if (!selected) return;
    setLoading(true);
    setStarted(true);
    setError(null);
    setResult(null);
    setFiled(false);
    setRuns((count) => count + 1);
    try {
      const response = await api.idea<AgentResult>(54, '/assistant', {
        method: 'POST',
        body: JSON.stringify({ patient_id: selected.id, action: nextAction }),
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assistant unavailable');
    } finally {
      setLoading(false);
    }
  };

  const chooseAction = (nextAction: Action) => {
    setAction(nextAction);
    setSection('decision');
    void runAssistant(nextAction);
  };

  return (
    <HospitalShell
      module="Immunotherapy toxicity triage"
      guide={
        <StoryGuide
          steps={story}
          current={storyStep}
          onGo={(id) => go(id, { story: true })}
          nextLabel={section === 'assistant' ? 'Choose triage action' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: 'Triage worklist', badge: patients.length || undefined },
        { id: 'patient', label: 'Combined evidence', badge: selected?.priority },
        { id: 'assistant', label: 'Assistant synthesis' },
        { id: 'decision', label: 'Nurse decision' },
        { id: 'low-risk', label: 'Low-risk example' },
      ]}
      active={section}
      onNav={(id) => go(id)}
      patient={
        selected
          ? {
              id: selected.id,
              name: selected.name,
              age: selected.age,
              sex: selected.sex,
              diagnosis: selected.diagnosis,
              ward: `Next visit ${selected.next_visit}`,
            }
          : null
      }
      toolbar={
        <>
          <label>
            Patient{' '}
            <select
              value={selected?.id ?? ''}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setSection('patient');
                setResult(null);
                setStarted(false);
              }}
            >
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.organ_signal}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <span className="issue54-disclaimer">Hackathon prototype · synthetic data · not for clinical use</span>
          <button type="button" className="hx-btn primary" disabled={!selected || loading} onClick={() => void runAssistant()}>
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Checking signals…
              </>
            ) : (
              'Run assistant review'
            )}
          </button>
        </>
      }
    >
      {!data && <Panel title="Loading synthetic triage worklist"><Working label="Loading issue-54 demo data" /></Panel>}
      {data && selected && section === 'worklist' && <Worklist data={data} selectedId={selected.id} onSelect={(patient) => { setSelectedId(patient.id); setSection('patient'); }} />}
      {data && selected && (section === 'patient' || section === 'low-risk') && (
        <PatientEvidence patient={selected} tab={tab} onTab={setTab} onReview={() => setSection('decision')} />
      )}
      {data && selected && section === 'assistant' && (
        <AssistantPanel
          patient={selected}
          result={result}
          error={error}
          loading={loading}
          started={started}
          runs={runs}
          onRun={() => void runAssistant()}
        />
      )}
      {data && selected && section === 'decision' && (
        <DecisionPanel
          patient={selected}
          action={action}
          result={result}
          error={error}
          loading={loading}
          started={started}
          runs={runs}
          filed={filed}
          onChoose={chooseAction}
          onFile={() => setFiled(true)}
        />
      )}
    </HospitalShell>
  );
}

function Worklist({ data, selectedId, onSelect }: { data: WorklistResponse; selectedId: string; onSelect: (patient: TriagePatient) => void }) {
  return (
    <div className="issue54-workspace">
      <Panel
        title={`Checkpoint-immunotherapy triage · ${new Date(data.as_of).toLocaleString('de-DE')}`}
        actions={<Pill tone="info">{data.network_summary.sites} synthetic sites connected</Pill>}
      >
        <DataTable
          rowKey={(patient) => patient.id}
          rows={data.patients}
          selected={selectedId}
          onSelect={onSelect}
          rowTone={(patient) => (patient.risk_tone === 'crit' ? 'crit' : patient.risk_tone === 'warn' ? 'warn' : undefined)}
          columns={[
            { key: 'priority', label: 'Rank', width: '58px', render: (patient) => <strong>{patient.priority}</strong> },
            { key: 'name', label: 'Patient', render: (patient) => <strong>{patient.name}</strong> },
            { key: 'diagnosis', label: 'Treatment' },
            { key: 'organ_signal', label: 'Signal' },
            { key: 'ctcae_grade', label: 'Proposed grade' },
            { key: 'risk_label', label: 'Triage', render: (patient) => <Pill tone={toneFor(patient)}>{patient.risk_label}</Pill> },
            { key: 'network', label: 'Synthetic network', render: (patient) => patient.network_match.label },
          ]}
        />
      </Panel>
      <Panel title="What this screen combines">
        <div className="issue54-summary-grid">
          <Metric label="Patients today" value={data.patients.length} />
          <Metric label="Checkpoint patients in network" value={data.network_summary.checkpoint_patients} />
          <Metric label="Similar patterns checked" value={data.network_summary.similar_patterns_checked} />
        </div>
        <p className="issue54-note">{data.network_summary.note}</p>
      </Panel>
    </div>
  );
}

function PatientEvidence({
  patient,
  tab,
  onTab,
  onReview,
}: {
  patient: TriagePatient;
  tab: string;
  onTab: (id: string) => void;
  onReview: () => void;
}) {
  return (
    <>
      <div className="issue54-alert-strip">
        <Pill tone={toneFor(patient)}>{patient.risk_label}</Pill>
        <strong>{patient.organ_signal}</strong>
        <span>{patient.ctcae_grade}</span>
        <span className="hx-spacer" />
        <span>{patient.network_match.label}</span>
      </div>
      <Tabs
        active={tab}
        onChange={onTab}
        tabs={[
          { id: 'evidence', label: 'Combined evidence' },
          { id: 'labs', label: 'Lab trends' },
          { id: 'protocol', label: 'Protocol & rationale' },
          { id: 'note', label: 'Draft note' },
        ]}
      />
      {tab === 'evidence' && (
        <div className="hx-grid">
          <Panel title="Symptoms and notes">
            <DataTable
              rowKey={(item) => `${item.date}-${item.label}`}
              rows={patient.symptoms}
              rowTone={(item) => (item.grade >= 2 ? 'warn' : undefined)}
              columns={[
                { key: 'date', label: 'Date', width: '96px' },
                { key: 'label', label: 'Finding' },
                { key: 'grade', label: 'CTCAE', render: (item) => <Pill tone={item.grade >= 2 ? 'warn' : 'neutral'}>G{item.grade}</Pill> },
                { key: 'source', label: 'Source' },
              ]}
            />
            <ul className="issue54-note-list">
              {patient.notes.map((note) => (
                <li key={`${note.date}-${note.text}`}>
                  <strong>{note.date}</strong> · {note.text} <span>({note.source})</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Why it is ranked here">
            <p>{patient.grade_rationale}</p>
            <div className="issue54-network-card">
              <span>{patient.network_match.genuine}</span>
              <div>
                <strong>of {patient.network_match.similar} similar synthetic patterns</strong>
                <p>represented genuine toxicity in the synthetic network.</p>
              </div>
            </div>
          </Panel>
        </div>
      )}
      {tab === 'labs' && <LabTrend patient={patient} />}
      {tab === 'protocol' && (
        <Panel title="Protocol step retrieved for the nurse">
          <p>{patient.protocol_step}</p>
          <p className="issue54-note">The prototype proposes a step; pausing treatment, medication and assessment remain clinician decisions.</p>
        </Panel>
      )}
      {tab === 'note' && (
        <Panel title="Draft triage note for review">
          <p>{patient.draft_note}</p>
          <button type="button" className="hx-btn primary" onClick={onReview}>Review before filing</button>
        </Panel>
      )}
    </>
  );
}

function LabTrend({ patient }: { patient: TriagePatient }) {
  return (
    <Panel title="Longitudinal lab signals">
      <DataTable
        rowKey={(lab) => `${lab.date}-${lab.test}-${lab.value}`}
        rows={patient.labs}
        rowTone={(lab) => (lab.flag !== 'normal' ? 'warn' : undefined)}
        columns={[
          { key: 'date', label: 'Date' },
          { key: 'test', label: 'Test' },
          { key: 'value', label: 'Result', render: (lab) => <strong>{lab.value} {lab.unit}</strong> },
          { key: 'flag', label: 'Flag', render: (lab) => <Pill tone={lab.flag === 'normal' ? 'ok' : 'warn'}>{lab.flag}</Pill> },
          { key: 'trend', label: 'Trend', render: (lab) => <span className={`issue54-trend ${lab.flag !== 'normal' ? 'high' : ''}`} /> },
        ]}
      />
    </Panel>
  );
}

function AssistantPanel({
  patient,
  result,
  error,
  loading,
  started,
  runs,
  onRun,
}: {
  patient: TriagePatient;
  result: AgentResult | null;
  error: string | null;
  loading: boolean;
  started: boolean;
  runs: number;
  onRun: () => void;
}) {
  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 2fr)' }}>
      <Panel title="Assistant request">
        <p>Ask the assistant to combine scattered evidence for <strong>{patient.name}</strong>.</p>
        <ul className="issue54-note-list">
          <li>Symptoms: {patient.symptoms.length} entries</li>
          <li>Labs: {patient.labs.length} results including troponin/liver/thyroid where available</li>
          <li>Notes/encounters: {patient.notes.length} synthetic notes</li>
          <li>Network comparison: {patient.network_match.label}</li>
        </ul>
        <button type="button" className="hx-btn primary" disabled={loading} onClick={onRun}>
          {loading ? <><span className="hx-spinner" aria-hidden /> Assistant is checking…</> : 'Run assistant synthesis'}
        </button>
      </Panel>
      <AgentOutput result={result} error={error} loading={loading} started={started} runs={runs} />
    </div>
  );
}

function DecisionPanel({
  patient,
  action,
  result,
  error,
  loading,
  started,
  runs,
  filed,
  onChoose,
  onFile,
}: {
  patient: TriagePatient;
  action: Action;
  result: AgentResult | null;
  error: string | null;
  loading: boolean;
  started: boolean;
  runs: number;
  filed: boolean;
  onChoose: (action: Action) => void;
  onFile: () => void;
}) {
  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(300px, 0.9fr) minmax(460px, 1.6fr)' }}>
      <Panel title="Nurse chooses the action">
        <p><strong>{patient.organ_signal}</strong> · {patient.ctcae_grade}</p>
        <div className="issue54-actions">
          <button type="button" className="hx-btn" onClick={() => onChoose('call')}>Call patient</button>
          <button type="button" className="hx-btn" onClick={() => onChoose('tests')}>Order repeat tests</button>
          <button type="button" className="hx-btn primary" onClick={() => onChoose('same-day')}>Arrange same-day assessment</button>
          <button type="button" className="hx-btn" onClick={() => onChoose('dismiss')}>Mark low-risk</button>
        </div>
        <p className="issue54-note">Selected: <strong>{action}</strong>. AI never contacts the patient or stops therapy independently.</p>
        <button type="button" className="hx-btn primary" disabled={!result || filed} onClick={onFile}>
          {filed ? 'Filed to chart ✓' : 'Review & file triage note'}
        </button>
      </Panel>
      <AgentOutput result={result} error={error} loading={loading} started={started} runs={runs} />
    </div>
  );
}

function AgentOutput({ result, error, loading, started, runs }: { result: AgentResult | null; error: string | null; loading: boolean; started: boolean; runs: number }) {
  return (
    <Panel
      title={result ? result.headline : 'Assistant synthesis'}
      actions={result && <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>}
    >
      {error && <p className="error">{error}</p>}
      <Backstage
        key={runs}
        title="Behind the scenes – signal detection"
        stages={assistantStages}
        running={started}
        holdLast
        release={!loading}
        note="Shown so clinicians can see the mechanism. All data and network outcomes are synthetic."
      />
      {!started && <span className="hx-empty">Run the assistant to see the proposed grade, protocol step and draft note.</span>}
      {result && (
        <div className="result">
          {result.note && <p className="note">{result.note}</p>}
          {result.trace.length > 0 && (
            <ol className="trace" aria-label="Assistant trace">
              {result.trace.map((step, index) => <li key={index}>{step.tool}</li>)}
            </ol>
          )}
          <div className="blocks">
            {result.blocks.map((block, index) => <RenderBlock key={index} block={block} />)}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="issue54-metric">
      <strong>{value.toLocaleString('de-DE')}</strong>
      <span>{label}</span>
    </div>
  );
}
