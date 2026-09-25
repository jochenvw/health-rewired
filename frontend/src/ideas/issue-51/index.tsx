import { useEffect, useMemo, useState } from 'react';
import type { AgentResult, UIBlock } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-51.css';

export const meta: IdeaMeta = {
  id: '51',
  issue: 51,
  title: 'Silent-run an AI model before trusting it',
  tagline: 'Check a published immunotherapy-response model on local synthetic cohorts before any prediction reaches care.',
};

type Hospital = {
  id: string;
  name: string;
  cohort_size: number;
  case_mix: string;
  input_coverage: number;
  silent_run_period: string;
  auc: number;
  calibration_slope: number;
  calibration_intercept: number;
  brier: number;
  fairness_flag: string;
  drift_flag: string;
  likely_cause: string;
  recommendation: string;
};

type MappingRow = { input: string; local_field: string; status: string; evidence: string };
type SubgroupRow = { group: string; n: number; auc: number; calibration_slope: number; signal: string };
type DriftEvent = { month: string; hospital: string; event: string; level: 'stable' | 'change' | 'warning' | 'critical' };
type Snapshot = {
  synthetic: boolean;
  scenario: string;
  model: {
    name: string;
    published_population: string;
    published_auc: number;
    published_calibration_slope: number;
    published_brier: number;
    required_inputs: string[];
  };
  publication_comparator: { metric: string; publication: string; local_target: string }[];
  hospitals: Hospital[];
  variable_mapping: MappingRow[];
  subgroups: SubgroupRow[];
  drift_timeline: DriftEvent[];
  recalibration: {
    method: string;
    before: { auc: number; calibration_slope: number; brier: number };
    after: { auc: number; calibration_slope: number; brier: number };
    committee_note: string;
  };
  passport: { status: string; decision_options: string[]; recommended_decision: string; evidence_sources: string[] };
};

type Section = 'mapping' | 'run' | 'compare' | 'recalibrate' | 'passport';

const steps: StoryStep[] = [
  {
    id: 'mapping',
    title: 'Map variables',
    explain: 'The AI proposes how local EHR fields match the published model inputs, with uncertainty made visible.',
  },
  {
    id: 'run',
    title: 'Run silently',
    explain: 'The model is run on historical synthetic cohorts. Predictions stay outside the chart and do not influence care.',
  },
  {
    id: 'compare',
    title: 'Compare hospitals',
    explain: 'Discrimination, calibration, subgroup fairness and drift are compared with the publication.',
  },
  {
    id: 'recalibrate',
    title: 'Try recalibration',
    explain: 'Hospital C performs reasonably but is poorly calibrated. Test the local recalibration before deciding.',
  },
  {
    id: 'passport',
    title: 'Draft passport',
    explain: 'The AI drafts a committee-ready model passport; humans choose the decision and sign off.',
  },
];

const silentRunStages: Stage[] = [
  { label: 'Locking silent-run mode', detail: 'Predictions hidden from clinicians and patients', ms: 650 },
  { label: 'Checking three hospital cohorts', detail: '1,036 synthetic NSCLC immunotherapy starts', ms: 850 },
  { label: 'Mapping variables and missingness', detail: 'ECOG extraction, PD-L1 TPS harmonisation, albumin feed timing', ms: 900 },
  { label: 'Computing local performance', detail: 'AUC, calibration, Brier score and subgroup gaps', ms: 900 },
  { label: 'Looking for drift', detail: 'Hospital C PD-L1 assay change detected in July 2025' },
];

const passportStages: Stage[] = [
  { label: 'Reading validation evidence', detail: 'Synthetic cohorts, mapping log, drift timeline', ms: 700 },
  { label: 'Explaining why Hospital C differs', detail: 'PD-L1 assay change plus older local cohort', ms: 900 },
  { label: 'Drafting model passport', detail: 'Recommendation, traceable evidence and sign-off options' },
];

