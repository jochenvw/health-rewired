import { useMemo, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-35.css';

export const meta: IdeaMeta = {
  id: '35',
  issue: 35,
  title: 'Self-running European clinical trial engine',
  tagline: 'Orchestrate trial launch across synthetic European sites, bottlenecks, and control-cohort readiness.',
};

type Section = 'launch' | 'sites' | 'screening' | 'actions' | 'payoff';
type Status = 'pending' | 'approved' | 'dismissed';
type SiteStatus = 'on track' | 'lagging';
type SignalPhase = 'queried' | 'responding' | 'patients found' | 'investigator review';
type Site = {
  id: string;
  name: string;
  city: string;
  country: string;
  eligible: number;
  enrolled: number;
  forecast: number;
  potential: number;
  missingData: number;
  review: number;
  approached: number;
  status: SiteStatus;
  bottleneck: string;
  x: number;
  y: number;
};
type Candidate = {
  id: string;
  name: string;
  site: string;
  age: number;
  profile: string;
  status: 'match' | 'exclude' | 'needs data';
  reason: string;
  missing: string;
  comparator: boolean;
  controlGap: string;
};
type BalanceRow = {
  characteristic: string;
  trial: string;
  control: string;
  balance: 'good' | 'watch' | 'gap';
  action: string;
};

const DEFAULT_SITE_ID = 'MIL';
const FORECAST_GAIN_PER_APPROVED_MATCH = 3;
const OUTREACH_FORECAST_BONUS = 5;

const story: StoryStep[] = [
  {
    id: 'launch',
    title: 'Operations room',
    explain: 'The coordinator opens a Europe-wide launch board rather than a patient chart: site signals, funnel and forecast are already visible.',
  },
  {
    id: 'sites',
    title: 'Watch sites respond',
    explain: 'Hospitals pulse through queried, responding, patients found and investigator review; country counts update as signals arrive.',
  },
  {
    id: 'screening',
    title: 'Open a lagging signal',
    explain: 'Select a lagging site and see the operational cause immediately: missing data, review queue and outreach need.',
  },
  {
    id: 'actions',
    title: 'Approve operations',
    explain: 'The assistant drafts site outreach and external-control entries, kept visibly separate from recruitment decisions.',
  },
  {
    id: 'payoff',
    title: 'Payoff dashboard',
    explain: 'The ending is an operations dashboard: expected recruitment date, sites needing action and control-cohort readiness.',
  },
];

const siteStages: Stage[] = [
  { label: 'Broadcasting protocol query across the synthetic network', detail: '4 European sites · federated counts only', ms: 700 },
  { label: 'Receiving site signals', detail: 'queried → responding → patients found → investigator review', ms: 800 },
  { label: 'Updating recruitment funnel and forecast', detail: 'Potentially eligible, missing data, review, approached, enrolled', ms: 900 },
  { label: 'Separating external-control candidates', detail: 'Balance checks run beside recruitment, not inside it' },
];

const assistantStages: Stage[] = [
  { label: 'Reading site operations signal', detail: 'Synthetic site counts, missing fields and patient-level reasons', ms: 700 },
  { label: 'Explaining the bottleneck', detail: 'Mutation, stage, ECOG, prior treatment and coordinator workload', ms: 900 },
  { label: 'Drafting outreach and control-cohort actions', detail: 'Human approval required before sending or filing' },
];

const sites: Site[] = [
  {
    id: 'MUC',
    name: 'Klinikum Rewired München',
    city: 'Munich',
    country: 'DE',
    eligible: 9,
    enrolled: 6,
    forecast: 18,
    potential: 24,
    missingData: 3,
    review: 9,
    approached: 7,
    status: 'on track',
    bottleneck: 'screening list refreshed this morning',
    x: 55,
    y: 57,
  },
  {
    id: 'MIL',
    name: 'Istituto Oncologico Milano',
    city: 'Milan',
    country: 'IT',
    eligible: 7,
    enrolled: 2,
    forecast: 11,
    potential: 19,
    missingData: 8,
    review: 5,
    approached: 3,
    status: 'lagging',
    bottleneck: 'prior-treatment fields missing in three records',
    x: 50,
    y: 69,
  },
  {
    id: 'AMS',
    name: 'Amsterdam Thoracic Cancer Centre',
    city: 'Amsterdam',
    country: 'NL',
    eligible: 5,
    enrolled: 4,
    forecast: 14,
    potential: 16,
    missingData: 2,
    review: 5,
    approached: 5,
    status: 'on track',
    bottleneck: 'awaiting two patient discussions',
    x: 44,
    y: 38,
  },
  {
    id: 'BCN',
    name: 'Hospital del Mar Barcelona',
    city: 'Barcelona',
    country: 'ES',
    eligible: 6,
    enrolled: 1,
    forecast: 8,
    potential: 18,
    missingData: 7,
    review: 4,
    approached: 2,
    status: 'lagging',
    bottleneck: 'pathology addendum delayed',
    x: 36,
    y: 80,
  },
];

const candidates: Candidate[] = [
  {
    id: 'MIL-204',
    name: 'Giulia Romano',
    site: 'MIL',
    age: 61,
    profile: 'Stage IV NSCLC · EGFR exon 19 deletion · ECOG 1',
    status: 'match',
    reason: 'Meets mutation, stage and ECOG criteria; no prior metastatic EGFR TKI recorded.',
    missing: 'Patient preference discussion',
    comparator: true,
    controlGap: 'Adds under-represented exon 19 deletion profile to control queue',
  },
  {
    id: 'MIL-219',
    name: 'Marco Bianchi',
    site: 'MIL',
    age: 70,
    profile: 'Stage IV NSCLC · EGFR L858R · ECOG 2',
    status: 'exclude',
    reason: 'ECOG 2 exceeds protocol limit.',
    missing: '',
    comparator: false,
    controlGap: 'Not comparable: performance status outside protocol population',
  },
  {
    id: 'MIL-231',
    name: 'Elena Conti',
    site: 'MIL',
    age: 58,
    profile: 'Stage IV NSCLC · EGFR pending · ECOG 1',
    status: 'needs data',
    reason: 'Stage and ECOG fit, but mutation confirmation is not yet filed.',
    missing: 'EGFR result; prior TKI history',
    comparator: true,
    controlGap: 'Potentially helps age balance if EGFR is confirmed',
  },
  {
    id: 'BCN-118',
    name: 'Lucía Torres',
    site: 'BCN',
    age: 64,
    profile: 'Stage IV NSCLC · EGFR exon 19 deletion · ECOG 0',
    status: 'match',
    reason: 'Clear protocol fit; lives within 45 minutes of the site.',
    missing: 'Baseline CT uploaded to trial binder',
    comparator: true,
    controlGap: 'Improves ECOG 0 control representation',
  },
  {
    id: 'BCN-144',
    name: 'Jordi Serra',
    site: 'BCN',
    age: 73,
    profile: 'Stage IIIB NSCLC · EGFR L858R · ECOG 1',
    status: 'exclude',
    reason: 'Locally advanced rather than metastatic disease.',
    missing: '',
    comparator: false,
    controlGap: 'Not comparable: stage differs from metastatic trial population',
  },
  {
    id: 'BCN-166',
    name: 'María Vidal',
    site: 'BCN',
    age: 67,
    profile: 'Stage IV NSCLC · EGFR L858R · ECOG 1',
    status: 'needs data',
    reason: 'Likely eligible, but prior adjuvant osimertinib dates are unclear.',
    missing: 'Treatment stop date; consent language preference',
    comparator: true,
    controlGap: 'Addresses under-represented L858R subgroup if treatment timing fits',
  },
];

const balanceRows: BalanceRow[] = [
  {
    characteristic: 'EGFR L858R mutation',
    trial: '38%',
    control: '24%',
    balance: 'gap',
    action: 'Need more L858R comparators from Barcelona/Milan',
  },
  {
    characteristic: 'ECOG 0–1',
    trial: '100%',
    control: '93%',
    balance: 'watch',
    action: 'Exclude ECOG 2 rows before statistician review',
  },
  {
    characteristic: 'Age 65+',
    trial: '46%',
    control: '43%',
    balance: 'good',
    action: 'Balanced for current synthetic sample',
  },
  {
    characteristic: 'Prior adjuvant osimertinib',
    trial: 'allowed if stopped',
    control: 'unknown in 3 rows',
    balance: 'watch',
    action: 'Confirm stop dates before readiness sign-off',
  },
];

const trial = {
  id: 'EU-LUNG-17',
  title: 'EGFR-mutant NSCLC first-line combination study',
  target: 96,
  enrolled: 31,
  forecast: 78,
  inclusion: ['NSCLC stage IV', 'EGFR exon 19 deletion or L858R', 'ECOG 0–1', 'No prior metastatic EGFR TKI'],
};

export default function TrialEngineIdea() {
  const [section, setSection] = useState<Section>('launch');
  const [selectedSite, setSelectedSite] = useState(DEFAULT_SITE_ID);
  const [tab, setTab] = useState('signal');
  const [queried, setQueried] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantRuns, setAssistantRuns] = useState(0);
  const [assistantResult, setAssistantResult] = useState<AgentResult | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<Record<string, Status>>({});
  const [comparatorStatus, setComparatorStatus] = useState<Record<string, Status>>({});
  const [outreachStatus, setOutreachStatus] = useState<Status>('pending');
  const [cohortStatus, setCohortStatus] = useState<Status>('pending');

  const defaultSite = sites.find((item) => item.id === DEFAULT_SITE_ID) ?? sites[0];
  const site = sites.find((item) => item.id === selectedSite) ?? defaultSite;
  const sitePatients = useMemo(() => candidates.filter((candidate) => candidate.site === selectedSite), [selectedSite]);
  const approvedMatches = sitePatients.filter((candidate) => candidateStatus[candidate.id] === 'approved').length;
  const approvedControls = candidates.filter((candidate) => candidate.comparator && comparatorStatus[candidate.id] === 'approved').length;
  const forecastAfterActions =
    trial.forecast + approvedMatches * FORECAST_GAIN_PER_APPROVED_MATCH + (outreachStatus === 'approved' ? OUTREACH_FORECAST_BONUS : 0);
  const funnel = buildFunnel(forecastAfterActions, candidateStatus, outreachStatus);
  const readiness = controlReadiness(approvedControls, cohortStatus);

  const go = (id: string) => {
    setSection(id as Section);
    if (id === 'sites') setQueried(true);
    const currentSite = sites.find((item) => item.id === selectedSite);
    // Keep the guided story on a lagging site with patient rows; other sites remain selectable from the toolbar.
    if (id === 'screening' && (!currentSite || currentSite.status === 'on track')) setSelectedSite(DEFAULT_SITE_ID);
  };

  const runAssistant = async () => {
    setAssistantRuns((runs) => runs + 1);
    setAssistantStarted(true);
    setAssistantLoading(true);
    setAssistantResult(null);
    setAssistantError(null);
    try {
      setAssistantResult(await api.runTrialEngine35({ site_id: selectedSite }));
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'The assistant could not be reached.');
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <HospitalShell
      module="European trial operations"
      guide={<StoryGuide steps={story} current={section} onGo={go} nextLabel={nextLabel(section)} />}
      nav={[
        { id: 'launch', label: 'Operations room', badge: trial.id },
        { id: 'sites', label: 'Site network', badge: sites.length },
        { id: 'screening', label: 'Lagging signal', badge: sitePatients.length },
        { id: 'actions', label: 'Approvals & controls', badge: pendingCount(candidateStatus, sitePatients) },
        { id: 'payoff', label: 'Payoff dashboard', badge: readiness.label },
      ]}
      active={section}
      onNav={go}
      patient={{
        id: trial.id,
        name: 'EU Trial Network',
        diagnosis: `${trial.title} · cross-Europe operations`,
        ward: 'Research operations control room · synthetic launch',
        allergies: 'Prototype – synthetic data – not for clinical use',
      }}
      toolbar={
        <>
          <label>
            Trial{' '}
            <select value={trial.id} disabled>
              <option>{trial.id} · EGFR-mutant NSCLC</option>
            </select>
          </label>
          <label>
            Focus site{' '}
            <select value={selectedSite} onChange={(event) => setSelectedSite(event.target.value)}>
              {sites.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.city} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={() => setSection('payoff')}>
            Open operations payoff
          </button>
        </>
      }
    >
      {section === 'launch' && (
        <OperationsRoom
          queried={queried}
          selectedSite={selectedSite}
          onSelectSite={(id) => setSelectedSite(id)}
          onStart={() => go('sites')}
          funnel={funnel}
          focusedSite={site}
        />
      )}
      {section === 'sites' && (
        <Sites
          queried={queried}
          selectedSite={selectedSite}
          funnel={funnel}
          onSelect={(id) => {
            setSelectedSite(id);
            setSection('screening');
          }}
        />
      )}
      {section === 'screening' && (
        <Screening
          site={site}
          patients={sitePatients}
          status={candidateStatus}
          onStatus={(id, value) => setCandidateStatus((current) => ({ ...current, [id]: value }))}
          tab={tab}
          onTab={setTab}
          funnel={funnel}
        />
      )}
      {section === 'actions' && (
        <Actions
          site={site}
          patients={sitePatients}
          comparatorStatus={comparatorStatus}
          onComparatorStatus={(id, value) => setComparatorStatus((current) => ({ ...current, [id]: value }))}
          outreachStatus={outreachStatus}
          setOutreachStatus={setOutreachStatus}
          cohortStatus={cohortStatus}
          setCohortStatus={setCohortStatus}
          runAssistant={runAssistant}
          assistantLoading={assistantLoading}
          assistantStarted={assistantStarted}
          assistantRuns={assistantRuns}
          assistantResult={assistantResult}
          assistantError={assistantError}
          readiness={readiness}
        />
      )}
      {section === 'payoff' && (
        <Payoff
          forecast={forecastAfterActions}
          approvedControls={approvedControls}
          outreachStatus={outreachStatus}
          cohortStatus={cohortStatus}
          readiness={readiness}
          funnel={funnel}
        />
      )}
    </HospitalShell>
  );
}

