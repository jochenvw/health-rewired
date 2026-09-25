import { useEffect, useMemo, useState } from 'react';
import type { AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import { DataTable, Panel, Pill } from '../../hospital/HospitalShell';
import type { IdeaMeta } from '../index';
import './style.css';

export const meta: IdeaMeta = {
  id: '53',
  issue: 53,
  title: 'Turn a quality signal into improvement within weeks',
  tagline: 'A network quality meeting finds Hospital F’s rectal-cancer MRI bottleneck and tests a fix.',
};

type Indicator = { key: string; label: string; unit: string; target: number; lower_is_better?: boolean };
type Hospital = {
  id: string;
  name: string;
  country: string;
  cases: number;
  totals_only: boolean;
  indicators: Record<string, number>;
  median_mri_wait_days: number;
  patient_mix: Record<string, number>;
  process: Record<string, number>;
  next_quarter: { time_to_treatment: number; median_mri_wait_days: number };
};
type AuditCase = { local_id: string; age_band: string; tumour: string; mri_wait_days: number; treatment_wait_days: number; reason: string };
type QualitySnapshot = {
  quarter: string;
  next_quarter: string;
  indicators: Indicator[];
  hospitals: Hospital[];
  network_average: Record<string, number>;
  signal: {
    hospital_id: string;
    headline: string;
    observed: number;
    network_average: number;
    target: number;
    gap: number;
    likely_cause: string;
    cause_detail: string;
    next_quarter_observed: number;
  };
  audit_cases: AuditCase[];
  agenda: string[];
  intervention: { label: string; expected_effect: string };
  data_flow: { step: string; detail: string }[];
};

type Section = 'network' | 'signal' | 'investigate' | 'audit' | 'action' | 'flow';

const story: StoryStep[] = [
  {
    id: 'network',
    title: 'Network totals',
    explain: 'Eight hospitals calculate rectal-cancer indicators locally. The meeting sees only totals and medians.',
  },
  {
    id: 'signal',
    title: 'Quality signal',
    explain: 'Hospital F has slipped on treatment within 31 days this quarter. Clinicians decide whether to investigate.',
  },
  {
    id: 'investigate',
    title: 'Investigate cause',
    explain: 'The assistant compares patient mix and pathway steps across hospitals, using aggregate data only.',
  },
  {
    id: 'audit',
    title: 'Audit five cases',
    explain: 'Five anonymised Hospital F cases and a draft meeting agenda are proposed for human approval.',
  },
  {
    id: 'action',
    title: 'Simulate action',
    explain: 'The group approves one improvement action and checks the simulated following quarter.',
  },
  {
    id: 'flow',
    title: 'Data stayed local',
    explain: 'The data-flow view shows what crossed hospital boundaries: totals, not patient-level records.',
  },
];

const investigationStages: Stage[] = [
  { label: 'Asking eight hospitals for local indicator totals', detail: 'Numerators, denominators and pathway medians only', ms: 700 },
  { label: 'Checking whether patient mix explains Hospital F', detail: 'Stage, frailty and low-rectal-tumour shares are similar', ms: 800 },
  { label: 'Breaking the pathway into process steps', detail: 'Referral → MRI → MDT → treatment', ms: 900 },
  { label: 'Selecting local audit cases', detail: 'Five anonymised Hospital F case IDs, no names or dates of birth', ms: 900 },
  { label: 'Drafting agenda and simulated improvement effect', detail: 'Extra MRI capacity scenario for next quarter' },
];

async function issue53Request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ideas/53${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export default function Issue53QualityLoop() {
  const [section, setSection] = useState<Section>('network');
  const [snapshot, setSnapshot] = useState<QualitySnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<AgentResult | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [agendaApproved, setAgendaApproved] = useState(false);
  const [actionApproved, setActionApproved] = useState(false);

  useEffect(() => {
    issue53Request<QualitySnapshot>('/quality-snapshot')
      .then(setSnapshot)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load the synthetic quality data.'));
  }, []);

  const hospitalF = useMemo(() => snapshot?.hospitals.find((hospital) => hospital.id === 'F') ?? null, [snapshot]);

  const runInvestigation = async () => {
    if (investigating) return;
    setSection('investigate');
    setRuns((n) => n + 1);
    setStarted(true);
    setInvestigating(true);
    setAssistant(null);
    setAssistantError(null);
    try {
      setAssistant(
        await issue53Request<AgentResult>('/assistant', {
          method: 'POST',
          body: JSON.stringify({
            task: 'Investigate Hospital F rectal-cancer time-to-treatment deviation and propose the audit agenda.',
            role: 'Tumour working group chair',
          }),
        }),
      );
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setInvestigating(false);
    }
  };

  const go = (id: string) => {
    if (id === 'investigate' && !assistant && !investigating && !started) {
      void runInvestigation();
      return;
    }
    setSection(id as Section);
  };

  if (loadError) {
    return (
      <main className="q53">
        <Panel title="Network quality dashboard">
          <p className="error">{loadError}</p>
        </Panel>
      </main>
    );
  }

  if (!snapshot || !hospitalF) {
    return (
      <main className="q53">
        <Panel title="Network quality dashboard">
          <Working label="Loading synthetic rectal-cancer quality data" />
        </Panel>
      </main>
    );
  }

  return (
    <main className="q53">
      <header className="q53-header">
        <div>
          <p className="q53-kicker">Rectal cancer network quality meeting · {snapshot.quarter}</p>
          <h1>Find the signal, close the loop</h1>
          <p>
            Hospital-level indicators are calculated locally. The chair sees a deviation, asks the assistant to explain it,
            approves an audit agenda and tests one improvement action.
          </p>
        </div>
        <div className="q53-signal-card">
          <span>Flagged this quarter</span>
          <strong>Hospital F · treatment within 31 days {snapshot.signal.observed}%</strong>
          <Pill tone="warn">{snapshot.signal.gap} point gap vs network</Pill>
        </div>
      </header>

      <StoryGuide steps={story} current={section} onGo={go} nextLabel={section === 'signal' ? 'Investigate Hospital F' : undefined} />

      <div className="q53-body">
        <nav className="q53-tabs" aria-label="Quality loop sections">
          {story.map((step) => (
            <button key={step.id} className={section === step.id ? 'active' : undefined} type="button" onClick={() => go(step.id)}>
              {step.title}
            </button>
          ))}
        </nav>

        {section === 'network' && <NetworkTotals snapshot={snapshot} />}
        {section === 'signal' && <SignalView snapshot={snapshot} hospitalF={hospitalF} onInvestigate={runInvestigation} investigating={investigating} />}
        {section === 'investigate' && (
          <Investigation
            assistant={assistant}
            error={assistantError}
            investigating={investigating}
            runs={runs}
            started={started}
            onInvestigate={runInvestigation}
            snapshot={snapshot}
          />
        )}
        {section === 'audit' && (
          <AuditView snapshot={snapshot} approved={agendaApproved} onApprove={() => setAgendaApproved(true)} onAction={() => setSection('action')} />
        )}
        {section === 'action' && (
          <ActionView snapshot={snapshot} hospitalF={hospitalF} approved={actionApproved} onApprove={() => setActionApproved(true)} />
        )}
        {section === 'flow' && <DataFlow snapshot={snapshot} />}
      </div>
    </main>
  );
}

function NetworkTotals({ snapshot }: { snapshot: QualitySnapshot }) {
  return (
    <div className="q53-grid wide">
      <Panel title="Eight hospitals · local calculation, shared totals only">
        <DataTable
          rowKey={(row) => row.id}
          rows={snapshot.hospitals}
          rowTone={(row) => (row.id === 'F' ? 'warn' : undefined)}
          columns={[
            { key: 'name', label: 'Hospital', render: (row) => <strong>{row.name}</strong> },
            { key: 'country', label: 'Country' },
            { key: 'cases', label: 'Cases' },
            ...snapshot.indicators.map((indicator) => ({
              key: indicator.key,
              label: indicator.label,
              render: (row: Hospital) => (
                <span className={indicator.key === 'time_to_treatment' && row.id === 'F' ? 'q53-bad' : undefined}>
                  {row.indicators[indicator.key]}{indicator.unit}
                </span>
              ),
            })),
          ]}
        />
      </Panel>
      <Panel title="Network averages">
        <div className="q53-metric-grid">
          {snapshot.indicators.map((indicator) => (
            <div key={indicator.key} className="q53-metric">
              <span>{indicator.label}</span>
              <strong>
                {snapshot.network_average[indicator.key]}
                {indicator.unit}
              </strong>
              <small>Target {indicator.lower_is_better ? '≤' : '≥'} {indicator.target}{indicator.unit}</small>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function SignalView({
  snapshot,
  hospitalF,
  onInvestigate,
  investigating,
}: {
  snapshot: QualitySnapshot;
  hospitalF: Hospital;
  onInvestigate: () => void;
  investigating: boolean;
}) {
  const peerHospitals = snapshot.hospitals.filter((hospital) => hospital.id !== 'F');
  const peerAverage = (read: (hospital: Hospital) => number) =>
    Math.round((peerHospitals.reduce((sum, hospital) => sum + read(hospital), 0) / peerHospitals.length) * 10) / 10;

  return (
    <div className="q53-grid">
      <Panel
        title={snapshot.signal.headline}
        actions={
          <button type="button" className="hx-btn primary" onClick={onInvestigate} disabled={investigating}>
            {investigating ? (
              <>
                <span className="hx-spinner" aria-hidden /> Investigating…
              </>
            ) : (
              'Investigate'
            )}
          </button>
        }
      >
        <div className="q53-comparison">
          <div>
            <span>Hospital F</span>
            <strong>{snapshot.signal.observed}%</strong>
            <small>Treatment within 31 days</small>
          </div>
          <div>
            <span>Network average</span>
            <strong>{snapshot.signal.network_average}%</strong>
            <small>{snapshot.hospitals.length} hospitals · totals only</small>
          </div>
          <div>
            <span>Target</span>
            <strong>{snapshot.signal.target}%</strong>
            <small>Quarterly review threshold</small>
          </div>
        </div>
      </Panel>
      <Panel title="First checks before blaming quality">
        <DataTable
          rowKey={(row) => row.label}
          rows={[
            {
              label: 'Locally advanced cases',
              hospital: `${hospitalF.patient_mix.locally_advanced}%`,
              network: `≈ ${peerAverage((hospital) => hospital.patient_mix.locally_advanced)}%`,
              finding: 'Similar',
            },
            {
              label: 'Frailty score ≥2',
              hospital: `${hospitalF.patient_mix.frailty_score_2plus}%`,
              network: `≈ ${peerAverage((hospital) => hospital.patient_mix.frailty_score_2plus)}%`,
              finding: 'Similar',
            },
            {
              label: 'Low rectal tumour',
              hospital: `${hospitalF.patient_mix.low_rectal_tumour}%`,
              network: `≈ ${peerAverage((hospital) => hospital.patient_mix.low_rectal_tumour)}%`,
              finding: 'Similar',
            },
            {
              label: 'Median MRI wait',
              hospital: `${hospitalF.median_mri_wait_days} days`,
              network: `≈ ${peerAverage((hospital) => hospital.median_mri_wait_days)} days`,
              finding: 'Outlier',
            },
          ]}
          rowTone={(row) => (row.finding === 'Outlier' ? 'warn' : undefined)}
          columns={[
            { key: 'label', label: 'Check' },
            { key: 'hospital', label: 'Hospital F' },
            { key: 'network', label: 'Network peers' },
            { key: 'finding', label: 'Finding', render: (row) => <Pill tone={row.finding === 'Outlier' ? 'warn' : 'ok'}>{row.finding}</Pill> },
          ]}
        />
      </Panel>
    </div>
  );
}

function Investigation({
  assistant,
  error,
  investigating,
  runs,
  started,
  onInvestigate,
  snapshot,
}: {
  assistant: AgentResult | null;
  error: string | null;
  investigating: boolean;
  runs: number;
  started: boolean;
  onInvestigate: () => void;
  snapshot: QualitySnapshot;
}) {
  return (
    <div className="q53-grid">
      <Panel
        title="Assistant investigation"
        actions={
          <button type="button" className="hx-btn primary" onClick={onInvestigate} disabled={investigating}>
            {investigating ? (
              <>
                <span className="hx-spinner" aria-hidden /> Working…
              </>
            ) : assistant ? (
              'Run again'
            ) : (
              'Investigate Hospital F'
            )}
          </button>
        }
      >
        <Backstage
          key={runs}
          title="Behind the scenes – federated quality investigation"
          stages={investigationStages}
          running={started}
          holdLast
          release={!investigating}
          note="Simulated for the prototype: each hospital keeps patient-level data locally; the assistant sees aggregate totals and anonymised Hospital F audit IDs."
        />
        {!started && <span className="hx-empty">Click Investigate to let the assistant trace the quality signal.</span>}
        {error && <p className="error">{error}</p>}
      </Panel>
      <Panel
        title={assistant?.headline ?? 'Likely cause summary'}
        actions={assistant && <Pill tone={assistant.mode === 'copilot' ? 'ok' : 'neutral'}>{assistant.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>}
      >
        {!assistant && !investigating && <p className="hx-empty">{snapshot.signal.cause_detail}</p>}
        {assistant && (
          <div className="q53-agent">
            {assistant.note && <p className="note">{assistant.note}</p>}
            {assistant.trace.length > 0 && (
              <ol className="trace" aria-label="Assistant trace">
                {assistant.trace.map((step, index) => (
                  <li key={`${step.tool}-${index}`}>{step.tool}</li>
                ))}
              </ol>
            )}
            <div className="blocks">
              {assistant.blocks.map((block, index) => (
                <RenderBlock key={index} block={block} />
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AuditView({ snapshot, approved, onApprove, onAction }: { snapshot: QualitySnapshot; approved: boolean; onApprove: () => void; onAction: () => void }) {
  return (
    <div className="q53-grid">
      <Panel title="Five anonymised Hospital F cases for audit">
        <DataTable
          rowKey={(row) => row.local_id}
          rows={snapshot.audit_cases}
          columns={[
            { key: 'local_id', label: 'Local ID' },
            { key: 'age_band', label: 'Age band' },
            { key: 'tumour', label: 'Tumour' },
            { key: 'mri_wait_days', label: 'MRI wait', render: (row) => `${row.mri_wait_days} days` },
            { key: 'reason', label: 'Why this case' },
          ]}
        />
      </Panel>
      <Panel
        title="Draft quality-meeting audit agenda"
        actions={
          <button type="button" className="hx-btn primary" onClick={onApprove} disabled={approved}>
            {approved ? 'Agenda approved ✓' : 'Approve agenda'}
          </button>
        }
      >
        <ol className="q53-agenda">
          {snapshot.agenda.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        {approved && (
          <button type="button" className="hx-btn primary" onClick={onAction}>
            Simulate improvement action →
          </button>
        )}
      </Panel>
    </div>
  );
}

function ActionView({
  snapshot,
  hospitalF,
  approved,
  onApprove,
}: {
  snapshot: QualitySnapshot;
  hospitalF: Hospital;
  approved: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="q53-grid">
      <Panel
        title="Human-approved improvement action"
        actions={
          <button type="button" className="hx-btn primary" onClick={onApprove} disabled={approved}>
            {approved ? 'Action approved ✓' : 'Approve extra MRI slot'}
          </button>
        }
      >
        <p>
          <strong>{snapshot.intervention.label}</strong>
        </p>
        <p>{snapshot.intervention.expected_effect}</p>
        <p className="note">Clinicians still decide whether the deviation is clinically relevant and whether this action is feasible.</p>
      </Panel>
      <Panel title={`${snapshot.next_quarter}: simulated Hospital F change`}>
        <div className="q53-before-after">
          <div>
            <span>{snapshot.quarter}</span>
            <strong>{hospitalF.indicators.time_to_treatment}%</strong>
            <small>Treatment within 31 days</small>
            <strong>{hospitalF.median_mri_wait_days} days</strong>
            <small>Median MRI wait</small>
          </div>
          <div className={approved ? 'improved' : undefined}>
            <span>{snapshot.next_quarter}</span>
            <strong>{approved ? `${hospitalF.next_quarter.time_to_treatment}%` : '—'}</strong>
            <small>Treatment within 31 days</small>
            <strong>{approved ? `${hospitalF.next_quarter.median_mri_wait_days} days` : '—'}</strong>
            <small>Median MRI wait</small>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function DataFlow({ snapshot }: { snapshot: QualitySnapshot }) {
  return (
    <div className="q53-grid">
      <Panel title="Data-flow proof for the quality meeting">
        <ol className="q53-flow">
          {snapshot.data_flow.map((step) => (
            <li key={step.step}>
              <strong>{step.step}</strong>
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="What left Hospital F">
        <div className="q53-checklist">
          <p><Pill tone="ok">Shared</Pill> Numerator and denominator for each indicator</p>
          <p><Pill tone="ok">Shared</Pill> Median pathway durations</p>
          <p><Pill tone="ok">Shared</Pill> Five anonymised local audit IDs</p>
          <p><Pill tone="crit">Not shared</Pill> Names, dates of birth, scans, notes or patient-level rows</p>
        </div>
      </Panel>
    </div>
  );
}