async function issue51Request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ideas/51${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

export default function Issue51ModelCheck() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [section, setSection] = useState<Section>('mapping');
  const [selectedHospitalId, setSelectedHospitalId] = useState('C');
  const [silentRunStarted, setSilentRunStarted] = useState(false);
  const [silentRunDone, setSilentRunDone] = useState(false);
  const [passportRun, setPassportRun] = useState(0);
  const [passport, setPassport] = useState<AgentResult | null>(null);
  const [passportLoading, setPassportLoading] = useState(false);
  const [signedDecision, setSignedDecision] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    issue51Request<Snapshot>('/snapshot')
      .then(setSnapshot)
      .catch(() => setNotice('Could not load the synthetic model-check data.'));
  }, []);

  const selectedHospital = useMemo(
    () => snapshot?.hospitals.find((hospital) => hospital.id === selectedHospitalId) ?? snapshot?.hospitals[0],
    [snapshot, selectedHospitalId],
  );

  const go = (id: string) => {
    setSection(id as Section);
    if (id === 'run') {
      setSilentRunStarted(true);
      setSilentRunDone(false);
    }
    if (id === 'passport' && !passport && !passportLoading) {
      void draftPassport();
    }
  };

  const draftPassport = async () => {
    setSection('passport');
    setPassport(null);
    setPassportRun((run) => run + 1);
    setPassportLoading(true);
    setSignedDecision(null);
    try {
      setPassport(
        await issue51Request<AgentResult>('/passport', {
          method: 'POST',
          body: JSON.stringify({
            hospital_id: selectedHospitalId,
            committee_focus: 'Should we introduce, recalibrate, continue silent running or pause this model?',
          }),
        }),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not draft the passport.');
    } finally {
      setPassportLoading(false);
    }
  };

  if (!snapshot || !selectedHospital) {
    return (
      <HospitalShell module="Model check workspace" nav={[]} active="loading" onNav={() => undefined} patient={null}>
        <Panel title="Loading model-check workspace">
          <Working label="Loading synthetic cohorts" />
        </Panel>
      </HospitalShell>
    );
  }

  return (
    <HospitalShell
      module="AI model check workspace"
      guide={<StoryGuide steps={steps} current={section} onGo={go} nextLabel={section === 'mapping' ? 'Start silent run' : undefined} />}
      nav={[
        { id: 'mapping', label: 'Variable map', badge: snapshot.variable_mapping.length },
        { id: 'run', label: 'Silent run', badge: snapshot.hospitals.reduce((sum, hospital) => sum + hospital.cohort_size, 0) },
        { id: 'compare', label: 'Performance & fairness', badge: '3 sites' },
        { id: 'recalibrate', label: 'Recalibration' },
        { id: 'passport', label: 'Model passport' },
      ]}
      active={section}
      onNav={go}
      patient={null}
      toolbar={
        <>
          <label>
            Focus hospital{' '}
            <select value={selectedHospitalId} onChange={(event) => setSelectedHospitalId(event.target.value)}>
              {snapshot.hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  Hospital {hospital.id} · {hospital.name}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <Pill tone={snapshot.synthetic ? 'ok' : 'crit'}>Synthetic data only</Pill>
          <Pill tone="info">Silent run: predictions hidden</Pill>
          <button type="button" className="hx-btn primary" onClick={() => void draftPassport()} disabled={passportLoading}>
            {passportLoading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Drafting passport…
              </>
            ) : (
              'Draft model passport'
            )}
          </button>
        </>
      }
    >
      {notice && (
        <Panel title="Information">
          <p className="issue51-note">{notice}</p>
        </Panel>
      )}
      {section === 'mapping' && <Mapping snapshot={snapshot} />}
      {section === 'run' && (
        <SilentRun
          snapshot={snapshot}
          started={silentRunStarted}
          done={silentRunDone}
          onStart={() => {
            setSilentRunStarted(true);
            setSilentRunDone(false);
          }}
          onDone={() => setSilentRunDone(true)}
          onSelect={(id) => {
            setSelectedHospitalId(id);
            setSection('compare');
          }}
        />
      )}
      {section === 'compare' && <Compare snapshot={snapshot} selectedHospital={selectedHospital} onSelect={setSelectedHospitalId} />}
      {section === 'recalibrate' && <Recalibration snapshot={snapshot} />}
      {section === 'passport' && (
        <Passport
          snapshot={snapshot}
          result={passport}
          loading={passportLoading}
          run={passportRun}
          signedDecision={signedDecision}
          onSign={setSignedDecision}
        />
      )}
    </HospitalShell>
  );
}

