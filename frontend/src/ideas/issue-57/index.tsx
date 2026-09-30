import { FormEvent, useEffect, useMemo, useState } from 'react';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import { request, type AgentResult } from '../../api';
import type { IdeaMeta } from '../index';
import './styles.css';

export const meta: IdeaMeta = {
  id: '57',
  issue: 57,
  title: "Design trials around Europe's real patient population",
  tagline: 'Enter draft criteria, see federated counts and review who would be left out before submission.',
};

type Section = 'criteria' | 'rules' | 'network' | 'equity' | 'decision';

type Centre = {
  id: string;
  name: string;
  country: string;
  registry: number;
  strict_eligible: number;
  adjusted_eligible: number;
  older_registry: number;
  older_strict_eligible: number;
  older_adjusted_eligible: number;
  egfr_excluded: number;
  egfr_excluded_older: number;
};

type Rule = { id: string; label: string; source: string; strict: string; adjusted: string };
type FunnelStep = { step: string; strict: number; adjusted: number };
type Disparity = {
  group: string;
  registry_share: number;
  strict_share: number;
  adjusted_share: number;
  strict_excluded_by_egfr: number;
  adjusted_excluded_by_egfr: number;
};

type Snapshot = {
  scenario: string;
  strict_threshold: string;
  adjusted_threshold: string;
  centres: Centre[];
  rules: Rule[];
  funnel: FunnelStep[];
  disparities: Disparity[];
  totals: {
    registry: number;
    strict_eligible: number;
    adjusted_eligible: number;
    older_registry: number;
    older_strict_eligible: number;
    older_adjusted_eligible: number;
    egfr_excluded: number;
    egfr_excluded_older: number;
  };
  representativeness: {
    strict_similarity: number;
    adjusted_similarity: number;
    registry_age_70_plus: number;
    strict_age_70_plus: number;
    adjusted_age_70_plus: number;
    registry_comorbidity: number;
    strict_comorbidity: number;
    adjusted_comorbidity: number;
  };
};

const draftCriteria = `Trial: second-line metastatic colorectal cancer
Include: confirmed metastatic colorectal cancer; progression after one fluoropyrimidine-based regimen; measurable disease; ECOG 0-1.
Labs copied from previous protocol: eGFR at least 60 mL/min/1.73m², bilirubin below 1.5x ULN.
Exclude: uncontrolled cardiac, hepatic or infectious comorbidity.
Question for feasibility: would eGFR at least 45 with renal monitoring be safer for recruitment and representativeness?`;

const steps: StoryStep[] = [
  {
    id: 'criteria',
    title: 'Draft criteria',
    explain: 'Paste the protocol wording. The assistant turns it into rules the researcher can review.',
  },
  {
    id: 'rules',
    title: 'Review rules',
    explain: 'Free text becomes explicit inclusion and exclusion checks. Humans still decide what is safe.',
  },
  {
    id: 'network',
    title: 'Run federated counts',
    explain: 'Six hospitals answer with counts only; synthetic patient-level data stays at each centre.',
  },
  {
    id: 'equity',
    title: 'See who is left out',
    explain: 'The funnel shows exactly which criterion removes older and comorbid patients.',
  },
  {
    id: 'decision',
    title: 'Protocol decision',
    explain: 'Compare strict versus adjusted criteria before ethics submission and record the human choice.',
  },
];

const agentStages: Stage[] = [
  { label: 'Reading draft eligibility text', detail: 'Diagnosis, line of therapy, ECOG, labs, comorbidity', ms: 700 },
  { label: 'Converting wording into reviewable rules', detail: 'No criterion is changed without researcher approval', ms: 900 },
  { label: 'Preparing federated feasibility query', detail: 'Only aggregate counts will leave each synthetic hospital', ms: 900 },
  { label: 'Writing the protocol review notes', detail: 'Highlights exclusions and what-if options', ms: 900 },
];

