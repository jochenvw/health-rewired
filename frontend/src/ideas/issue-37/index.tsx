import { useEffect, useState, type ReactNode } from 'react';
import { api, type AgentResult, type NetworkSnapshot, type PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import { CohortLandscape } from './CohortLandscape';
import { CountryMixBar, NetworkMap, type NetworkPhase } from './NetworkMap';
import './issue-37.css';

/*
 * Issue #37 is a cross-hospital federated-learning workspace, not bedside patient-chart care, so
 * it uses a purpose-built shell (this file) rather than <HospitalShell> — per
 * .github/hackathon/implementation-guidelines.md rule 7 ("research networks, trial operations,
 * federated learning ... a purpose-built issue-local shell may fit better"). It still follows the
 * shared design language (.github/hackathon/design-language.md): institutional chrome, --cp-*
 * tokens, an inspection drawer, and reuses StoryGuide/Backstage/Panel/DataTable/Tabs/Pill for the
 * parts they already cover well.
 */

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

const SECTION_DETAIL: Record<Section, string> = {
  worklist: '3 cases today',
  chart: 'EGFR ex19del · new nodule',
  network: 'Federated query · 9 sites',
  decide: 'Human decision required',
};

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
    explain: 'A structured, privacy-preserving query goes out to a simulated network of hospitals across Europe.',
  },
  {
    id: 'decide',
    title: 'Decide & feed back',
    explain: 'You and the patient decide. Recording the outcome feeds the learning system for the next clinician.',
  },
];

const networkStages: Stage[] = [
  { label: 'Turning the profile into a comparability query', detail: 'Lung adenocarcinoma · EGFR exon 19 deletion · oligometastatic', ms: 500 },
  { label: 'Querying the network — each hospital searches locally', detail: 'Only counts and summaries leave each site, never raw records', ms: 700 },
  { label: 'Charité Berlin · AKH Wien · Gustave Roussy · 6 more sites responding', ms: 700 },
  { label: 'Grouping comparable patients by the approach they received', ms: 600 },
  { label: 'Checking whether the evidence is strong enough to lean on', detail: 'Cohort size, hospital spread, follow-up length', ms: 500 },
];