function Mapping({ snapshot }: { snapshot: Snapshot }) {
  return (
    <>
      <div className="issue51-hero">
        <div>
          <h2>{snapshot.model.name}</h2>
          <p>{snapshot.scenario}</p>
        </div>
        <div className="issue51-score">
          <strong>{snapshot.model.published_auc}</strong>
          <span>Published AUC</span>
        </div>
        <div className="issue51-score">
          <strong>{snapshot.model.required_inputs.length}</strong>
          <span>Required inputs</span>
        </div>
      </div>
      <Panel title="AI-suggested variable mapping · requires human check">
        <DataTable
          rows={snapshot.variable_mapping}
          rowKey={(row) => row.input}
          rowTone={(row) => (row.status.includes('issue') || row.status.includes('uncertainty') || row.status.includes('drift') ? 'warn' : undefined)}
          columns={[
            { key: 'input', label: 'Model input', render: (row) => <strong>{row.input}</strong> },
            { key: 'local_field', label: 'Local field' },
            { key: 'status', label: 'Status', render: (row) => <MappingStatus status={row.status} /> },
            { key: 'evidence', label: 'Evidence' },
          ]}
        />
      </Panel>
    </>
  );
}

function MappingStatus({ status }: { status: string }) {
  const tone = status.includes('issue') || status.includes('uncertainty') || status.includes('drift') ? 'warn' : 'ok';
  return <Pill tone={tone}>{status}</Pill>;
}

function SilentRun({
  snapshot,
  started,
  done,
  onStart,
  onDone,
  onSelect,
}: {
  snapshot: Snapshot;
  started: boolean;
  done: boolean;
  onStart: () => void;
  onDone: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 2fr)' }}>
      <Panel
        title="Silent-run control"
        actions={
          <button type="button" className="hx-btn primary" onClick={onStart} disabled={started && !done}>
            {started && !done ? (
              <>
                <span className="hx-spinner" aria-hidden /> Running silently…
              </>
            ) : (
              'Run model silently'
            )}
          </button>
        }
      >
        <p className="issue51-note">
          Historical records receive model scores in a sandbox only. Nothing appears in the patient chart, and no clinician or patient sees a
          prediction during validation.
        </p>
        <Backstage
          title="Behind the scenes – local validation run"
          stages={silentRunStages}
          running={started}
          onFinished={onDone}
          note="Simulated timings; metrics come from synthetic data."
        />
        {!started && <span className="hx-empty">Click the button to watch the silent run.</span>}
      </Panel>
      <Panel title="Synthetic hospital cohorts">
        <DataTable
          rows={snapshot.hospitals}
          rowKey={(hospital) => hospital.id}
          onSelect={(hospital) => onSelect(hospital.id)}
          rowTone={(hospital) => (hospital.id === 'C' ? 'crit' : hospital.id === 'B' ? 'warn' : undefined)}
          columns={[
            { key: 'id', label: 'Site', render: (hospital) => <strong>Hospital {hospital.id}</strong> },
            { key: 'cohort_size', label: 'N' },
            { key: 'input_coverage', label: 'Coverage', render: (hospital) => `${Math.round(hospital.input_coverage * 100)}%` },
            { key: 'silent_run_period', label: 'Period' },
            { key: 'case_mix', label: 'Case mix' },
          ]}
        />
      </Panel>
    </div>
  );
}

