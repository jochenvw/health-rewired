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
  tagline: 'Launch a lung-cancer trial across synthetic European sites, spot bottlenecks, and build the comparison cohort.',
};

type Section = 'launch' | 'sites' | 'screening' | 'actions' | 'payoff';
type Status = 'pending' | 'approved' | 'dismissed';
type Site = {
  id: string;
  name: string;
  country: string;
  eligible: number;
  enrolled: number;
  forecast: number;
  status: 'on track' | 'lagging';
  bottleneck: string;
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
};

const story: StoryStep[] = [
  {
    id: 'launch',
    title: 'Open the trial',
    explain: 'The coordinator opens a synthetic EGFR-mutant lung-cancer trial and sees the launch target.',
  },
  {
    id: 'sites',
    title: 'Check Europe',
    explain: 'Connected hospitals answer with counts and a recruitment forecast. Data stays at each site in this demo story.',
  },
  {
    id: 'screening',
    title: 'Explain matches',
    explain: 'Click a lagging site to see who fits, who is excluded, and which fields block confirmation.',
  },
  {
    id: 'actions',
    title: 'Approve outreach',
    explain: 'The assistant drafts coordinator outreach and synthetic control-cohort entries; people approve or dismiss each one.',
  },
  {
    id: 'payoff',
    title: 'Updated forecast',
    explain: 'The payoff: recruitment is clearer and the real-world comparator cohort grows alongside the trial.',
  },
];

const siteStages: Stage[] = [
  { label: 'Querying connected hospitals', detail: '4 synthetic European sites · data stays local', ms: 700 },
  { label: 'Harmonising trial criteria', detail: 'EGFR mutation, metastatic stage, ECOG, prior treatment', ms: 800 },
  { label: 'Forecasting recruitment by site', detail: 'Current enrolment + screened eligible + missing-data drag', ms: 900 },
  { label: 'Flagging lagging sites', detail: 'Milano and Barcelona need coordinator follow-up' },
];

const assistantStages: Stage[] = [
  { label: 'Reading site screening extracts', detail: 'Synthetic EHR rows from the selected hospital', ms: 700 },
  { label: 'Explaining match and exclusion reasons', detail: 'Mutation, stage, ECOG and treatment history', ms: 900 },
  { label: 'Drafting outreach and comparator entries', detail: 'Nothing is sent or filed without approval' },
];

