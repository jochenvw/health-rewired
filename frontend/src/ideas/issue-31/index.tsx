import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type PatientRecord, type PatientSummary, type Trial } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { AttentionStrip, DataTable, Drawer, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '31',
  issue: 31,
  title: 'Early warning for lung cancer outcomes',
  tagline: 'For the oncologist reviewing a case between visits: spot a rising risk before the next scan.',
};

const DEFAULT_PATIENT = 'P-002';
const TASK = 'Assess outcome risk across labs, imaging, pathology and genomics, and ground it in a matching trial.';

// Extra fake clinic context so the worklist feels like a real day; only P-00x rows open a chart.
const clinicSlots = [
  { time: '08:00', id: 'X-118', name: 'Renate Vogel', dx: 'Follicular lymphoma', type: 'Surveillance', room: 'Room 1', status: 'Waiting' },
  { time: '08:45', id: 'P-001', type: 'Chemo day unit – paclitaxel wk 5', room: 'Chair 4', status: 'Arrived' },
  { time: '09:30', id: 'P-002', type: 'Considering next-line immunotherapy', room: 'MDT', status: 'New nodule' },
  { time: '10:15', id: 'X-249', name: 'Josef Brandt', dx: 'Prostate ca. Gleason 7', type: 'Follow-up', room: 'Room 2', status: 'Scheduled' },
  { time: '11:00', id: 'P-003', type: 'Surveillance review', room: 'Room 3', status: 'Rising CEA' },
  { time: '13:30', id: 'X-356', name: 'Petra Lindner', dx: 'Melanoma stage II', type: 'New referral', room: 'Room 1', status: 'Scheduled' },
];

// Synthetic genomics/pathology detail beyond the base patient record, so the chart shows every
// modality the federated model reasons across. Illustrative only.
const genomicsPanel = [
  { gene: 'EGFR', result: 'Exon 19 deletion — detected' },
  { gene: 'ALK', result: 'Negative (FISH)' },
  { gene: 'ROS1', result: 'Negative (FISH)' },
  { gene: 'KRAS', result: 'Wild-type' },
  { gene: 'TP53', result: 'Mutated (co-occurring)' },
  { gene: 'MET amplification', result: 'Not detected' },
];

const pathologyPanel = [
  { item: 'Histology', value: 'Adenocarcinoma, moderately differentiated' },
  { item: 'PD-L1 (22C3)', value: 'TPS 10%' },
  { item: 'Ki-67', value: '28%' },
  { item: 'Specimen', value: 'Bronchoscopy biopsy, right upper lobe (2025-09-12)' },
];

// Federation the vision describes: European centres sharing model updates, never raw data.
const federationSites = [
  { site: 'Klinikum Rewired München', n: 4, note: 'Same EGFR exon19del + new-nodule pattern' },
  { site: 'Charité Berlin', n: 3, note: '2 of 3 progressed within 90 days' },
  { site: 'Hôpital Cochin Paris', n: 2, note: '1 responded to a liquid-biopsy-guided switch' },
  { site: 'Ospedale San Raffaele Milano', n: 3, note: "Includes Alberto Ferrarin's AI-ON-Lab cohort" },
];

const federatedStages: Stage[] = [
  { label: 'Labs', detail: 'ALT trend 38 → 71 U/L retrieved', ms: 600 },
  { label: 'CT imaging', detail: 'Lesion features extracted: new 6 mm LLL nodule, indeterminate', ms: 700 },
  { label: 'Pathology', detail: 'PD-L1 TPS 10%, histology confirmed', ms: 600 },
  { label: 'Genomics', detail: 'EGFR exon 19 deletion, ALK negative, TP53 co-mutated', ms: 700 },
  {
    label: 'Federated outcome model',
    detail: 'Trained across 9 European centres on 14,200 patients; data never left the hospitals; last round 3 days ago',
    ms: 1000,
  },
];

const learningLoopStages: Stage[] = [
  { label: 'Case outcome recorded', detail: 'Simulated — added to this site\u2019s local training set', ms: 700 },
  { label: 'Encrypted update prepared', detail: 'Simulated — at Klinikum Rewired München, no raw data leaves the site', ms: 700 },
  { label: 'Aggregated with 8 other sites', detail: 'Simulated — federated averaging across the network', ms: 800 },
  { label: 'Next federated round scheduled', detail: 'Simulated — round #48 begins tonight', ms: 700 },
];