const networkStages: Stage[] = [
  { label: 'Klinikum Rewired München', detail: 'Local registry queried; count returned', ms: 550 },
  { label: 'Hamburg Oncology Centre', detail: 'Local registry queried; count returned', ms: 550 },
  { label: 'Centre Lyon Rhône', detail: 'Local registry queried; count returned', ms: 550 },
  { label: 'Amsterdam Trial Network', detail: 'Local registry queried; count returned', ms: 550 },
  { label: 'Barcelona Oncology Institute', detail: 'Local registry queried; count returned', ms: 550 },
  { label: 'Paris Est Cancer Campus', detail: 'Local registry queried; count returned', ms: 550 },
];

const HIGH_EXCLUSION_THRESHOLD = 40;

function percent(part: number, whole: number) {
  if (whole === 0) return '–';
  return `${Math.round((part / whole) * 100)}%`;
}

export default function Issue57TrialDesign() {
  const [section, setSection] = useState<Section>('criteria');
  const [criteria, setCriteria] = useState(draftCriteria);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentStarted, setAgentStarted] = useState(false);
  const [networkRunning, setNetworkRunning] = useState(false);
  const [networkDone, setNetworkDone] = useState(false);
  const [networkRunId, setNetworkRunId] = useState(0);
  const [approvedRules, setApprovedRules] = useState(false);
  const [decision, setDecision] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    request<Snapshot>('/api/ideas/57/feasibility')
      .then(setSnapshot)
      .catch(() => setError('Could not load the synthetic feasibility dataset.'));
  }, []);

  const startNetwork = () => {
    setNetworkRunId((id) => id + 1);
    setNetworkRunning(true);
    setNetworkDone(false);
  };

  const finishNetwork = () => {
    setNetworkRunning(false);
    setNetworkDone(true);
  };

  const go = (id: string) => {
    const next = id as Section;
    setSection(next);
    if (next === 'network' && !networkDone) startNetwork();
  };

  const runAgent = async (event?: FormEvent) => {
    event?.preventDefault();
    setAgentStarted(true);
    setAgentLoading(true);
    setAgentResult(null);
    setError(null);
    try {
      const result = await request<AgentResult>('/api/ideas/57/agent', {
        method: 'POST',
        body: JSON.stringify({ task: criteria, role: 'Trial coordinator' }),
      });
      setAgentResult(result);
      setSection('rules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setAgentLoading(false);
    }
  };

  const adjustedTotal = snapshot?.totals.adjusted_eligible ?? 0;
  const nav = [
    { id: 'criteria', label: 'Draft criteria' },
    { id: 'rules', label: 'Reviewable rules', badge: approvedRules ? 'OK' : undefined },
    { id: 'network', label: 'Federated counts', badge: networkDone ? adjustedTotal : undefined },
    { id: 'equity', label: 'Exclusion reasons' },
    { id: 'decision', label: 'Protocol choice', badge: decision ? 'filed' : undefined },
  ];

  return (
    <HospitalShell
      module="Trial feasibility workspace"
      guide={<StoryGuide steps={steps} current={section} onGo={go} />}
      nav={nav}
      active={section}
      onNav={go}
      toolbar={
        <>
          <strong>Protocol CRC-2L-2026</strong>
          <Pill tone="info">Second-line metastatic colorectal cancer</Pill>
          <Pill tone="neutral">Six synthetic European hospitals</Pill>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={() => setCriteria(draftCriteria)}>
            Reset draft
          </button>
          <button type="button" className="hx-btn primary" onClick={() => void runAgent()} disabled={agentLoading}>
            {agentLoading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Converting criteria…
              </>
            ) : (
              'Convert criteria with AI'
            )}
          </button>
        </>
      }
    >
      <div className="issue57">
        {error && <Panel title="Could not load data">{error}</Panel>}
        {!snapshot && !error && (
          <Panel title="Loading feasibility workspace">
            <Working label="Loading synthetic trial registry" />
          </Panel>
        )}
        {snapshot && (
          <WorkspaceHeader
            snapshot={snapshot}
            section={section}
            approvedRules={approvedRules}
            networkDone={networkDone}
            decision={decision}
          />
        )}
        {snapshot && section === 'criteria' && (
          <CriteriaSection
            criteria={criteria}
            setCriteria={setCriteria}
            runAgent={runAgent}
            loading={agentLoading}
            started={agentStarted}
            result={agentResult}
          />
        )}
        {snapshot && section === 'rules' && (
          <RulesSection
            snapshot={snapshot}
            result={agentResult}
            loading={agentLoading}
            started={agentStarted}
            approved={approvedRules}
            onApprove={() => setApprovedRules(true)}
            onRunCounts={() => {
              startNetwork();
              setSection('network');
            }}
          />
        )}
        {snapshot && section === 'network' && (
          <NetworkSection
            snapshot={snapshot}
            runId={networkRunId}
            running={networkRunning}
            done={networkDone}
            onRun={startNetwork}
            onDone={finishNetwork}
          />
        )}
        {snapshot && section === 'equity' && <EquitySection snapshot={snapshot} />}
        {snapshot && section === 'decision' && (
          <DecisionSection snapshot={snapshot} decision={decision} setDecision={setDecision} />
        )}
      </div>
    </HospitalShell>
  );
}

