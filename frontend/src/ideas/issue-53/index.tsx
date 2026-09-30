import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type Issue53Hospital, type Issue53QualitySnapshot } from '../../api';
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

type Section = 'network' | 'signal' | 'investigate' | 'audit' | 'action' | 'flow';
type ThemeChoice = 'light' | 'dark';

const themeStorageKey = 'health-rewired-idea-53-theme';

function initialTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeControls({ theme, onTheme }: { theme: ThemeChoice; onTheme: (theme: ThemeChoice) => void }) {
  return (
    <div className="q53-theme-controls" aria-label="Theme">
      <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}>
        Light
      </button>
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}>
        Dark
      </button>
    </div>
  );
}

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

export default function Issue53QualityLoop() {
  const [section, setSection] = useState<Section>('network');
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme);
  const [snapshot, setSnapshot] = useState<Issue53QualitySnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assistant, setAssistant] = useState<AgentResult | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [agendaApproved, setAgendaApproved] = useState(false);
  const [actionApproved, setActionApproved] = useState(false);

  useEffect(() => {
    api.issue53
      .qualitySnapshot()
      .then(setSnapshot)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load the synthetic quality data.'));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
        await api.issue53.assistant({
          task: 'Investigate Hospital F rectal-cancer time-to-treatment deviation and propose the audit agenda.',
          role: 'Tumour working group chair',
        }),
      );
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setInvestigating(false);
    }
  };

  const go = (id: string) => {
    if (id === 'investigate' && !assistant && !investigating && (!started || assistantError)) {
      void runInvestigation();
      return;
    }
    setSection(id as Section);
  };

  if (loadError) {
    return (
      <main className="q53" data-theme={theme}>
        <header className="q53-chrome" aria-label="Institutional system context">
          <div className="q53-mark" aria-hidden>
            QR
          </div>
          <div>
            <p className="q53-eyebrow">Network quality workstation</p>
            <strong>Rectal cancer improvement loop</strong>
            <span>Could not load the synthetic quality data</span>
          </div>
          <div className="q53-chrome-status">
            <ThemeControls theme={theme} onTheme={setTheme} />
          </div>
        </header>
        <div className="q53-loading">
          <Panel title="Network quality dashboard">
            <p className="error">{loadError}</p>
          </Panel>
        </div>
      </main>
    );
  }

  if (!snapshot || !hospitalF) {
    return (
      <main className="q53" data-theme={theme}>
        <header className="q53-chrome" aria-label="Institutional system context">
          <div className="q53-mark" aria-hidden>
            QR
          </div>
          <div>
            <p className="q53-eyebrow">Network quality workstation</p>
            <strong>Rectal cancer improvement loop</strong>
            <span>Loading synthetic quality data</span>
          </div>
          <div className="q53-chrome-status">
            <ThemeControls theme={theme} onTheme={setTheme} />
          </div>
        </header>
        <div className="q53-loading">
          <Panel title="Network quality dashboard">
            <Working label="Loading synthetic rectal-cancer quality data" />
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="q53" data-theme={theme}>
      <a className="q53-skip" href="#q53-workspace">
        Skip to quality workspace
      </a>
      <header className="q53-chrome" aria-label="Institutional system context">
        <div className="q53-mark" aria-hidden>
          QR
        </div>
        <div>
          <p className="q53-eyebrow">Network quality workstation</p>
          <strong>Rectal cancer improvement loop</strong>
          <span>Munich Oncology Hackathon · Tumour working group</span>
        </div>
        <div className="q53-chrome-status">
          <span>Workstation QI-07</span>
          <span>Federated mode</span>
          <span className="q53-status success">Connected</span>
          <ThemeControls theme={theme} onTheme={setTheme} />
        </div>
      </header>

      <section className="q53-context" aria-label="Current quality signal">
        <div>
          <p className="q53-eyebrow">Current object</p>
          <h1>Hospital F quality signal</h1>
          <span>Rectal cancer pathway · {snapshot.quarter} · eight-hospital network</span>
        </div>
        <dl>
          <div>
            <dt>Flag</dt>
            <dd>Treatment within 31 days</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{snapshot.signal.observed}%</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{snapshot.signal.network_average}%</dd>
          </div>
          <div>
            <dt>Boundary</dt>
            <dd>Totals only</dd>
          </div>
        </dl>
      </section>

      <section className="q53-header" aria-labelledby="q53-title">
        <div>
          <p className="q53-eyebrow">Guided meeting task</p>
          <h2 id="q53-title">Find the signal, close the loop</h2>
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
      </section>

      <StoryGuide steps={story} current={section} onGo={go} nextLabel={section === 'signal' ? 'Investigate Hospital F' : undefined} />

      <section className="q53-attention" aria-label="Current attention state">
        <span className="q53-status warning">Human review required</span>
        <div>
          <strong>{snapshot.signal.headline}</strong>
          <p>{snapshot.signal.cause_detail} The group must decide whether to audit before any comparison is published.</p>
        </div>
        <button type="button" className="hx-btn primary" onClick={runInvestigation} disabled={investigating}>
          {investigating ? (
            <>
              <span className="hx-spinner" aria-hidden /> Investigating…
            </>
          ) : (
            'Focus investigation'
          )}
        </button>
      </section>

      <div id="q53-workspace" className="q53-body">
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

function NetworkTotals({ snapshot }: { snapshot: Issue53QualitySnapshot }) {
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
              render: (row: Issue53Hospital) => (
                <span className={indicator.key === 'time_to_treatment' && row.id === 'F' ? 'q53-bad' : undefined}>
                  {row.indicators[indicator.key]}{indicator.unit}
                </span>
              ),
            })),
          ]}
        />
        <details className="q53-evidence">
          <summary>Inspect source and boundary</summary>
          <p>
            Source: synthetic registry/pathway aggregates in <code>sample-data/rectal-quality-network.json</code>. Each row is a
            hospital-level total or median; no patient-level rows are shown here.
          </p>
        </details>
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
        <p className="q53-provenance">CLAIM → SOURCE · weighted from local hospital totals; denominators stay inside each hospital.</p>
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
  snapshot: Issue53QualitySnapshot;
  hospitalF: Issue53Hospital;
  onInvestigate: () => void;
  investigating: boolean;
}) {
  const peerHospitals = snapshot.hospitals.filter((hospital) => hospital.id !== 'F');
  const peerAverage = (read: (hospital: Issue53Hospital) => number) =>
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
        <ol className="q53-reasoning" aria-label="Public reasoning path">
          <li><strong>Trying to answer:</strong> is this patient mix or a process delay?</li>
          <li><strong>Considered:</strong> stage, frailty, low-rectal-tumour share and pathway medians.</li>
          <li><strong>This showed:</strong> MRI wait is the outlier; patient mix is similar to peers.</li>
          <li><strong>Uncertain:</strong> clinicians must still decide clinical relevance and feasibility.</li>
        </ol>
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
        <details className="q53-evidence">
          <summary>Open provenance for the comparison</summary>
          <p>
            Patient-mix values are aggregate percentages from the synthetic network file. Peer values are recalculated in the
            browser from all hospitals except Hospital F.
          </p>
        </details>
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
  snapshot: Issue53QualitySnapshot;
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
        <details className="q53-evidence">
          <summary>What the assistant is allowed to inspect</summary>
          <p>
            The tool returns aggregate indicators, process medians, anonymised local audit IDs and the draft agenda. It does
            not receive names, scans, notes or patient-level tables.
          </p>
        </details>
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
            <p className="q53-provenance">PUBLIC SUMMARY · generated from the issue-local quality-signal tool, not private model deliberation.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AuditView({ snapshot, approved, onApprove, onAction }: { snapshot: Issue53QualitySnapshot; approved: boolean; onApprove: () => void; onAction: () => void }) {
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
        <p className="q53-provenance">LOCAL AUDIT LIST · anonymised Hospital F identifiers selected for discussion, not export.</p>
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
        <p className="q53-provenance">HUMAN CONTROL · the agenda is only active after the chair approves it.</p>
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
  snapshot: Issue53QualitySnapshot;
  hospitalF: Issue53Hospital;
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
        <p className="q53-provenance">UNCERTAINTY · this is a simulated next-quarter effect for iteration, not evidence of real impact.</p>
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
        {!approved && <p className="q53-provenance">Waiting for human approval before showing the simulated following quarter.</p>}
      </Panel>
    </div>
  );
}

function DataFlow({ snapshot }: { snapshot: Issue53QualitySnapshot }) {
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
        <p className="q53-provenance">INSPECTABLE BY DESIGN · every cross-boundary step names what moved and what stayed local.</p>
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