function OperationsRoom({
  queried,
  selectedSite,
  onSelectSite,
  onStart,
  funnel,
  focusedSite,
}: {
  queried: boolean;
  selectedSite: string;
  onSelectSite: (id: string) => void;
  onStart: () => void;
  funnel: ReturnType<typeof buildFunnel>;
  focusedSite: Site;
}) {
  return (
    <div className="trial-ops-layout">
      <Panel
        title="European site network · live trial operations"
        actions={
          <button type="button" className="hx-btn primary" onClick={onStart}>
            {queried ? 'Refresh site signals →' : 'Broadcast launch query →'}
          </button>
        }
      >
        <SiteNetwork queried={queried} selectedSite={selectedSite} onSelect={onSelectSite} />
      </Panel>
      <div className="trial-engine-stack">
        <Panel title="Live recruitment funnel">
          <RecruitmentFunnel funnel={funnel} />
        </Panel>
        <Panel title={`Lagging site cause · ${focusedSite.city}`}>
          <LaggingCause site={focusedSite} />
        </Panel>
      </div>
    </div>
  );
}

function Sites({
  queried,
  selectedSite,
  funnel,
  onSelect,
}: {
  queried: boolean;
  selectedSite: string;
  funnel: ReturnType<typeof buildFunnel>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="trial-ops-layout">
      <div className="trial-engine-stack">
        <Backstage
          title="Behind the scenes – European launch signal"
          stages={siteStages}
          running={queried}
          note="Simulated federation: site counts and bottleneck signals move; patient-level data stays synthetic for this demo."
        />
        <Panel title="Geographic signal grid">
          <SiteNetwork queried={queried} selectedSite={selectedSite} onSelect={onSelect} />
        </Panel>
      </div>
      <div className="trial-engine-stack">
        <Panel title="Country counts updating">
          <CountryCounts queried={queried} />
        </Panel>
        <Panel title="Forecast after site responses">
          <RecruitmentFunnel funnel={funnel} />
        </Panel>
      </div>
    </div>
  );
}