function WorkspaceHeader({
  snapshot,
  section,
  approvedRules,
  networkDone,
  decision,
}: {
  snapshot: Snapshot;
  section: Section;
  approvedRules: boolean;
  networkDone: boolean;
  decision: string | null;
}) {
  const activeStep = steps.findIndex((step) => step.id === section) + 1;
  return (
    <section className="issue57-context" aria-label="Current trial design context">
      <div className="issue57-context-main">
        <span className="issue57-eyebrow">CURRENT OBJECT</span>
        <h1>Protocol CRC-2L-2026 feasibility review</h1>
        <p>{snapshot.scenario}. Synthetic aggregate counts only; no patient records leave a centre.</p>
      </div>
      <dl className="issue57-facts" aria-label="Trial feasibility status">
        <div>
          <dt>Centres</dt>
          <dd>{snapshot.centres.length} European hospitals</dd>
        </div>
        <div>
          <dt>Registry</dt>
          <dd>{snapshot.totals.registry} synthetic patients</dd>
        </div>
        <div>
          <dt>Strict threshold</dt>
          <dd>{snapshot.strict_threshold}</dd>
        </div>
        <div>
          <dt>What-if threshold</dt>
          <dd>{snapshot.adjusted_threshold}</dd>
        </div>
      </dl>
      <div className="issue57-attention" role="status">
        <Pill tone={decision ? 'ok' : networkDone ? 'warn' : approvedRules ? 'info' : 'neutral'}>
          {decision ? 'Decision filed' : networkDone ? 'Human review required' : approvedRules ? 'Counts ready to run' : 'Rule review pending'}
        </Pill>
        <span>
          Step {activeStep} of {steps.length}: the coordinator controls when criteria are approved, when counts run and what threshold goes forward.
        </span>
      </div>
    </section>
  );
}

function CriteriaSection({
  criteria,
  setCriteria,
  runAgent,
  loading,
  started,
  result,
}: {
  criteria: string;
  setCriteria: (value: string) => void;
  runAgent: (event?: FormEvent) => Promise<void>;
  loading: boolean;
  started: boolean;
  result: AgentResult | null;
}) {
  return (
    <div className="hx-grid issue57-two-col">
      <Panel title="Draft eligibility criteria">
        <span className="issue57-eyebrow">PROTOCOL INPUT</span>
        <form className="issue57-criteria" onSubmit={(event) => void runAgent(event)}>
          <label>
            Protocol text
            <textarea rows={12} value={criteria} onChange={(event) => setCriteria(event.target.value)} />
          </label>
          <button className="hx-btn primary" type="submit" disabled={loading || criteria.trim().length < 20}>
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Assistant is structuring rules…
              </>
            ) : (
              'Turn into reviewable rules'
            )}
          </button>
        </form>
      </Panel>
      <Panel title={result ? result.headline : 'Assistant work'}>
        <span className="issue57-eyebrow">PUBLIC REASONING PATH</span>
        <Backstage
          title="Behind the scenes – criteria to executable rules"
          stages={agentStages}
          running={started}
          holdLast
          release={!loading}
          note="The live route uses the Copilot SDK. Without a token, the same screen follows a deterministic synthetic demo."
        />
        {!started && <span className="hx-empty">Start with the AI conversion. Nothing is sent to hospitals yet.</span>}
        {result && <AgentBlocks result={result} />}
      </Panel>
    </div>
  );
}