type Section = 'worklist' | 'chart' | 'risk' | 'payoff';
type Decision = 'agree' | 'disagree' | 'mdt' | undefined;

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'Morning worklist',
    explain: "Today's thoracic oncology clinic. Markus Huber has a new indeterminate nodule — click his row to open the chart.",
  },
  {
    id: 'chart',
    title: 'Multimodal chart',
    explain: 'Labs, CT imaging, pathology and genomics — the modalities the federated model reasons across. Then ask for the outcome risk.',
  },
  {
    id: 'assess',
    title: 'Ask for outcome risk',
    explain: 'Watch each modality get gathered, then sent to the federated model — trained across hospitals that never shared raw data.',
  },
  {
    id: 'decide',
    title: 'AI result & decision',
    explain: 'A risk estimate with uncertainty, per-modality contribution, similar patients and a matching trial. You decide.',
  },
  {
    id: 'payoff',
    title: 'Learning loop',
    explain: "The case joins the MDT list with the risk summary, and your decision feeds the network's next federated round.",
  },
];

export default function OutcomeRisk() {
  const [section, setSection] = useState<Section>('worklist');
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [patientId, setPatientId] = useState(DEFAULT_PATIENT);
  const [record, setRecord] = useState<PatientRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision>(undefined);
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    api.patients().then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    setRecord(null);
    api.patient(patientId).then(setRecord).catch(() => setRecord(null));
  }, [patientId]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const worklist = clinicSlots.map((s) => ({
    ...s,
    name: s.name ?? byId.get(s.id)?.name ?? s.id,
    dx: s.dx ?? byId.get(s.id)?.diagnosis ?? '',
  }));

  const openPatient = (id: string, target: Section = 'chart') => {
    if (!id.startsWith('P-')) {
      setNotice('This chart is not part of the synthetic demo data. Open one of the highlighted patients.');
      return;
    }
    setNotice(null);
    setPatientId(id);
    setHasResult(false);
    setDecision(undefined);
    setSection(target);
  };

  const flagged = record?.labs.filter((l) => l.flag).length ?? 0;
  const storyStep = section === 'risk' ? (hasResult ? 'decide' : 'assess') : section;

  const goTo = (id: string) => {
    if (id === 'decide' && !hasResult) {
      setNotice('Click "Ask for outcome risk" first, or wait for it to finish.');
      setSection('risk');
      return;
    }
    if (id === 'payoff' && !decision) {
      setNotice('Agree, disagree or flag for MDT first — that decision is what feeds the learning loop.');
      setSection('payoff');
      return;
    }
    setNotice(null);
    setSection((id === 'assess' || id === 'decide' ? 'risk' : id) as Section);
  };

  return (
    <HospitalShell
      module="Oncology clinic · Thoracic"
      guide={
        <StoryGuide
          steps={story}
          current={storyStep}
          onGo={goTo}
          nextLabel={section === 'worklist' ? 'Open Markus Huber' : section === 'chart' ? 'Ask for outcome risk' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: 'Clinic worklist', badge: worklist.length },
        { id: 'chart', label: 'Patient chart', badge: flagged || undefined },
        { id: 'risk', label: 'Outcome risk' },
        { id: 'payoff', label: 'MDT list & learning loop' },
      ]}
      active={section}
      onNav={(id) => setSection(id as Section)}
      patient={
        section === 'worklist' || section === 'payoff' || !record
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
          <label>
            Patient{' '}
            <select value={patientId} onChange={(e) => openPatient(e.target.value, section === 'worklist' ? 'chart' : 'chart')}>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn primary" onClick={() => setSection('risk')}>
            Ask for outcome risk
          </button>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}
      {section === 'worklist' && (
        <Panel eyebrow="Today's list" title={`Clinic worklist · Medical Oncology · ${new Date().toLocaleDateString('de-DE')}`}>
          <DataTable
            rowKey={(r) => r.id}
            rows={worklist}
            selected={patientId}
            onSelect={(r) => openPatient(r.id, r.id.startsWith('P-') ? 'chart' : 'chart')}
            columns={[
              { key: 'time', label: 'Time', width: '60px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'type', label: 'Visit' },
              { key: 'room', label: 'Location' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => (
                  <Pill tone={r.status === 'Arrived' ? 'ok' : r.status === 'Waiting' || r.status === 'Scheduled' ? 'neutral' : 'warn'}>
                    {r.status}
                  </Pill>
                ),
              },
            ]}
          />
        </Panel>
      )}
      {section === 'chart' &&
        (record ? (
          <Chart record={record} />
        ) : (
          <Panel title="Patient chart">
            <Working label="Loading the record" />
          </Panel>
        ))}
      {section === 'risk' &&
        (record ? (
          <OutcomeRiskPanel record={record} decision={decision} onDecision={setDecision} onResult={setHasResult} />
        ) : (
          <Panel title="Outcome risk">
            <Working label="Loading the record" />
          </Panel>
        ))}
      {section === 'payoff' && <Payoff record={record} decision={decision} worklist={worklist} />}
    </HospitalShell>
  );
}

