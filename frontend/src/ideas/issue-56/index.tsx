import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type AgentResult, type Issue56Scenario, type Issue56Severity, type Issue56WorklistRow } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './style.css';

export const meta: IdeaMeta = {
  id: '56',
  issue: 56,
  title: 'The cancer patient in the ICU',
  tagline: 'At 2am, the intensivist sees the oncology context, similar-patient outcomes and a handover draft in one place.',
};

type Severity = Issue56Severity;
type WorklistRow = Issue56WorklistRow;
type Scenario = Issue56Scenario;

type Section = 'worklist' | 'card' | 'outcomes' | 'decision' | 'followup';

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'ICU worklist',
    explain: 'It is 02:07. Open the new cancer-patient call from surgical ward 7C.',
  },
  {
    id: 'card',
    title: 'Onco-ICU card',
    explain: 'The assistant compiles oncology context from separate synthetic sources and flags what is missing.',
  },
  {
    id: 'outcomes',
    title: 'Similar patients',
    explain: 'Hospitals return only aggregate counts: data stays, insights travel. Uncertainty stays visible.',
  },
  {
    id: 'decision',
    title: 'Human judgement',
    explain: 'The screen informs the ICU discussion. It does not decide admission, limits or family communication.',
  },
  {
    id: 'followup',
    title: 'Oncology follow-up',
    explain: 'After admission, review and edit the handover message before it is sent to oncology.',
  },
];

const compileStages: Stage[] = [
  { label: 'Opening oncology clinic letter', detail: 'Treatment response, planned systemic therapy, family contact', ms: 800 },
  { label: 'Reading pathology and surgery context', detail: 'pT4a pN2b, margins clear, liver disease remains', ms: 800 },
  { label: 'Checking treatment plan and ICU vitals', detail: 'No current cytotoxic therapy; shock physiology from ward call', ms: 900 },
  { label: 'Looking for treatment-wishes documentation', detail: 'Verbal preference found; signed limitation note missing', ms: 900 },
  { label: 'Rendering the Onco-ICU card', detail: 'Summary, reversible causes, missing information', ms: 900 },
];

const outcomeStages: Stage[] = [
  { label: 'Preparing a federated cohort question', detail: 'Solid tumour, sepsis/respiratory failure, SOFA 7-11', ms: 800 },
  { label: 'Querying Klinikum Rewired München', detail: '46 matching synthetic ICU stays; no row-level data leaves site', ms: 700 },
  { label: 'Querying connected hospitals', detail: 'Charité, Karolinska and Institut Curie synthetic nodes return counts', ms: 900 },
  { label: 'Combining uncertainty ranges', detail: '167 aggregated stays, shown as intervals not a decision rule', ms: 900 },
];