function RulesSection({
  snapshot,
  result,
  loading,
  started,
  approved,
  onApprove,
  onRunCounts,
}: {
  snapshot: Snapshot;
  result: AgentResult | null;
  loading: boolean;
  started: boolean;
  approved: boolean;
  onApprove: () => void;
  onRunCounts: () => void;
}) {
  return (
    <div className="hx-grid issue57-two-col">
      <Panel
        title="Rules to review before the query runs"
        actions={
          <>
            <button type="button" className="hx-btn" onClick={onApprove} disabled={approved}>
              {approved ? 'Rules approved ✓' : 'Approve rule set'}
            </button>
            <button type="button" className="hx-btn primary" onClick={onRunCounts}>
              Send federated count query
            </button>
          </>
        }
      >
        <span className="issue57-eyebrow">HUMAN REVIEW REQUIRED</span>
        <DataTable
          rows={snapshot.rules}
          rowKey={(rule) => rule.id}
          rowTone={(rule) => (rule.id === 'egfr' ? 'warn' : undefined)}
          columns={[
            { key: 'label', label: 'Rule', render: (rule) => <strong>{rule.label}</strong> },
            { key: 'source', label: 'Source' },
            { key: 'strict', label: 'Strict protocol' },
            { key: 'adjusted', label: 'What-if protocol' },
          ]}
        />
      </Panel>
      <Panel title={result ? result.headline : 'AI review notes'}>
        <span className="issue57-eyebrow">CLAIM → EVIDENCE → SOURCE</span>
        <Backstage
          title="Behind the scenes – rule conversion"
          stages={agentStages}
          running={started}
          holdLast
          release={!loading}
        />
        {result ? <AgentBlocks result={result} /> : <span className="hx-empty">Convert the criteria to see the AI review.</span>}
      </Panel>
    </div>
  );
}

function NetworkSection({
  snapshot,
  runId,
  running,
  done,
  onRun,
  onDone,
}: {
  snapshot: Snapshot;
  runId: number;
  running: boolean;
  done: boolean;
  onRun: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <Panel
        title="Federated count query"
        actions={
          <button type="button" className="hx-btn primary" onClick={onRun} disabled={running && !done}>
            {running && !done ? (
              <>
                <span className="hx-spinner" aria-hidden /> Querying hospitals…
              </>
            ) : (
              'Run counts again'
            )}
          </button>
        }
      >
        <span className="issue57-eyebrow">COUNTS ONLY · PATIENT DATA STAYS LOCAL</span>
        <Backstage
          key={runId}
          title="Behind the scenes – hospitals answer with counts only"
          stages={networkStages}
          running={running}
          onFinished={onDone}
          note="Simulated federated query: no patient-level data leaves a hospital."
        />
        {!running && !done && <span className="hx-empty">Run the federated count query to fill the table.</span>}
        {!running && done && (
          <p className="issue57-filed">
            <Pill tone="ok">Counts returned</Pill> Six centres answered with aggregate counts only.
          </p>
        )}
      </Panel>
      {(running || done) && (
        <div className="hx-grid issue57-network">
          <Panel title="Eligibility by centre">
            <span className="issue57-eyebrow">SITE STATUS</span>
            <DataTable
              rows={snapshot.centres}
              rowKey={(centre) => centre.id}
              columns={[
                { key: 'name', label: 'Centre', render: (centre) => <strong>{centre.name}</strong> },
                { key: 'country', label: 'Country' },
                { key: 'registry', label: 'Registry' },
                { key: 'strict_eligible', label: 'eGFR ≥60' },
                {
                  key: 'adjusted_eligible',
                  label: 'eGFR ≥45 + review',
                  render: (centre) => <strong>{centre.adjusted_eligible}</strong>,
                },
                {
                  key: 'gain',
                  label: 'Gain',
                  render: (centre) => `+${centre.adjusted_eligible - centre.strict_eligible}`,
                },
              ]}
            />
          </Panel>
          <Funnel snapshot={snapshot} />
        </div>
      )}
    </>
  );
}