function Chart({ record }: { record: PatientRecord }) {
  const [tab, setTab] = useState('summary');
  const [ack, setAck] = useState<Set<string>>(new Set());
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'summary', label: 'Summary' },
          { id: 'results', label: `Labs (${record.labs.length})` },
          { id: 'imaging', label: `Imaging (${record.imaging?.length ?? 0})` },
          { id: 'pathology', label: 'Pathology' },
          { id: 'genomics', label: 'Genomics' },
        ]}
      />
      {tab === 'summary' && (
        <div className="hx-grid">
          <Panel eyebrow="Chart summary" title="Diagnosis">
            <dl className="hx-facts">
              <dt>Primary</dt>
              <dd>{record.diagnosis.primary}</dd>
              <dt>Diagnosed</dt>
              <dd>{record.diagnosis.date}</dd>
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
          <Panel title="Open issues">
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
            rowTone={(l) => (l.flag ? (ack.has(`${l.date}-${l.test}`) ? undefined : 'crit') : undefined)}
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
              {
                key: 'ack',
                label: '',
                render: (l) => {
                  const key = `${l.date}-${l.test}`;
                  if (!l.flag) return '';
                  return ack.has(key) ? (
                    <Pill tone="ok">Acknowledged</Pill>
                  ) : (
                    <button type="button" className="hx-btn" onClick={() => setAck(new Set(ack).add(key))}>
                      Acknowledge
                    </button>
                  );
                },
              },
            ]}
          />
        </Panel>
      )}
      {tab === 'imaging' && (
        <Panel title="Imaging">
          <DataTable
            rowKey={(i) => `${i.date}-${i.modality}`}
            rows={[...(record.imaging ?? [])].sort((a, b) => b.date.localeCompare(a.date))}
            empty="No imaging recorded."
            columns={[
              { key: 'date', label: 'Date', width: '110px' },
              { key: 'modality', label: 'Modality' },
              { key: 'result', label: 'Finding', render: (i) => i.result },
            ]}
          />
          <p className="hx-empty" style={{ marginTop: 10 }}>
            5 reconstructed series available (axial, coronal, sagittal, MIP, bone) — thumbnails omitted in this prototype.
          </p>
        </Panel>
      )}
      {tab === 'pathology' && (
        <Panel title="Pathology">
          <DataTable
            rowKey={(p) => p.item}
            rows={pathologyPanel}
            columns={[
              { key: 'item', label: 'Item' },
              { key: 'value', label: 'Result' },
            ]}
          />
        </Panel>
      )}
      {tab === 'genomics' && (
        <Panel title="Genomic panel (NGS)">
          <DataTable
            rowKey={(g) => g.gene}
            rows={genomicsPanel}
            columns={[
              { key: 'gene', label: 'Gene / marker' },
              { key: 'result', label: 'Result' },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

function OutcomeRiskPanel({
  record,
  decision,
  onDecision,
  onResult,
}: {
  record: PatientRecord;
  decision: Decision;
  onDecision: (d: Decision) => void;
  onResult: (has: boolean) => void;
}) {
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [disagreeReason, setDisagreeReason] = useState('');
  const [openTrial, setOpenTrial] = useState<Trial | null>(null);

  useEffect(() => {
    api.sampleData<Trial[]>('trials.csv').then(setTrials).catch(() => setTrials([]));
  }, []);

  const assess = useMemo(
    () => async () => {
      setRuns((n) => n + 1);
      setResult(null);
      onResult(false);
      onDecision(undefined);
      setDisagreeReason('');
      setLoading(true);
      setStarted(true);
      setError(null);
      try {
        const r = await api.runIdea('31', { task: TASK, patient_id: record.id, role: 'Oncologist' });
        setResult(r);
        onResult(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
      } finally {
        setLoading(false);
      }
    },
    [record.id],
  );

  useEffect(() => {
    assess();
  }, [assess]);

  const outcomeBlocks = result?.blocks.filter((b) => b.type === 'outcome_risk') ?? [];
  const otherBlocks = result?.blocks.filter((b) => b.type !== 'outcome_risk') ?? [];
  const severity = outcomeBlocks[0]?.severity;
  const matchedTrialId = outcomeBlocks[0]?.items
    .map((i) => `${i.label} ${i.detail ?? ''}`.match(/[A-Z]{2,4}-[A-Z]{2,4}-\d+/)?.[0])
    .find((id): id is string => Boolean(id));

  const cancerKind = record.diagnosis.primary.toLowerCase();
  const relevantTrials = trials.filter((t) => cancerKind.includes(t.cancer_type));
  const totalSimilar = federationSites.reduce((sum, s) => sum + s.n, 0);
  const riskPoint = severity === 'critical' ? 68 : severity === 'warning' ? 35 : 12;
  const riskBand = severity === 'critical' ? 10 : 15;

  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 3fr) minmax(280px, 2fr)' }}>
      <Panel
        eyebrow="Federated multimodal model · human review required"
        title={result ? result.headline : `Outcome risk for ${record.name}`}
        actions={
          <>
            {result && <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>}
            <button type="button" className="hx-btn" disabled={loading} onClick={() => assess()}>
              {loading ? (
                <>
                  <span className="hx-spinner" aria-hidden /> Assessing…
                </>
              ) : (
                'Re-assess'
              )}
            </button>
          </>
        }
      >
        {error && <p className="error">{error}</p>}
        {outcomeBlocks.length > 0 && !decision && (
          <AttentionStrip tone={severity === 'critical' ? 'crit' : 'warn'} label={severity === 'critical' ? 'Critical' : 'Emerging concern'}>
            <strong>Not yet reviewed.</strong> This case needs an Agree, Disagree or Flag-for-MDT decision before it leaves this screen — the
            model never decides on treatment or referral by itself.
          </AttentionStrip>
        )}
        {decision && (
          <AttentionStrip tone="ok" label="Reviewed">
            Clinician decision recorded: <strong>{decision === 'agree' ? 'Agree' : decision === 'disagree' ? 'Disagree' : 'Flag for MDT'}</strong>.
          </AttentionStrip>
        )}
        <Backstage
          key={runs}
          title="Behind the scenes — the federated outcome model"
          stages={federatedStages}
          running={started}
          holdLast
          release={!loading}
          note="Every modality and the network stats above are shown for explanation; timings and the 14,200-patient / 9-centre figures are simulated for this prototype."
        />
        {result && outcomeBlocks.length === 0 && (
          <span className="hx-empty">No emerging outcome concern found for {record.name} right now.</span>
        )}
        {outcomeBlocks.length > 0 && (
          <>
            <p className="hx-risk-estimate">
              Risk estimate: <strong>{riskPoint}%</strong> probability of progression within 6 months (± {riskBand} pts, simulated
              uncertainty)
            </p>
            <div className="hx-contrib">
              <span className="hx-contrib-label">Simulated per-modality contribution:</span>
              {[
                { modality: 'CT imaging', pct: 42 },
                { modality: 'Genomics', pct: 28 },
                { modality: 'Labs', pct: 18 },
                { modality: 'Pathology', pct: 12 },
              ].map((c) => (
                <span key={c.modality} className="hx-contrib-bar">
                  <span style={{ width: '110px' }}>{c.modality}</span>
                  <span className="hx-contrib-track">
                    <span className="hx-contrib-fill" style={{ width: `${c.pct}%` }} />
                  </span>
                  <span>{c.pct}%</span>
                </span>
              ))}
            </div>
          </>
        )}
        {outcomeBlocks.map((block, index) => (
          <RenderBlock key={index} block={block} />
        ))}
        {otherBlocks.length > 0 && <div className="blocks">{otherBlocks.map((block, index) => <RenderBlock key={index} block={block} />)}</div>}
        {outcomeBlocks.length > 0 && (
          <>
            <div className="decision-buttons" role="group" aria-label="Clinician decision" style={{ marginTop: 12 }}>
              <button type="button" className="hx-btn primary" aria-pressed={decision === 'agree'} onClick={() => onDecision('agree')}>
                Agree
              </button>
              <button type="button" className="hx-btn" aria-pressed={decision === 'disagree'} onClick={() => onDecision('disagree')}>
                Disagree
              </button>
              <button type="button" className="hx-btn" aria-pressed={decision === 'mdt'} onClick={() => onDecision('mdt')}>
                Flag for MDT
              </button>
            </div>
            {decision === 'agree' && <p className="hint">Agreed — the risk note is filed to the case record.</p>}
            {decision === 'mdt' && <p className="hint">Flagged — added to the next tumour board agenda.</p>}
            {decision === 'disagree' && (
              <div style={{ marginTop: 8 }}>
                <label>
                  Reason for disagreeing (short)
                  <textarea
                    className="risk-note-edit"
                    rows={2}
                    value={disagreeReason}
                    onChange={(e) => setDisagreeReason(e.target.value)}
                    placeholder="e.g. Nodule pattern is more consistent with infection given recent COPD exacerbation"
                  />
                </label>
                <p className="hint">The disagreement and your reason are recorded with the case — the model does not decide.</p>
              </div>
            )}
          </>
        )}
      </Panel>
      <div>
        <Panel eyebrow="Simulated network stats" title="Similar patients across the federation">
          <DataTable
            rowKey={(s) => s.site}
            rows={federationSites}
            columns={[
              { key: 'site', label: 'Site' },
              { key: 'n', label: 'Patients', width: '80px' },
              { key: 'note', label: 'Note' },
            ]}
          />
          <p className="hx-empty" style={{ marginTop: 8 }}>
            {totalSimilar} similar patients found across the network (simulated) — counts only; no raw data was shared.
          </p>
        </Panel>
        <Panel eyebrow="Evidence grounding" title="Matching trials">
          <DataTable
            rowKey={(t) => t.trial_id}
            rows={relevantTrials}
            selected={matchedTrialId}
            onSelect={(t) => setOpenTrial(t)}
            empty="No synthetic trials for this cancer type."
            columns={[
              { key: 'trial_id', label: 'Trial', render: (t) => <strong>{t.trial_id}</strong> },
              { key: 'title', label: 'Title' },
              { key: 'phase', label: 'Phase', width: '60px' },
              { key: 'key_inclusion', label: 'Key inclusion' },
            ]}
          />
          <p className="hx-empty" style={{ marginTop: 8 }}>
            Click a trial to inspect its full record — the same evidence the model matched on.
          </p>
        </Panel>
      </div>
      <Drawer title={openTrial?.trial_id ?? 'Trial'} eyebrow="Full trial record" open={openTrial !== null} onClose={() => setOpenTrial(null)}>
        {openTrial && (
          <dl className="hx-facts">
            <dt>Title</dt>
            <dd>{openTrial.title}</dd>
            <dt>Phase</dt>
            <dd>{openTrial.phase}</dd>
            <dt>Cancer type</dt>
            <dd>{openTrial.cancer_type}</dd>
            <dt>Key inclusion</dt>
            <dd>{openTrial.key_inclusion}</dd>
            <dt>Key exclusion</dt>
            <dd>{openTrial.key_exclusion}</dd>
            <dt>Site</dt>
            <dd>{openTrial.site}</dd>
            <dt>Status</dt>
            <dd>{openTrial.status}</dd>
          </dl>
        )}
      </Drawer>
    </div>
  );
}

function Payoff({
  record,
  decision,
  worklist,
}: {
  record: PatientRecord | null;
  decision: Decision;
  worklist: { id: string; name: string; dx: string; type: string; room: string; status: string; time: string }[];
}) {
  const [running] = useState(true);
  const mdtRows = record
    ? [
        ...worklist.filter((r) => r.room === 'MDT' && r.id !== record.id),
        {
          time: 'MDT',
          id: record.id,
          name: record.name,
          dx: record.diagnosis.primary,
          type: 'Outcome risk review',
          room: 'MDT',
          status:
            decision === 'mdt'
              ? 'Flagged for MDT'
              : decision === 'disagree'
                ? 'Clinician disagreed'
                : decision === 'agree'
                  ? 'Agreed — filed'
                  : 'Pending decision',
        },
      ]
    : worklist.filter((r) => r.room === 'MDT');


  return (
    <div className="hx-grid">
      <Panel title="Tumour board (MDT) list — updated">
        <DataTable
          rowKey={(r) => r.id}
          rows={mdtRows}
          columns={[
            { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
            { key: 'dx', label: 'Diagnosis' },
            { key: 'type', label: 'Reason' },
            {
              key: 'status',
              label: 'Outcome risk',
              render: (r) => <Pill tone={r.status.includes('Flagged') ? 'crit' : r.status.includes('disagreed') ? 'warn' : 'ok'}>{r.status}</Pill>,
            },
          ]}
        />
      </Panel>
      <Panel title="The learning loop">
        <Backstage
          title="Behind the scenes — the next federated round"
          stages={learningLoopStages}
          running={running}
          note="Simulated: in a real deployment, only model updates (never patient data) would leave each hospital, aggregated centrally or peer-to-peer."
        />
        <p style={{ margin: '10px 0 0' }}>
          Alberto Ferrarin's vision: every reviewed case like this one — agreed, disagreed or sent to MDT — becomes a training signal at
          its home hospital, so the federated model keeps improving without any hospital exporting patient data.
        </p>
      </Panel>
    </div>
  );
}