function Compare({
  snapshot,
  selectedHospital,
  onSelect,
}: {
  snapshot: Snapshot;
  selectedHospital: Hospital;
  onSelect: (id: string) => void;
}) {
  const metrics = snapshot.hospitals.map((hospital) => ({
    ...hospital,
    calibrationGap: Math.abs(1 - hospital.calibration_slope),
  }));
  return (
    <>
      <div className="issue51-metric-grid">
        {metrics.map((hospital) => (
          <button key={hospital.id} type="button" className="issue51-card" onClick={() => onSelect(hospital.id)}>
            <span>Hospital {hospital.id}</span>
            <strong>{hospital.auc.toFixed(2)} AUC</strong>
            <span>Calibration slope {hospital.calibration_slope.toFixed(2)}</span>
            <Pill tone={hospital.id === 'C' ? 'crit' : hospital.id === 'B' ? 'warn' : 'ok'}>{hospital.drift_flag}</Pill>
          </button>
        ))}
      </div>
      <Tabs active={selectedHospital.id} onChange={onSelect} tabs={snapshot.hospitals.map((hospital) => ({ id: hospital.id, label: `Hospital ${hospital.id}` }))} />
      <div className="hx-grid">
        <Panel title={`${selectedHospital.name} · publication comparison`}>
          <dl className="hx-facts">
            <dt>AUC</dt>
            <dd>
              {selectedHospital.auc} vs published {snapshot.model.published_auc}
            </dd>
            <dt>Calibration slope</dt>
            <dd>
              <Pill tone={selectedHospital.calibration_slope < 0.8 ? 'crit' : selectedHospital.calibration_slope < 0.9 ? 'warn' : 'ok'}>
                {selectedHospital.calibration_slope}
              </Pill>
            </dd>
            <dt>Brier score</dt>
            <dd>{selectedHospital.brier}</dd>
            <dt>Likely cause</dt>
            <dd>{selectedHospital.likely_cause}</dd>
            <dt>Recommendation</dt>
            <dd>{selectedHospital.recommendation}</dd>
          </dl>
        </Panel>
        <Panel title="Subgroup fairness and drift signals">
          <DataTable
            rows={snapshot.subgroups}
            rowKey={(row) => row.group}
            rowTone={(row) => (row.signal.includes('overestimates') || row.signal.includes('drift') ? 'crit' : row.signal.includes('Missing') ? 'warn' : undefined)}
            columns={[
              { key: 'group', label: 'Subgroup', render: (row) => <strong>{row.group}</strong> },
              { key: 'n', label: 'N' },
              { key: 'auc', label: 'AUC' },
              { key: 'calibration_slope', label: 'Cal. slope' },
              { key: 'signal', label: 'Signal' },
            ]}
          />
        </Panel>
      </div>
      <Panel title="Hospital C drift timeline">
        <ol className="issue51-timeline">
          {snapshot.drift_timeline.map((event) => (
            <li key={`${event.month}-${event.event}`} className={`issue51-${event.level}`}>
              <strong>{event.month}</strong>
              <span>{event.event}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

function Recalibration({ snapshot }: { snapshot: Snapshot }) {
  const before = snapshot.recalibration.before;
  const after = snapshot.recalibration.after;
  return (
    <div className="hx-grid">
      <Panel title="Recalibration test · Hospital C">
        <p className="issue51-note">{snapshot.recalibration.method}</p>
        <div className="issue51-recalibration">
          <Metric label="Calibration slope before" value={before.calibration_slope} tone="crit" />
          <span className="issue51-arrow">→</span>
          <Metric label="Calibration slope after" value={after.calibration_slope} tone="ok" />
          <Metric label="Brier before" value={before.brier} tone="crit" />
          <span className="issue51-arrow">→</span>
          <Metric label="Brier after" value={after.brier} tone="ok" />
        </div>
        <p>{snapshot.recalibration.committee_note}</p>
      </Panel>
      <Panel title="Publication comparator">
        <DataTable
          rows={snapshot.publication_comparator}
          rowKey={(row) => row.metric}
          columns={[
            { key: 'metric', label: 'Metric', render: (row) => <strong>{row.metric}</strong> },
            { key: 'publication', label: 'Publication' },
            { key: 'local_target', label: 'Local target' },
          ]}
        />
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'crit' }) {
  return (
    <div className={`issue51-metric issue51-metric-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Passport({
  snapshot,
  result,
  loading,
  run,
  signedDecision,
  onSign,
}: {
  snapshot: Snapshot;
  result: AgentResult | null;
  loading: boolean;
  run: number;
  signedDecision: string | null;
  onSign: (decision: string) => void;
}) {
  return (
    <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(420px, 2fr)' }}>
      <Panel title="Committee sign-off">
        <p className="issue51-note">{snapshot.passport.status}. The prototype keeps the final judgment with the committee.</p>
        <div className="issue51-actions">
          {snapshot.passport.decision_options.map((option) => (
            <button key={option} type="button" className="hx-btn" onClick={() => onSign(option)} disabled={!result || loading}>
              {signedDecision === option ? '✓ ' : ''}
              {option}
            </button>
          ))}
        </div>
        {signedDecision ? (
          <p>
            <Pill tone="ok">Signed</Pill> {signedDecision}
          </p>
        ) : (
          <span className="hx-empty">Draft the passport, then choose the committee decision.</span>
        )}
      </Panel>
      <Panel
        title={result?.headline ?? 'AI-drafted model passport'}
        actions={result && <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>}
      >
        <Backstage
          key={run}
          title="Behind the scenes – passport drafting"
          stages={passportStages}
          running={loading}
          holdLast
          release={!loading}
          note="The live path uses the Copilot SDK tool to read the synthetic validation snapshot."
        />
        {!result && !loading && <span className="hx-empty">Click “Draft model passport” to generate the committee draft.</span>}
        {result?.note && <p className="issue51-note">{result.note}</p>}
        {result && (
          <div className="blocks">
            {result.blocks.map((block: UIBlock, index: number) => (
              <RenderBlock key={index} block={block} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