function Funnel({ snapshot }: { snapshot: Snapshot }) {
  const max = Math.max(1, ...snapshot.funnel.flatMap((step) => [step.strict, step.adjusted]));
  return (
    <Panel title="Eligibility funnel">
      <span className="issue57-eyebrow">STRICT VS WHAT-IF</span>
      <div className="issue57-funnel">
        {snapshot.funnel.map((step) => (
          <div key={step.step} className="issue57-funnel-row">
            <span>{step.step}</span>
            <div className="issue57-bars">
              <Bar label={`Strict ${step.strict}`} value={step.strict} max={max} tone="strict" />
              <Bar label={`Adjusted ${step.adjusted}`} value={step.adjusted} max={max} tone="adjusted" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EquitySection({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="hx-grid issue57-two-col">
      <Panel title="Which criterion excludes whom?">
        <span className="issue57-eyebrow">EXCLUSION ATTRIBUTION</span>
        <DataTable
          rows={snapshot.disparities}
          rowKey={(row) => row.group}
          rowTone={(row) => (row.strict_excluded_by_egfr >= HIGH_EXCLUSION_THRESHOLD ? 'crit' : undefined)}
          columns={[
            { key: 'group', label: 'Group', render: (row) => <strong>{row.group}</strong> },
            { key: 'registry_share', label: 'Registry share', render: (row) => `${row.registry_share}%` },
            { key: 'strict_share', label: 'Strict cohort', render: (row) => `${row.strict_share}%` },
            { key: 'adjusted_share', label: 'Adjusted cohort', render: (row) => `${row.adjusted_share}%` },
            {
              key: 'strict_excluded_by_egfr',
              label: 'Excluded by eGFR ≥60',
              render: (row) => <strong>{row.strict_excluded_by_egfr}%</strong>,
            },
          ]}
        />
      </Panel>
      <Panel title="What the researcher learns before submission">
        <span className="issue57-eyebrow">CURRENT CONCLUSION</span>
        <div className="issue57-callout">
          <strong>A strict kidney-function threshold excludes almost half of older patients.</strong>
          <p>
            In the synthetic registry, {snapshot.totals.egfr_excluded_older} of {snapshot.totals.older_registry} patients aged
            70 or older fail the eGFR ≥60 rule. The adjusted rule raises older-patient eligibility from{' '}
            {percent(snapshot.totals.older_strict_eligible, snapshot.totals.older_registry)} to{' '}
            {percent(snapshot.totals.older_adjusted_eligible, snapshot.totals.older_registry)} while keeping a renal safety
            review.
          </p>
        </div>
        <Metric label="Eligible with strict threshold" value={snapshot.totals.strict_eligible} />
        <Metric label="Eligible with adjusted threshold" value={snapshot.totals.adjusted_eligible} tone="ok" />
        <Metric
          label="Additional realistic enrolment pool"
          value={`+${snapshot.totals.adjusted_eligible - snapshot.totals.strict_eligible}`}
          tone="ok"
        />
        <details className="issue57-disclosure">
          <summary>Inspect source and uncertainty</summary>
          <p>
            Source: synthetic six-centre registry snapshot in <code>sample-data/trial-design/issue-57-population.json</code>.
            The counts demonstrate feasibility and representativeness logic only; they are not evidence for a real protocol.
          </p>
        </details>
      </Panel>
    </div>
  );
}

function DecisionSection({
  snapshot,
  decision,
  setDecision,
}: {
  snapshot: Snapshot;
  decision: string | null;
  setDecision: (decision: string) => void;
}) {
  const rows = useMemo(
    () => [
      {
        measure: 'Eligible patients across six centres',
        registry: snapshot.totals.registry,
        strict: snapshot.totals.strict_eligible,
        adjusted: snapshot.totals.adjusted_eligible,
      },
      {
        measure: 'Patients aged ≥70 in cohort',
        registry: `${snapshot.representativeness.registry_age_70_plus}%`,
        strict: `${snapshot.representativeness.strict_age_70_plus}%`,
        adjusted: `${snapshot.representativeness.adjusted_age_70_plus}%`,
      },
      {
        measure: 'Comorbidity share in cohort',
        registry: `${snapshot.representativeness.registry_comorbidity}%`,
        strict: `${snapshot.representativeness.strict_comorbidity}%`,
        adjusted: `${snapshot.representativeness.adjusted_comorbidity}%`,
      },
      {
        measure: 'Registry similarity score',
        registry: '1.00',
        strict: snapshot.representativeness.strict_similarity.toFixed(2),
        adjusted: snapshot.representativeness.adjusted_similarity.toFixed(2),
      },
    ],
    [snapshot],
  );
  return (
    <div className="hx-grid issue57-two-col">
      <Panel title="Strict versus adjusted criteria">
        <span className="issue57-eyebrow">REGISTRY REPRESENTATIVENESS</span>
        <DataTable
          rows={rows}
          rowKey={(row) => row.measure}
          columns={[
            { key: 'measure', label: 'Measure', render: (row) => <strong>{row.measure}</strong> },
            { key: 'registry', label: 'Registry' },
            { key: 'strict', label: 'Strict' },
            { key: 'adjusted', label: 'Adjusted + safety review' },
          ]}
        />
      </Panel>
      <Panel title="Human decision for protocol team">
        <span className="issue57-eyebrow">VISIBLE HUMAN CONTROL</span>
        <p className="issue57-decision-copy">
          The assistant does not choose criteria or approach patients. It makes the recruitment and representativeness trade-off
          visible before regulatory and ethical submission.
        </p>
        <div className="issue57-decision-buttons">
          <button type="button" className="hx-btn" onClick={() => setDecision('Strict eGFR ≥60 kept for safety rationale')}>
            Keep strict threshold
          </button>
          <button
            type="button"
            className="hx-btn primary"
            onClick={() => setDecision('Adjusted eGFR ≥45 sent to protocol team with renal safety review')}
          >
            Send adjusted threshold to protocol team
          </button>
        </div>
        {decision ? (
          <p className="issue57-filed">
            <Pill tone="ok">Filed</Pill> {decision}
          </p>
        ) : (
          <span className="hx-empty">Choose one option to close the walkthrough.</span>
        )}
      </Panel>
    </div>
  );
}

function AgentBlocks({ result }: { result: AgentResult }) {
  return (
    <div className="result issue57-agent">
      {result.note && <p className="note">{result.note}</p>}
      {result.trace.length > 0 && (
        <details className="issue57-disclosure" open>
          <summary>Inspect what the assistant used</summary>
        <ol className="trace" aria-label="What the assistant used">
          {result.trace.map((step, index) => (
            <li key={index} title={step.arguments ?? undefined}>
              {step.tool}
            </li>
          ))}
        </ol>
        </details>
      )}
      <div className="blocks">
        {result.blocks.map((block, index) => (
          <RenderBlock key={index} block={block} />
        ))}
      </div>
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: 'strict' | 'adjusted' }) {
  const width = Math.min(100, Math.max(8, (value / max) * 100));
  return (
    <div className={`issue57-bar ${tone}`}>
      <span style={{ width: `${width}%` }} />
      <strong>{label}</strong>
    </div>
  );
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: 'neutral' | 'ok' }) {
  return (
    <div className={`issue57-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