export default function Issue56OncoIcu() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [section, setSection] = useState<Section>('worklist');
  const [selectedId, setSelectedId] = useState('P-056');
  const [cardCompiled, setCardCompiled] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [outcomesRunning, setOutcomesRunning] = useState(false);
  const [outcomesDone, setOutcomesDone] = useState(false);
  const [outcomeRun, setOutcomeRun] = useState(0);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .issue56Scenario()
      .then((data) => {
        setScenario(data);
        setDraft(data.follow_up.draft);
      })
      .catch(() => setNotice('Could not load the synthetic Onco-ICU scenario.'));
  }, []);

  const selected = useMemo(
    () =>
      scenario?.worklist.find((row) => row.patient_id === selectedId) ??
      scenario?.worklist.find((row) => row.patient_id === 'P-056') ??
      scenario?.worklist[0],
    [scenario, selectedId],
  );

  const openCase = (row: WorklistRow) => {
    if (row.patient_id !== 'P-056') {
      setNotice('This row gives the worklist context. Open Emil Schneider for the Onco-ICU prototype.');
      return;
    }
    setNotice(null);
    setSelectedId(row.patient_id);
    setSection('card');
  };

  const compileCard = async () => {
    if (compiling) return;
    setCompiling(true);
    setAgentResult(null);
    setCardCompiled(false);
    setNotice(null);
    try {
      const result = await api.issue56Agent({
        task: 'Compile the Onco-ICU card and handover context for the night ICU consultation.',
        patient_id: 'P-056',
        role: 'On-call intensivist',
      });
      setAgentResult(result);
      setCardCompiled(true);
    } catch {
      setNotice('Assistant could not be reached. Showing the deterministic card.');
      setCardCompiled(true);
    } finally {
      setCompiling(false);
    }
  };

  const startOutcomes = () => {
    setOutcomesRunning(true);
    setOutcomesDone(false);
    setOutcomeRun((run) => run + 1);
  };

  const go = (id: string) => {
    const next = id as Section;
    setSection(next);
    if (next === 'card' && !cardCompiled && !compiling) void compileCard();
    if (next === 'outcomes' && !outcomesRunning && !outcomesDone) startOutcomes();
  };

  if (!scenario || !selected) {
    return (
      <HospitalShell module="Onco-ICU consult" nav={[]} active="loading" onNav={() => undefined}>
        <Panel title="Loading Onco-ICU scenario">
          <Working label="Loading synthetic ICU and oncology data" />
        </Panel>
      </HospitalShell>
    );
  }

  return (
    <HospitalShell
      module="Onco-ICU consult"
      guide={<StoryGuide steps={story} current={section} onGo={go} nextLabel={nextLabel(section)} />}
      nav={[
        { id: 'worklist', label: 'Night ICU worklist', badge: scenario.worklist.length },
        { id: 'card', label: 'Onco-ICU card', badge: scenario.onco_icu_card.missing_information.length },
        { id: 'outcomes', label: 'Similar outcomes', badge: outcomesDone ? scenario.outcomes.aggregate.matched : undefined },
        { id: 'decision', label: 'Human judgement' },
        { id: 'followup', label: 'Oncology follow-up' },
      ]}
      active={section}
      onNav={go}
      patient={{
        id: selected.patient_id,
        name: selected.name,
        age: selected.age,
        sex: 'male',
        diagnosis: scenario.onco_icu_card.tumour,
        ward: `${selected.ward} · ${selected.reason}`,
        allergies: 'NKDA recorded',
      }}
      toolbar={
        <>
          <label>
            ICU call{' '}
            <select
              value={selectedId}
              onChange={(event) => {
                const row = scenario.worklist.find((item) => item.patient_id === event.target.value);
                if (row) openCase(row);
              }}
            >
              {scenario.worklist.map((row) => (
                <option key={row.patient_id} value={row.patient_id}>
                  {row.time} · {row.name} · SOFA {row.sofa}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <Pill tone="warn">Night consult</Pill>
          <Pill tone="info">Hackathon prototype – synthetic data – not for clinical use</Pill>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}
      {section === 'worklist' && <Worklist rows={scenario.worklist} selected={selectedId} onSelect={openCase} />}
      {section === 'card' && (
        <OncoIcuCard
          scenario={scenario}
          compiling={compiling}
          compiled={cardCompiled}
          agentResult={agentResult}
          onCompile={compileCard}
        />
      )}
      {section === 'outcomes' && (
        <Outcomes
          scenario={scenario}
          running={outcomesRunning}
          done={outcomesDone}
          runKey={outcomeRun}
          onStart={startOutcomes}
          onDone={() => setOutcomesDone(true)}
        />
      )}
      {section === 'decision' && <Decision scenario={scenario} />}
      {section === 'followup' && (
        <FollowUp scenario={scenario} draft={draft} sent={sent} onDraft={setDraft} onSubmit={() => setSent(true)} />
      )}
    </HospitalShell>
  );
}

function nextLabel(section: Section) {
  if (section === 'worklist') return 'Open Emil Schneider';
  if (section === 'card') return 'Request similar outcomes';
  if (section === 'outcomes') return 'Review human decisions';
  if (section === 'decision') return 'Draft oncology follow-up';
  return undefined;
}

function tone(severity: Severity) {
  if (severity === 'critical') return 'crit';
  if (severity === 'warning') return 'warn';
  return 'info';
}

function Worklist({ rows, selected, onSelect }: { rows: WorklistRow[]; selected: string; onSelect: (row: WorklistRow) => void }) {
  return (
    <Panel title="ICU consultation worklist · 00:00–03:00 · surgical/oncology alerts">
      <DataTable
        rowKey={(row) => row.patient_id}
        rows={rows}
        selected={selected}
        onSelect={onSelect}
        rowTone={(row) => (row.patient_id === 'P-056' ? 'crit' : row.sofa >= 7 ? 'warn' : undefined)}
        columns={[
          { key: 'time', label: 'Time', width: '60px' },
          { key: 'name', label: 'Patient', render: (row) => <strong>{row.name}</strong> },
          { key: 'age', label: 'Age', width: '48px' },
          { key: 'ward', label: 'Location' },
          { key: 'reason', label: 'Reason for ICU call' },
          { key: 'sofa', label: 'SOFA', render: (row) => <Pill tone={row.sofa >= 8 ? 'crit' : 'warn'}>{row.sofa}</Pill> },
          { key: 'status', label: 'Status', render: (row) => <Pill tone={row.patient_id === 'P-056' ? 'crit' : 'neutral'}>{row.status}</Pill> },
        ]}
      />
      <p className="issue56-note">Click Emil Schneider to open the night-time Onco-ICU scenario.</p>
    </Panel>
  );
}

function OncoIcuCard({
  scenario,
  compiling,
  compiled,
  agentResult,
  onCompile,
}: {
  scenario: Scenario;
  compiling: boolean;
  compiled: boolean;
  agentResult: AgentResult | null;
  onCompile: () => void;
}) {
  const [tab, setTab] = useState('card');
  const card = scenario.onco_icu_card;
  return (
    <div className="issue56-two-col">
      <div>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'card', label: 'Onco-ICU card' },
            { id: 'sources', label: 'Sources' },
            { id: 'physiology', label: 'ICU physiology' },
          ]}
        />
        {tab === 'card' && (
          <Panel
            title="Onco-ICU card · compiled from synthetic sources"
            actions={
              <button type="button" className="hx-btn primary" disabled={compiling} onClick={onCompile}>
                {compiling ? <><span className="hx-spinner" aria-hidden /> Compiling…</> : compiled ? 'Compile again' : 'Compile Onco-ICU card'}
              </button>
            }
          >
            <dl className="hx-facts issue56-card-facts">
              <dt>Tumour and stage</dt>
              <dd>{card.tumour}<br />{card.stage}</dd>
              <dt>Current treatment</dt>
              <dd>{card.current_treatment}</dd>
              <dt>Response so far</dt>
              <dd>{card.response}</dd>
              <dt>Planned next treatment</dt>
              <dd>{card.planned_next_treatment}</dd>
              <dt>Treatment wishes</dt>
              <dd>{card.wishes}</dd>
            </dl>
            <div className="issue56-alert-list">
              {card.missing_information.map((item) => (
                <p key={item}><Pill tone="crit">Missing</Pill> {item}</p>
              ))}
            </div>
          </Panel>
        )}
        {tab === 'sources' && (
          <Panel title="Synthetic sources read by the assistant">
            <DataTable
              rowKey={(source) => source.path}
              rows={scenario.sources}
              columns={[
                { key: 'name', label: 'Source', render: (source) => <strong>{source.name}</strong> },
                { key: 'status', label: 'Status', render: (source) => <Pill tone={source.status === 'partial' ? 'warn' : 'ok'}>{source.status}</Pill> },
                { key: 'finding', label: 'Finding' },
                { key: 'path', label: 'Synthetic file' },
              ]}
            />
          </Panel>
        )}
        {tab === 'physiology' && (
          <div className="hx-grid">
            <Panel title="ICU call physiology">
              <div className="issue56-vitals">
                {scenario.icu.vitals.map((vital) => (
                  <div key={vital.label} className={`issue56-vital ${vital.severity}`}>
                    <span>{vital.label}</span>
                    <strong>{vital.value}</strong>
                    <small>{vital.detail}</small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Treatment-related or cancer-related causes to consider">
              {scenario.icu.possible_causes.map((cause) => (
                <p key={cause.cause} className="issue56-cause">
                  <Pill tone={tone(cause.severity)}>{cause.cause}</Pill><br />
                  {cause.why}<br />
                  <small>{cause.source}</small>
                </p>
              ))}
            </Panel>
          </div>
        )}
      </div>
      <Panel title="Behind the scenes and assistant output">
        <Backstage
          key={compiling ? 'running' : compiled ? 'done' : 'idle'}
          title="Compiling from separate oncology and ICU sources"
          stages={compileStages}
          running={compiling || compiled}
          holdLast
          release={!compiling}
          note="In a real deployment the assistant would retrieve from connected systems; here every source is synthetic sample data."
        />
        {!compiled && !compiling && <span className="hx-empty">Click Compile to watch the assistant assemble the card.</span>}
        {agentResult && (
          <div className="result issue56-agent-result">
            <p className="note">{agentResult.note ?? (agentResult.mode === 'copilot' ? 'Live Copilot SDK response.' : 'Demo fallback response.')}</p>
            <ol className="trace" aria-label="Agent trace">
              {agentResult.trace.map((step, index) => (
                <li key={`${step.tool}-${index}`}>{step.tool}</li>
              ))}
            </ol>
            <div className="blocks">
              {agentResult.blocks.map((block, index) => <RenderBlock key={index} block={block} />)}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Outcomes({
  scenario,
  running,
  done,
  runKey,
  onStart,
  onDone,
}: {
  scenario: Scenario;
  running: boolean;
  done: boolean;
  runKey: number;
  onStart: () => void;
  onDone: () => void;
}) {
  const aggregate = scenario.outcomes.aggregate;
  return (
    <div className="issue56-two-col">
      <Panel
        title="Federated descriptive outcomes · data stays, insights travel"
        actions={
          <button type="button" className="hx-btn primary" disabled={running && !done} onClick={onStart}>
            {running && !done ? <><span className="hx-spinner" aria-hidden /> Querying hospitals…</> : 'Query connected hospitals'}
          </button>
        }
      >
        <p><strong>Query:</strong> {scenario.outcomes.query}</p>
        <Backstage
          key={`outcomes-${runKey}`}
          title="Federated query"
          stages={outcomeStages}
          running={running}
          onFinished={onDone}
          note="Only aggregate counts and uncertainty ranges are returned in this synthetic demo."
        />
        {(done || running) && (
          <div className="issue56-outcome-summary">
            <div><span>Matched patients</span><strong>{aggregate.matched}</strong></div>
            <div><span>ICU survival</span><strong>{aggregate.icu_survival}</strong><small>{aggregate.range}</small></div>
            <div><span>Alive on ward 30d</span><strong>{aggregate.ward_alive_30d}</strong></div>
            <div><span>Treatment resumed 60d</span><strong>{aggregate.treatment_resumed_60d}</strong></div>
          </div>
        )}
        <p className="issue56-note">{scenario.outcomes.disclaimer}</p>
      </Panel>
      <Panel title="Hospital aggregate returns">
        <DataTable
          rowKey={(row) => row.site}
          rows={scenario.outcomes.hospitals}
          columns={[
            { key: 'site', label: 'Hospital node', render: (row) => <strong>{row.site}</strong> },
            { key: 'matched', label: 'Matched', render: (row) => row.matched },
            { key: 'icu_survival', label: 'ICU survival', render: (row) => <>{row.icu_survival} <span className="issue56-range">{row.range}</span></> },
            { key: 'note', label: 'Cohort note' },
          ]}
        />
      </Panel>
    </div>
  );
}

function Decision({ scenario }: { scenario: Scenario }) {
  return (
    <div className="hx-grid">
      <Panel title="What the card informs">
        <ul className="issue56-checklist">
          <li><Pill tone="info">Review</Pill> Reversible source-control question: {scenario.icu.possible_causes[0].cause}</li>
          <li><Pill tone="warn">Discuss</Pill> Missing signed treatment-wishes document before limitation decisions</li>
          <li><Pill tone="info">Context</Pill> Planned oncology treatment exists if recovery returns near baseline</li>
          <li><Pill tone="neutral">Descriptive only</Pill> Similar-patient outcomes are uncertainty-aware aggregates, not a recommendation</li>
        </ul>
      </Panel>
      <Panel title="What remains human judgement">
        <div className="issue56-human-grid">
          {['ICU admission', 'Ventilation and vasopressor intensity', 'Treatment limitations', 'Family communication', 'Oncology follow-up'].map((item) => (
            <div key={item}><strong>{item}</strong><span>Clinician reviews and documents explicitly</span></div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function FollowUp({
  scenario,
  draft,
  sent,
  onDraft,
  onSubmit,
}: {
  scenario: Scenario;
  draft: string;
  sent: boolean;
  onDraft: (value: string) => void;
  onSubmit: () => void;
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className="issue56-followup" onSubmit={handleSubmit}>
      <Panel
        title="Draft follow-up for oncology"
        actions={sent ? <Pill tone="ok">Marked sent in demo</Pill> : <button type="submit" className="hx-btn primary">Review and send to oncology</button>}
      >
        <dl className="hx-facts">
          <dt>To</dt>
          <dd>{scenario.follow_up.to}</dd>
          <dt>Subject</dt>
          <dd>{scenario.follow_up.subject}</dd>
        </dl>
        <textarea value={draft} onChange={(event) => onDraft(event.target.value)} rows={14} aria-label="Oncology follow-up draft" />
      </Panel>
      <Panel title="Before sending, the human checks">
        {scenario.follow_up.requires_approval.map((item) => (
          <p key={item}><Pill tone="warn">Needs review</Pill> {item}</p>
        ))}
        <p className="issue56-note">Nothing is sent automatically. This button only marks the message as sent inside the prototype.</p>
      </Panel>
    </form>
  );
}