const sites: Site[] = [
  {
    id: 'MUC',
    name: 'Klinikum Rewired München',
    country: 'DE',
    eligible: 9,
    enrolled: 6,
    forecast: 18,
    status: 'on track',
    bottleneck: 'screening list refreshed this morning',
  },
  {
    id: 'MIL',
    name: 'Istituto Oncologico Milano',
    country: 'IT',
    eligible: 7,
    enrolled: 2,
    forecast: 11,
    status: 'lagging',
    bottleneck: 'prior-treatment fields missing in three records',
  },
  {
    id: 'AMS',
    name: 'Amsterdam Thoracic Cancer Centre',
    country: 'NL',
    eligible: 5,
    enrolled: 4,
    forecast: 14,
    status: 'on track',
    bottleneck: 'awaiting two patient discussions',
  },
  {
    id: 'BCN',
    name: 'Hospital del Mar Barcelona',
    country: 'ES',
    eligible: 6,
    enrolled: 1,
    forecast: 8,
    status: 'lagging',
    bottleneck: 'pathology addendum delayed',
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
  const [selectedSite, setSelectedSite] = useState('MIL');
  const [tab, setTab] = useState('patients');
  const [queried, setQueried] = useState(false);
  const [assistantStarted, setAssistantStarted] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantRuns, setAssistantRuns] = useState(0);
  const [assistantResult, setAssistantResult] = useState<AgentResult | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<Record<string, Status>>({});
  const [outreachStatus, setOutreachStatus] = useState<Status>('pending');
  const [cohortStatus, setCohortStatus] = useState<Status>('pending');

  const site = sites.find((item) => item.id === selectedSite) ?? sites[1];
  const sitePatients = useMemo(() => candidates.filter((candidate) => candidate.site === selectedSite), [selectedSite]);
  const approvedMatches = sitePatients.filter((candidate) => candidateStatus[candidate.id] === 'approved').length;
  const approvedControls = candidates.filter((candidate) => candidate.comparator && candidateStatus[candidate.id] === 'approved').length;
  const forecastAfterActions = trial.forecast + approvedMatches * 3 + (outreachStatus === 'approved' ? 5 : 0);

  const go = (id: string) => {
    setSection(id as Section);
    if (id === 'sites') setQueried(true);
    if (id === 'screening' && selectedSite === 'MUC') setSelectedSite('MIL');
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
      module="European trial launch"
      guide={<StoryGuide steps={story} current={section} onGo={go} nextLabel={nextLabel(section)} />}
      nav={[
        { id: 'launch', label: 'Trial launch', badge: trial.id },
        { id: 'sites', label: 'European sites', badge: sites.length },
        { id: 'screening', label: 'Eligibility screening', badge: sitePatients.length },
        { id: 'actions', label: 'Human approvals', badge: pendingCount(candidateStatus, sitePatients) },
        { id: 'payoff', label: 'Forecast & control cohort', badge: approvedControls || undefined },
      ]}
      active={section}
      onNav={go}
      patient={{
        id: trial.id,
        name: 'EU Lung Trial',
        diagnosis: trial.title,
        ward: 'Research office · synthetic launch',
        allergies: 'Prototype – synthetic data – not for clinical use',
      }}
      toolbar={
        <>
          <label>
            Trial{' '}
            <select value={trial.id} onChange={() => undefined}>
              <option>{trial.id} · EGFR-mutant NSCLC</option>
            </select>
          </label>
          <label>
            Focus site{' '}
            <select value={selectedSite} onChange={(event) => setSelectedSite(event.target.value)}>
              {sites.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={() => setSection('payoff')}>
            Open payoff view
          </button>
        </>
      }
    >
      {section === 'launch' && <Launch onStart={() => go('sites')} />}
      {section === 'sites' && (
        <Sites
          queried={queried}
          selectedSite={selectedSite}
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
        />
      )}
      {section === 'actions' && (
        <Actions
          site={site}
          patients={sitePatients}
          candidateStatus={candidateStatus}
          onCandidateStatus={(id, value) => setCandidateStatus((current) => ({ ...current, [id]: value }))}
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
        />
      )}
      {section === 'payoff' && (
        <Payoff
          forecast={forecastAfterActions}
          approvedControls={approvedControls}
          outreachStatus={outreachStatus}
          cohortStatus={cohortStatus}
        />
      )}
    </HospitalShell>
  );
}

function Launch({ onStart }: { onStart: () => void }) {
  return (
    <div className="trial-engine-layout">
      <Panel
        title="Trial launch worklist"
        actions={
          <button type="button" className="hx-btn primary" onClick={onStart}>
            Send launch query to hospitals →
          </button>
        }
      >
        <DataTable
          rowKey={(row) => row.id}
          selected={trial.id}
          rows={[
            { id: trial.id, title: trial.title, tumour: 'NSCLC', phase: 'II', opened: 'Today 08:10', target: trial.target },
            {
              id: 'EU-BREAST-09',
              title: 'HER2-low escalation registry',
              tumour: 'Breast',
              phase: 'Registry',
              opened: 'Yesterday',
              target: 140,
            },
            { id: 'EU-CRC-22', title: 'ctDNA-guided colorectal adjuvant study', tumour: 'CRC', phase: 'III', opened: 'Next week', target: 220 },
          ]}
          columns={[
            { key: 'id', label: 'Trial' },
            { key: 'title', label: 'Title', render: (row) => <strong>{row.title}</strong> },
            { key: 'tumour', label: 'Tumour' },
            { key: 'phase', label: 'Phase' },
            { key: 'opened', label: 'Opened' },
            { key: 'target', label: 'Target' },
          ]}
        />
      </Panel>
      <Panel title="Eligibility criteria">
        <dl className="hx-facts">
          <dt>Primary endpoint</dt>
          <dd>Progression-free survival at 12 months</dd>
          <dt>Recruitment target</dt>
          <dd>{trial.target} patients across Europe</dd>
          <dt>Current enrolment</dt>
          <dd>{trial.enrolled} patients</dd>
          <dt>Initial forecast</dt>
          <dd>
            <Pill tone="warn">{trial.forecast} / {trial.target}</Pill>
          </dd>
        </dl>
        <ul>
          {trial.inclusion.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Sites({
  queried,
  selectedSite,
  onSelect,
}: {
  queried: boolean;
  selectedSite: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="trial-engine-stack">
      <Backstage
        title="Behind the scenes – launch query"
        stages={siteStages}
        running={queried}
        note="Simulated federation: only counts and match explanations return to this screen."
      />
      <Panel title="Partner hospitals">
        <div className="trial-engine-site-grid">
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              className={`trial-engine-site ${site.id === selectedSite ? 'active' : ''}`}
              onClick={() => onSelect(site.id)}
            >
              <strong>{site.name}</strong>
              <span>{site.country} · {site.bottleneck}</span>
              <span>
                <Pill tone={site.status === 'lagging' ? 'warn' : 'ok'}>{site.status}</Pill>
              </span>
              <div className="trial-engine-metrics">
                <Metric label="Eligible" value={site.eligible} />
                <Metric label="Enrolled" value={site.enrolled} />
                <Metric label="Forecast" value={site.forecast} />
              </div>
            </button>
          ))}
        </div>
      </Panel>
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
}: {
  site: Site;
  patients: Candidate[];
  status: Record<string, Status>;
  onStatus: (id: string, value: Status) => void;
  tab: string;
  onTab: (tab: string) => void;
}) {
  return (
    <div className="trial-engine-stack">
      <Tabs
        active={tab}
        onChange={onTab}
        tabs={[
          { id: 'patients', label: `Patients at ${site.country}` },
          { id: 'bottleneck', label: 'Bottleneck' },
        ]}
      />
      {tab === 'patients' && (
        <Panel title={`${site.name} · assistant screening explanations`}>
          <DataTable
            rowKey={(patient) => patient.id}
            rows={patients}
            rowTone={(patient) => (patient.status === 'exclude' ? 'crit' : patient.status === 'needs data' ? 'warn' : undefined)}
            columns={[
              { key: 'id', label: 'Record', width: '80px' },
              { key: 'name', label: 'Patient', render: (patient) => <strong>{patient.name}</strong> },
              { key: 'profile', label: 'Profile' },
              {
                key: 'status',
                label: 'AI screen',
                render: (patient) => <Pill tone={patient.status === 'match' ? 'ok' : patient.status === 'needs data' ? 'warn' : 'crit'}>{patient.status}</Pill>,
              },
              { key: 'reason', label: 'Why' },
              { key: 'missing', label: 'Missing data', render: (patient) => patient.missing || '—' },
              {
                key: 'decision',
                label: 'Human decision',
                render: (patient) => <DecisionButtons value={status[patient.id] ?? 'pending'} onChange={(value) => onStatus(patient.id, value)} />,
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'bottleneck' && (
        <Panel title="Why recruitment is lagging">
          <p>
            <Pill tone="warn">Lagging</Pill> {site.name} has {site.eligible} potentially eligible records but only {site.enrolled} enrolled.
          </p>
          <p>{site.bottleneck}. The next useful action is to ask the local coordinator to confirm missing data, not to auto-enrol anyone.</p>
        </Panel>
      )}
    </div>
  );
}

function Actions({
  site,
  patients,
  candidateStatus,
  onCandidateStatus,
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
}: {
  site: Site;
  patients: Candidate[];
  candidateStatus: Record<string, Status>;
  onCandidateStatus: (id: string, value: Status) => void;
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
}) {
  const cohortRows = patients.filter((patient) => patient.comparator);
  return (
    <div className="trial-engine-layout">
      <div className="trial-engine-stack">
        <Panel
          title="Assistant draft for the site coordinator"
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
Subject: EU-LUNG-17 screening follow-up

Your site has ${site.eligible} synthetic records flagged for EGFR-mutant NSCLC screening.
Please confirm missing EGFR/prior-treatment fields for the pending patients below and tell us which patients are ready for investigator review.

This is a hackathon prototype using synthetic data only.`}</pre>
          <div className="trial-engine-actions">
            <DecisionButtons value={outreachStatus} onChange={setOutreachStatus} />
          </div>
        </Panel>
        <Panel title="Comparable synthetic real-world control queue">
          <DataTable
            rowKey={(patient) => patient.id}
            rows={cohortRows}
            columns={[
              { key: 'id', label: 'Record' },
              { key: 'name', label: 'Patient' },
              { key: 'profile', label: 'Why comparable' },
              { key: 'reason', label: 'Agent explanation' },
              {
                key: 'decision',
                label: 'Decision',
                render: (patient) => (
                  <DecisionButtons value={candidateStatus[patient.id] ?? 'pending'} onChange={(value) => onCandidateStatus(patient.id, value)} />
                ),
              },
            ]}
          />
          <p>
            Cohort design status: <DecisionButtons value={cohortStatus} onChange={setCohortStatus} />
          </p>
        </Panel>
      </div>
      <Panel title={assistantResult ? assistantResult.headline : 'Assistant reasoning'}>
        {assistantError && <p className="error">{assistantError}</p>}
        <Backstage
          key={assistantRuns}
          title="Behind the scenes – trial engine"
          stages={assistantStages}
          running={assistantStarted}
          holdLast
          release={!assistantLoading}
          note="The backend route calls the Copilot SDK agent when configured; otherwise this shows a deterministic demo path."
        />
        {!assistantStarted && <span className="hx-empty">Click “Ask assistant to draft” to see the tool-backed proposal.</span>}
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
}: {
  forecast: number;
  approvedControls: number;
  outreachStatus: Status;
  cohortStatus: Status;
}) {
  return (
    <div className="trial-engine-layout">
      <Panel title="Updated recruitment forecast">
        <div className="trial-engine-metrics">
          <Metric label="Original forecast" value={trial.forecast} />
          <Metric label="After approvals" value={forecast} />
          <Metric label="Target" value={trial.target} />
        </div>
        <DataTable
          rowKey={(site) => site.id}
          rows={sites}
          rowTone={(site) => (site.status === 'lagging' ? 'warn' : undefined)}
          columns={[
            { key: 'name', label: 'Site' },
            { key: 'enrolled', label: 'Enrolled' },
            { key: 'eligible', label: 'Eligible found' },
            { key: 'forecast', label: 'Forecast' },
            { key: 'status', label: 'Status', render: (site) => <Pill tone={site.status === 'lagging' ? 'warn' : 'ok'}>{site.status}</Pill> },
          ]}
        />
      </Panel>
      <Panel title="Payoff screen">
        <p>
          <Pill tone={forecast >= trial.target ? 'ok' : 'warn'}>{forecast} / {trial.target}</Pill> forecasted recruits after human-approved outreach.
        </p>
        <p>
          <Pill tone={approvedControls > 0 ? 'ok' : 'neutral'}>{approvedControls}</Pill> comparable synthetic non-trial patients queued for statistician review.
        </p>
        <p>
          Outreach: <Pill tone={outreachStatus === 'approved' ? 'ok' : outreachStatus === 'dismissed' ? 'crit' : 'neutral'}>{outreachStatus}</Pill>{' '}
          · evidence design: <Pill tone={cohortStatus === 'approved' ? 'ok' : cohortStatus === 'dismissed' ? 'crit' : 'neutral'}>{cohortStatus}</Pill>
        </p>
        <p className="note">
          Nothing here enrols a patient. Investigators confirm eligibility, patients and clinicians decide on participation, and statisticians approve the real-world evidence design.
        </p>
      </Panel>
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

function pendingCount(status: Record<string, Status>, rows: Candidate[]) {
  return rows.filter((row) => (status[row.id] ?? 'pending') === 'pending').length;
}

function nextLabel(section: Section) {
  switch (section) {
    case 'launch':
      return 'Send launch query';
    case 'sites':
      return 'Open lagging site';
    case 'screening':
      return 'Draft outreach';
    case 'actions':
      return 'Show payoff';
    default:
      return undefined;
  }
}