function Screening({
  site,
  patients,
  status,
  onStatus,
  tab,
  onTab,
  funnel,
}: {
  site: Site;
  patients: Candidate[];
  status: Record<string, Status>;
  onStatus: (id: string, value: Status) => void;
  tab: string;
  onTab: (tab: string) => void;
  funnel: ReturnType<typeof buildFunnel>;
}) {
  return (
    <div className="trial-engine-stack">
      <Tabs
        active={tab}
        onChange={onTab}
        tabs={[
          { id: 'signal', label: `Signal cause · ${site.city}` },
          { id: 'patients', label: 'Investigator review queue' },
          { id: 'funnel', label: 'Funnel impact' },
        ]}
      />
      {tab === 'signal' && (
        <div className="trial-ops-layout compact">
          <Panel title={`${site.name} · operational bottleneck`}>
            <LaggingCause site={site} />
          </Panel>
          <Panel title="Site signal board">
            <SiteSignalRows selectedSite={site.id} onSelect={() => undefined} />
          </Panel>
        </div>
      )}
      {tab === 'patients' && (
        <Panel title={`${site.name} · investigator review queue, not patient chart`}>
          <DataTable
            rowKey={(patient) => patient.id}
            rows={patients}
            rowTone={(patient) => (patient.status === 'exclude' ? 'crit' : patient.status === 'needs data' ? 'warn' : undefined)}
            columns={[
              { key: 'id', label: 'Site record', width: '90px' },
              { key: 'profile', label: 'Synthetic profile' },
              {
                key: 'status',
                label: 'Screening state',
                render: (patient) => <Pill tone={patient.status === 'match' ? 'ok' : patient.status === 'needs data' ? 'warn' : 'crit'}>{patient.status}</Pill>,
              },
              { key: 'reason', label: 'Reason' },
              { key: 'missing', label: 'Operational blocker', render: (patient) => patient.missing || '—' },
              {
                key: 'decision',
                label: 'Investigator action',
                render: (patient) => <DecisionButtons value={status[patient.id] ?? 'pending'} onChange={(value) => onStatus(patient.id, value)} />,
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'funnel' && (
        <Panel title="Funnel impact from this lagging site">
          <RecruitmentFunnel funnel={funnel} highlightSite={site} />
        </Panel>
      )}
    </div>
  );
}

function Actions({
  site,
  patients,
  comparatorStatus,
  onComparatorStatus,
  outreachStatus,
  setOutreachStatus,
  cohortStatus,
  setCohortStatus,
  runAssistant,
  assistantLoading,
  assistantStarted,
  assistantRuns,
  assistantResult,
  assistantError,
  readiness,
}: {
  site: Site;
  patients: Candidate[];
  comparatorStatus: Record<string, Status>;
  onComparatorStatus: (id: string, value: Status) => void;
  outreachStatus: Status;
  setOutreachStatus: (value: Status) => void;
  cohortStatus: Status;
  setCohortStatus: (value: Status) => void;
  runAssistant: () => void;
  assistantLoading: boolean;
  assistantStarted: boolean;
  assistantRuns: number;
  assistantResult: AgentResult | null;
  assistantError: string | null;
  readiness: { label: string; tone: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' };
}) {
  const cohortRows = patients.filter((patient) => patient.comparator);
  return (
    <div className="trial-ops-layout">
      <div className="trial-engine-stack">
        <Panel
          title="Approved outreach lane · recruitment operations"
          actions={
            <button type="button" className="hx-btn primary" onClick={runAssistant} disabled={assistantLoading}>
              {assistantLoading ? (
                <>
                  <span className="hx-spinner" aria-hidden /> Assistant drafting…
                </>
              ) : (
                'Ask assistant to draft'
              )}
            </button>
          }
        >
          <pre className="trial-engine-letter">{`To: ${site.name} research coordinator
Subject: EU-LUNG-17 site signal follow-up

Signal status: ${site.city} is ${site.status}; cause: ${site.bottleneck}.
Please clear missing-data fields, move eligible rows to investigator review, and report which patients can be approached this week.

This is a hackathon prototype using synthetic data only.`}</pre>
          <div className="trial-engine-actions">
            <span>Coordinator outreach:</span>
            <DecisionButtons value={outreachStatus} onChange={setOutreachStatus} />
          </div>
        </Panel>
        <Panel title="External-control cohort lane · kept separate from recruitment">
          <ControlCohortPanel
            rows={cohortRows}
            comparatorStatus={comparatorStatus}
            onComparatorStatus={onComparatorStatus}
            cohortStatus={cohortStatus}
            setCohortStatus={setCohortStatus}
            readiness={readiness}
          />
        </Panel>
      </div>
      <Panel title={assistantResult ? assistantResult.headline : 'Assistant reasoning'}>
        {assistantError && <p className="error">{assistantError}</p>}
        <Backstage
          key={assistantRuns}
          title="Behind the scenes – trial operations engine"
          stages={assistantStages}
          running={assistantStarted}
          holdLast
          release={!assistantLoading}
          note="The backend route calls the Copilot SDK agent when configured; otherwise this shows a deterministic demo path."
        />
        {!assistantStarted && <span className="hx-empty">Click “Ask assistant to draft” to see the tool-backed operations proposal.</span>}
        {assistantLoading && <Working label="Waiting for assistant output" hint="AI answers can take up to a minute" />}
        {assistantResult && (
          <div className="blocks">
            {assistantResult.note && <p className="note">{assistantResult.note}</p>}
            {assistantResult.blocks.map((block, index) => (
              <RenderBlock key={index} block={block} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Payoff({
  forecast,
  approvedControls,
  outreachStatus,
  cohortStatus,
  readiness,
  funnel,
}: {
  forecast: number;
  approvedControls: number;
  outreachStatus: Status;
  cohortStatus: Status;
  readiness: { label: string; tone: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' };
  funnel: ReturnType<typeof buildFunnel>;
}) {
  const expectedDate = forecast >= 90 ? '18 Nov 2026' : forecast >= 82 ? '02 Dec 2026' : '19 Dec 2026';
  const sitesNeedingAction = sites.filter((site) => site.status === 'lagging');
  return (
    <div className="trial-ops-layout">
      <Panel title="Operations payoff dashboard">
        <div className="trial-engine-metrics wide">
          <Metric label="Expected recruitment date" value={expectedDate} />
          <Metric label="Forecast after approvals" value={`${forecast} / ${trial.target}`} />
          <Metric label="Sites needing action" value={sitesNeedingAction.length} />
          <Metric label="Control readiness" value={readiness.label} />
        </div>
        <div className="ops-dashboard-grid">
          <section>
            <h4>Sites needing action</h4>
            {sitesNeedingAction.map((site) => (
              <p key={site.id}>
                <Pill tone="warn">{site.city}</Pill> {site.bottleneck}
              </p>
            ))}
          </section>
          <section>
            <h4>Approved operations</h4>
            <p>
              Outreach:{' '}
              <Pill tone={outreachStatus === 'approved' ? 'ok' : outreachStatus === 'dismissed' ? 'crit' : 'neutral'}>{outreachStatus}</Pill>
            </p>
            <p>
              Control cohort:{' '}
              <Pill tone={cohortStatus === 'approved' ? 'ok' : cohortStatus === 'dismissed' ? 'crit' : 'neutral'}>{cohortStatus}</Pill>
            </p>
            <p>
              Comparator entries approved: <Pill tone={approvedControls > 0 ? 'ok' : 'neutral'}>{approvedControls}</Pill>
            </p>
          </section>
        </div>
        <p className="note">
          Nothing here enrols a patient. Investigators confirm eligibility, patients and clinicians decide on participation, and statisticians approve the real-world evidence design.
        </p>
      </Panel>
      <div className="trial-engine-stack">
        <Panel title="Final recruitment funnel">
          <RecruitmentFunnel funnel={funnel} />
        </Panel>
        <Panel title="External-control balance readiness">
          <BalanceIndicators />
          <p>
            Readiness: <Pill tone={readiness.tone}>{readiness.label}</Pill>
          </p>
        </Panel>
      </div>
    </div>
  );
}

function SiteNetwork({ queried, selectedSite, onSelect }: { queried: boolean; selectedSite: string; onSelect: (id: string) => void }) {
  return (
    <div className="site-network-shell">
      <div className="site-network-map" aria-label="Synthetic European trial site network">
        <div className="map-label north">North Sea</div>
        <div className="map-label south">Mediterranean</div>
        <div className="map-route route-1" />
        <div className="map-route route-2" />
        <div className="map-route route-3" />
        {sites.map((site, index) => {
          const phase = signalPhase(site, queried, index);
          return (
            <button
              key={site.id}
              type="button"
              className={`site-node ${phaseClass(phase)} ${site.status} ${site.id === selectedSite ? 'selected' : ''}`}
              style={{ left: `${site.x}%`, top: `${site.y}%` }}
              onClick={() => onSelect(site.id)}
            >
              <span className="node-pulse" />
              <strong>{site.country}</strong>
              <small>{site.city}</small>
              <span>{site.eligible} found</span>
            </button>
          );
        })}
      </div>
      <SiteSignalRows selectedSite={selectedSite} onSelect={onSelect} queried={queried} />
    </div>
  );
}

function SiteSignalRows({
  selectedSite,
  onSelect,
  queried = true,
}: {
  selectedSite: string;
  onSelect: (id: string) => void;
  queried?: boolean;
}) {
  return (
    <div className="site-signal-rows">
      {sites.map((site, index) => {
        const phase = signalPhase(site, queried, index);
        return (
          <button key={site.id} type="button" className={site.id === selectedSite ? 'active' : undefined} onClick={() => onSelect(site.id)}>
            <span className={`signal-dot ${phaseClass(phase)}`} />
            <strong>{site.city}</strong>
            <span>{phase}</span>
            <Pill tone={site.status === 'lagging' ? 'warn' : 'ok'}>{site.status}</Pill>
          </button>
        );
      })}
    </div>
  );
}

function CountryCounts({ queried }: { queried: boolean }) {
  return (
    <DataTable
      rowKey={(site) => site.id}
      rows={sites}
      rowTone={(site) => (site.status === 'lagging' ? 'warn' : undefined)}
      columns={[
        { key: 'country', label: 'Country' },
        { key: 'city', label: 'Site' },
        { key: 'signal', label: 'Signal', render: (site) => signalPhase(site, queried, sites.indexOf(site)) },
        { key: 'potential', label: 'Potentially eligible' },
        { key: 'missingData', label: 'Missing data' },
        { key: 'review', label: 'Review' },
        { key: 'enrolled', label: 'Enrolled' },
      ]}
    />
  );
}

function RecruitmentFunnel({ funnel, highlightSite }: { funnel: ReturnType<typeof buildFunnel>; highlightSite?: Site }) {
  const max = Math.max(...funnel.map((step) => step.value));
  return (
    <div className="funnel-board">
      {funnel.map((step) => (
        <div key={step.label} className="funnel-step">
          <div className="funnel-head">
            <strong>{step.label}</strong>
            <span>{step.value}</span>
          </div>
          <div className="funnel-track">
            <span style={{ width: `${Math.max(8, (step.value / max) * 100)}%` }} />
          </div>
          <small>{step.detail}</small>
        </div>
      ))}
      {highlightSite && (
        <p className="note">
          {highlightSite.city} contributes {highlightSite.potential} potentially eligible records, but {highlightSite.missingData} are still blocked by missing data.
        </p>
      )}
    </div>
  );
}

function LaggingCause({ site }: { site: Site }) {
  return (
    <div className="lagging-cause">
      <div className="cause-primary">
        <Pill tone={site.status === 'lagging' ? 'warn' : 'ok'}>{site.status}</Pill>
        <strong>{site.bottleneck}</strong>
      </div>
      <div className="trial-engine-metrics">
        <Metric label="Potential" value={site.potential} />
        <Metric label="Missing data" value={site.missingData} />
        <Metric label="Review queue" value={site.review} />
      </div>
      <p>
        Immediate action: clear missing fields, move confirmed matches to investigator review, then approve coordinator outreach.
      </p>
    </div>
  );
}

function ControlCohortPanel({
  rows,
  comparatorStatus,
  onComparatorStatus,
  cohortStatus,
  setCohortStatus,
  readiness,
}: {
  rows: Candidate[];
  comparatorStatus: Record<string, Status>;
  onComparatorStatus: (id: string, value: Status) => void;
  cohortStatus: Status;
  setCohortStatus: (value: Status) => void;
  readiness: { label: string; tone: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' };
}) {
  return (
    <div className="trial-engine-stack">
      <BalanceIndicators />
      <DataTable
        rowKey={(patient) => patient.id}
        rows={rows}
        columns={[
          { key: 'id', label: 'Control record' },
          { key: 'profile', label: 'Comparable profile' },
          { key: 'controlGap', label: 'Balance contribution' },
          {
            key: 'decision',
            label: 'Statistician queue',
            render: (patient) => (
              <DecisionButtons value={comparatorStatus[patient.id] ?? 'pending'} onChange={(value) => onComparatorStatus(patient.id, value)} />
            ),
          },
        ]}
      />
      <div className="trial-engine-actions">
        <span>Evidence-design approval:</span>
        <DecisionButtons value={cohortStatus} onChange={setCohortStatus} />
        <Pill tone={readiness.tone}>{readiness.label}</Pill>
      </div>
    </div>
  );
}

function BalanceIndicators() {
  return (
    <div className="balance-grid">
      {balanceRows.map((row) => (
        <div key={row.characteristic} className={`balance-card ${row.balance}`}>
          <div>
            <strong>{row.characteristic}</strong>
            <Pill tone={row.balance === 'good' ? 'ok' : row.balance === 'gap' ? 'crit' : 'warn'}>{row.balance}</Pill>
          </div>
          <span>Trial {row.trial} · control {row.control}</span>
          <small>{row.action}</small>
        </div>
      ))}
    </div>
  );
}

function DecisionButtons({ value, onChange }: { value: Status; onChange: (value: Status) => void }) {
  if (value !== 'pending') {
    return (
      <span className="trial-engine-actions">
        <Pill tone={value === 'approved' ? 'ok' : 'crit'}>{value}</Pill>
        <button type="button" className="hx-btn" onClick={() => onChange('pending')}>
          Undo
        </button>
      </span>
    );
  }
  return (
    <span className="trial-engine-actions">
      <button type="button" className="hx-btn primary" onClick={() => onChange('approved')}>
        Approve
      </button>
      <button type="button" className="hx-btn" onClick={() => onChange('dismissed')}>
        Dismiss
      </button>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="trial-engine-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function signalPhase(site: Site, queried: boolean, index: number): SignalPhase {
  if (!queried) return 'queried';
  if (site.status === 'lagging') return 'investigator review';
  return index % 2 === 0 ? 'patients found' : 'responding';
}

function phaseClass(phase: SignalPhase) {
  return phase.replaceAll(' ', '-');
}

function buildFunnel(forecast: number, candidateStatus: Record<string, Status>, outreachStatus: Status) {
  const approved = Object.values(candidateStatus).filter((value) => value === 'approved').length;
  const approachedBonus = outreachStatus === 'approved' ? 5 : 0;
  return [
    {
      label: 'Potentially eligible',
      value: sites.reduce((sum, site) => sum + site.potential, 0),
      detail: 'Synthetic records surfaced across connected sites',
    },
    {
      label: 'Missing data',
      value: Math.max(0, sites.reduce((sum, site) => sum + site.missingData, 0) - approved),
      detail: 'Mutation, prior-treatment or document gaps blocking confirmation',
    },
    {
      label: 'Investigator review',
      value: sites.reduce((sum, site) => sum + site.review, 0) + approved,
      detail: 'Human eligibility confirmation queue',
    },
    {
      label: 'Approached',
      value: sites.reduce((sum, site) => sum + site.approached, 0) + approachedBonus,
      detail: 'Coordinator outreach approved or ready to send',
    },
    { label: 'Enrolled', value: Math.min(trial.target, forecast), detail: 'Forecasted enrolment after approved operations' },
  ];
}

function controlReadiness(approvedControls: number, cohortStatus: Status): { label: string; tone: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' } {
  if (cohortStatus === 'dismissed') return { label: 'paused', tone: 'crit' };
  if (cohortStatus === 'approved' && approvedControls >= 2) return { label: 'ready', tone: 'ok' };
  if (approvedControls > 0) return { label: 'partial', tone: 'warn' };
  return { label: 'not ready', tone: 'neutral' };
}

function pendingCount(status: Record<string, Status>, rows: Candidate[]) {
  return rows.filter((row) => (status[row.id] ?? 'pending') === 'pending').length;
}

function nextLabel(section: Section) {
  switch (section) {
    case 'launch':
      return 'Broadcast launch query';
    case 'sites':
      return 'Open lagging signal';
    case 'screening':
      return 'Approve operations';
    case 'actions':
      return 'Show payoff dashboard';
    default:
      return undefined;
  }
}