function dominantCountry(cases: { country: string }[]): string | null {
  if (cases.length < 2) return null;
  const counts = new Map<string, number>();
  for (const c of cases) counts.set(c.country, (counts.get(c.country) ?? 0) + 1);
  const [country, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / cases.length > 0.6 ? country : null;
}

export default function EuropeanLearningNetwork() {
  const [section, setSection] = useState<Section>('worklist');
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [logCount, setLogCount] = useState(0);
  const [justFedBack, setJustFedBack] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    api.patient(PATIENT_ID).then(setRecord).catch(() => setRecord(null));
    refreshLog();
    const t = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const refreshLog = () => {
    api
      .networkLearningLog()
      .then((entries) => setLogCount(entries.length))
      .catch(() => undefined);
  };

  const askNetwork = async () => {
    setRuns((n) => n + 1);
    setSnapshot(null);
    setResult(null);
    setError(null);
    setLoading(true);
    setStarted(true);
    try {
      const [snap] = await Promise.all([
        api.networkSnapshot(PATIENT_ID),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      setSnapshot(snap);
      // The narrative read of the same evidence follows once the visual query has landed –
      // it explains the map, it doesn't replace it.
      api
        .queryEuNetwork({
          task: 'Find patients like mine across the European network, show the treatment approaches taken and what happened, and flag weak evidence.',
          patient_id: PATIENT_ID,
        })
        .then(setResult)
        .catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The network query could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const flagged = record?.labs.filter((l) => l.flag).length ?? 0;
  const phase: NetworkPhase = !started ? 'idle' : snapshot ? 'responded' : 'querying';

  const navItems: { id: Section; label: string; badge?: number }[] = [
    { id: 'worklist', label: 'Worklist' },
    { id: 'chart', label: 'Patient chart', badge: flagged || undefined },
    { id: 'network', label: 'Patients like mine' },
    { id: 'decide', label: 'Decide & feed back', badge: logCount || undefined },
  ];

  return (
    <div className="eu37 hx">
      <a className="eu37-skip" href="#eu37-main">
        Skip to main content
      </a>
      <header className="eu37-chrome">
        <div className="eu37-chrome-id">
          <span className="eu37-mark" aria-hidden>
            EU
          </span>
          <div>
            <strong>
              EU ONCOLOGY NETWORK <span className="eu37-chrome-module">/ MOLECULAR TUMOUR BOARD</span>
            </strong>
            <span className="eu37-chrome-org">Klinikum Rewired München · Medical Oncology</span>
          </div>
        </div>
        <div className="eu37-chrome-meta">
          <span>München · Workstation 4</span>
          <span>{clock.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="eu37-status-dot">● 9 sites connected</span>
        </div>
      </header>

      {record && (
        <div className="eu37-banner">
          <div className="eu37-banner-id">
            <span className="eu37-eyebrow">Case under review</span>
            <strong>{record.name}</strong>
          </div>
          <span>
            {record.age} y · {record.sex}
          </span>
          <span>{record.diagnosis.primary}</span>
          <span className="eu37-banner-flag">New indeterminate nodule after partial response</span>
          <span className="eu37-spacer" />
          <button type="button" className="hx-btn" onClick={() => setSection('chart')}>
            Open full chart
          </button>
        </div>
      )}

      <div className="eu37-guide">
        <StoryGuide steps={story} current={section} onGo={(id) => setSection(id as Section)} />
      </div>

      <div className="eu37-body hx-body">
        <nav className="eu37-nav hx-nav" aria-label="European learning network workspace">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === section ? 'active' : undefined}
              onClick={() => setSection(item.id)}
            >
              <span>
                <span className="eu37-nav-label">{item.label}</span>
                <span className="eu37-nav-detail">{SECTION_DETAIL[item.id]}</span>
              </span>
              {item.badge !== undefined && <span className="hx-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <main className="eu37-canvas hx-main" id="eu37-main">
          {section !== 'worklist' && (
            <div className="eu37-toolbar hx-toolbar">
              <span className="eu37-spacer" />
              <button type="button" className="hx-btn primary" onClick={() => setSection('network')}>
                Find patients like mine
              </button>
              {snapshot && (
                <button type="button" className="hx-btn" onClick={() => setDrawerOpen(true)}>
                  Inspect evidence &amp; provenance
                </button>
              )}
            </div>
          )}
          <div className="hx-content">
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
                phase={phase}
                started={started}
                loading={loading}
                error={error}
                snapshot={snapshot}
                result={result}
                onAsk={askNetwork}
              />
            )}
            {section === 'decide' && (
              <DecidePanel
                snapshot={snapshot}
                logCount={logCount}
                justFedBack={justFedBack}
                onRecorded={() => {
                  refreshLog();
                  setJustFedBack(true);
                  setTimeout(() => setJustFedBack(false), 1600);
                }}
              />
            )}
          </div>
        </main>
      </div>

      <footer className="eu37-status">
        <span>Hackathon prototype · synthetic data only · not for clinical use</span>
        <span className="eu37-spacer" />
        <span>EU-NET federated query simulator · v1.0</span>
      </footer>

      {snapshot && (
        <ProvenanceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} snapshot={snapshot} />
      )}
    </div>
  );
}

function AttentionStrip({ tone, badge, children }: { tone: 'warn' | 'crit'; badge: string; children: ReactNode }) {
  return (
    <div className={`eu37-attention eu37-attention-${tone}`} role="note">
      <Pill tone={tone}>{badge}</Pill>
      <span>{children}</span>
    </div>
  );
}

function Chart({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState('summary');
  return (
    <>
      <AttentionStrip tone="warn" badge="Human review required">
        This case does not fit any open trial. The molecular tumour board needs comparable real-world evidence
        before deciding on the next step.
      </AttentionStrip>
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
  phase,
  started,
  loading,
  error,
  snapshot,
  result,
  onAsk,
}: {
  phase: NetworkPhase;
  started: boolean;
  loading: boolean;
  error: string | null;
  snapshot: NetworkSnapshot | null;
  result: AgentResult | null;
  onAsk: () => void;
}) {
  const flaggedCountry = snapshot ? dominantCountry(snapshot.cases) : null;
  return (
    <>
      <Panel
        title="Live query — simulated European hospital network"
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
        {!started && (
          <span className="hx-empty">Click "Find patients like mine" to send a privacy-preserving query to the network below.</span>
        )}
        {started && (
          <>
            <NetworkMap
              hospitals={
                snapshot?.hospitals ?? [
                  { id: 'DE-01', name: 'This hospital', country: 'DE', matched: 0 },
                ]
              }
              phase={phase}
              flaggedCountry={flaggedCountry}
            />
            <p className="eu-privacy-note">
              🔒 Each node searches its own records locally. Only aggregated counts and outcome summaries travel back
              here — never a raw patient record.
            </p>
          </>
        )}
      </Panel>
      {snapshot && (
        <Panel title={`Comparable cohort — ${snapshot.matched_total} matched patient(s) across ${snapshot.network_hospitals_queried} hospitals`}>
          <p className="prose">{snapshot.comparability_criteria}</p>
          <CountryMixBar cases={snapshot.cases} />
          {snapshot.evidence_flags.length > 0 && (
            <AttentionStrip tone="warn" badge="Evidence caution">
              <ul className="eu-flags">
                {snapshot.evidence_flags.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </AttentionStrip>
          )}
          <CohortLandscape approaches={snapshot.approaches} cases={snapshot.cases} />
          <p className="eu-privacy-note">{snapshot.privacy_note}</p>
        </Panel>
      )}
      {started && (
        <Panel title="Assistant's read of the same evidence">
          <Backstage
            title="Behind the scenes – the simulated European network"
            stages={networkStages}
            running={started}
            holdLast
            release={!loading}
            note="No raw patient record leaves a hospital – each site only ever returns counts and summaries."
          />
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
      )}
    </>
  );
}

function DecidePanel({
  onRecorded,
  logCount,
  snapshot,
  justFedBack,
}: {
  onRecorded: () => void;
  logCount: number;
  snapshot: NetworkSnapshot | null;
  justFedBack: boolean;
}) {
  const [approach, setApproach] = useState<(typeof APPROACHES)[number]['id']>('biopsy_or_liquid_first');
  const [treatment, setTreatment] = useState('Liquid biopsy for resistance mutations; continue osimertinib pending results.');
  const [outcome, setOutcome] = useState('Outcome not yet known – following up at 8 weeks.');
  const [recorded, setRecorded] = useState(false);
  const [busy, setBusy] = useState(false);

  const record = async () => {
    setBusy(true);
    try {
      await api.recordNetworkFeedback({
        patient_id: PATIENT_ID,
        approach_category: approach,
        chosen_treatment: treatment,
        outcome_note: outcome,
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
          <button type="button" className="hx-btn primary" disabled={busy || recorded} onClick={record}>
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
        {snapshot && <NetworkMap hospitals={snapshot.hospitals} phase="responded" pulseHome={justFedBack} />}
        <p className="prose">
          <strong>{logCount}</strong> outcome{logCount === 1 ? '' : 's'} recorded to the simulated network learning
          system so far in this session.
          {justFedBack && <span className="eu-fedback-note"> ↩ just fed back into the network above</span>}
        </p>
      </Panel>
    </div>
  );
}

/** Right-side inspection drawer: full site-by-site provenance behind the aggregated cohort view. */
function ProvenanceDrawer({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: NetworkSnapshot;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="eu37-drawer-overlay" onClick={onClose}>
      <aside
        className="eu37-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eu37-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <span className="eu37-eyebrow">Inspectable by design</span>
          <button type="button" className="eu37-drawer-close" onClick={onClose} aria-label="Close provenance panel">
            ✕
          </button>
        </header>
        <h3 id="eu37-drawer-title">Site-by-site provenance</h3>
        <p className="prose">{snapshot.comparability_criteria}</p>
        <DataTable
          rowKey={(h) => h.id}
          rows={snapshot.hospitals}
          columns={[
            { key: 'name', label: 'Hospital' },
            { key: 'country', label: 'Country' },
            {
              key: 'matched',
              label: 'Matched patients',
              render: (h) => (h.matched > 0 ? <strong>{h.matched}</strong> : <span className="hx-empty">0</span>),
            },
          ]}
        />
        <p className="eu-privacy-note">{snapshot.privacy_note}</p>
      </aside>
    </div>
  );
}
