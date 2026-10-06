import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { api, type AgentResult, type PatientRecord } from '../../api';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-74.css';

export const meta: IdeaMeta = {
  id: '74',
  issue: 74,
  title: 'MDT cases, ready to review',
  tagline: 'The patient story is assembled before the tumour board starts.',
};

type CaseStatus = 'scheduled' | 'preparing' | 'prepared' | 'accepted' | 'challenged' | 'returned';
type View = 'worklist' | 'identity' | 'case' | 'timeline' | 'evidence';
type Specialty = 'Oncology' | 'Radiology' | 'Pathology';
type Horizon = 'future' | 'sixMonths';
type IdentityState = 'verified' | 'probable' | 'review' | 'mismatch';
type IdentityDecision = 'confirmed' | 'separate' | 'investigating';
type EvidenceState = 'corroborated' | 'source-confirmed' | 'single-source' | 'unverified' | 'contradictory' | 'missing';

type EvidenceSource = {
  title: string;
  hospital: string;
  date: string;
  type: string;
  excerpt: string;
};

type EvidenceAssertion = {
  statement: string;
  state: EvidenceState;
  sources: EvidenceSource[];
  explanation: string;
};

type IdentityCandidate = {
  id: string;
  hospital: string;
  name: string;
  dob: string;
  localId: string;
  referral: string;
  recordCount: number;
  state: IdentityState;
  evidence: string[];
};

const scheduled = [
  { id: 'P-003', time: '08:30', source: 'Connected · structured record + pathology report' },
  { id: 'P-004', time: '08:45', source: 'Connected · structured record + imaging report' },
  { id: 'P-005', time: '09:00', source: 'Connected · structured record + clinic note' },
  { id: 'P-010', time: '09:15', source: 'Outside hospital · Italian MRI PDF' },
];

const story: StoryStep[] = [
  { id: 'list', title: 'MDT list', explain: 'Four synthetic colorectal cases are scheduled. Their records are still held in different places.' },
  { id: 'acquire', title: 'Gather evidence', explain: 'Prepare all four cases in parallel; the assistant reads each record and keeps missing details open.' },
  { id: 'review', title: 'Review a case', explain: 'Start with a short patient-at-a-glance summary, then open the timeline and source evidence.' },
  { id: 'decision', title: 'Ready for MDT', explain: 'Accept the preparation, challenge it or send it back. The clinical team owns the decision.' },
];

const prepareStages: Stage[] = [
  { label: 'Requesting records for all four patients', detail: 'Connected hospitals and one outside-hospital report', ms: 650 },
  { label: 'Reading different formats and languages', detail: 'Structured records · report text · Italian PDF', ms: 750 },
  { label: 'Putting evidence into a shared working view', detail: 'Dates, treatments, findings and provenance stay visible', ms: 750 },
  { label: 'Building timelines and checking for gaps', detail: 'Drafts go to clinicians; missing facts are not inferred', ms: 750 },
];

const specialties: Specialty[] = ['Oncology', 'Radiology', 'Pathology'];

function sourceFor(patientId: string) {
  if (patientId === 'P-010') {
    return {
      label: 'Ospedale Esempio, Italy · outside the shared data layer',
      format: 'MRI report · Italian PDF · simulated for this prototype',
    };
  }
  const source = scheduled.find((item) => item.id === patientId)?.source ?? 'Connected hospital record';
  return { label: `Hospital ${String.fromCharCode(65 + Number(patientId.slice(-1)) - 3)} · connected source`, format: source };
}

function clinicalQuestion(record: PatientRecord) {
  return record.open_questions[0] ?? 'What should the MDT decide next?';
}

function preparedTone(status: CaseStatus): 'neutral' | 'ok' | 'warn' | 'info' {
  if (status === 'accepted') return 'ok';
  if (status === 'challenged' || status === 'returned') return 'warn';
  if (status === 'prepared') return 'info';
  return 'neutral';
}

const identityLabels: Record<IdentityState, string> = {
  verified: 'Verified match',
  probable: 'Probable match',
  review: 'Review required',
  mismatch: 'Mismatch',
};

const evidenceLabels: Record<EvidenceState, string> = {
  corroborated: 'Corroborated',
  'source-confirmed': 'Source confirmed',
  'single-source': 'Single source',
  unverified: 'Unverified',
  contradictory: 'Contradictory',
  missing: 'Missing',
};

function identityCandidates(record: PatientRecord): IdentityCandidate[] {
  const surname = record.name.split(' ').at(-1) ?? record.name;
  const givenName = record.name.split(' ')[0] ?? record.name;
  const syntheticYear = 2026 - record.age;
  const demoReferral = `REF-EU-${record.id.slice(-3)}`;
  return [
    {
      id: 'utrecht',
      hospital: 'Utrecht University Medical Center',
      name: record.name,
      dob: `01 Jan ${syntheticYear} · synthetic`,
      localId: `NL-${record.id.replace('P-', '482')}`,
      referral: demoReferral,
      recordCount: 3,
      state: 'verified',
      evidence: ['Name agrees exactly', 'Synthetic date of birth agrees', 'Referral identifier agrees', 'Local identifier is present'],
    },
    {
      id: 'milan',
      hospital: 'Milan Cancer Centre',
      name: `${surname.toUpperCase()}, ${givenName[0]}.`,
      dob: `01/01/${syntheticYear}`,
      localId: `IT-${record.id.slice(-3)}9431`,
      referral: demoReferral,
      recordCount: 5,
      state: 'probable',
      evidence: ['Date of birth agrees in a different format', 'Referral identifier agrees', 'Name order and abbreviation differ'],
    },
    {
      id: 'tuscany',
      hospital: 'Tuscan Oncology Network',
      name: `${givenName} ${surname}`,
      dob: `01 Jan ${syntheticYear}`,
      localId: 'Not provided',
      referral: demoReferral,
      recordCount: 2,
      state: 'probable',
      evidence: ['Name and synthetic date of birth agree', 'Referral identifier agrees', 'Local identifier is missing'],
    },
    {
      id: 'munich',
      hospital: 'Munich Hospital',
      name: `${givenName} ${surname}`,
      dob: String(syntheticYear),
      localId: 'Unavailable',
      referral: 'Not provided',
      recordCount: 2,
      state: 'review',
      evidence: ['Name is similar', 'Only birth year is available', 'No local or referral identifier to link records'],
    },
    {
      id: 'lyon',
      hospital: 'Lyon Regional Hospital',
      name: 'Giovanni Rizzo',
      dob: '11 Feb 1972 · synthetic',
      localId: 'FR-118204',
      referral: 'REF-FR-7712',
      recordCount: 1,
      state: 'mismatch',
      evidence: ['Name does not agree', 'Synthetic date of birth does not agree', 'Referral identifier does not agree'],
    },
  ];
}

function evidenceFor(record: PatientRecord, label: string, statement: string): EvidenceAssertion {
  const patientFile = `patients/${record.id}.json`;
  const baseSource: EvidenceSource = {
    title: 'Oncology patient record',
    hospital: sourceFor(record.id).label,
    date: record.diagnosis.date,
    type: record.id === 'P-010' ? 'Outside record · simulated extraction' : 'Structured synthetic record',
    excerpt: statement,
  };

  if (label.toLowerCase().includes('biomarker') && record.id === 'P-003' && /kras/i.test(statement)) {
    return conflictFor(record);
  }

  if (label === 'Imaging finding') {
    return {
      statement,
      state: record.imaging?.length ? 'source-confirmed' : 'missing',
      explanation: record.imaging?.length ? 'The imaging finding is explicitly recorded in the synthetic imaging report.' : 'No imaging report is available in the retrieved record.',
      sources: record.imaging?.length ? [{
        title: `${record.imaging.at(-1)?.modality ?? 'Imaging'} report`,
        hospital: sourceFor(record.id).label,
        date: record.imaging.at(-1)?.date ?? record.diagnosis.date,
        type: 'Synthetic radiology report',
        excerpt: record.imaging.at(-1)?.result ?? statement,
      }] : missingAssertion(record, 'Imaging report').sources,
    };
  }

  if (label === 'Comorbidity') {
    return {
      statement,
      state: 'single-source',
      explanation: 'This history is present in one synthetic patient record.',
      sources: [{ ...baseSource, title: 'Medical history and comorbidities', type: `Synthetic record · ${patientFile}` }],
    };
  }

  if (label === 'Biomarker') {
    return {
      statement,
      state: 'single-source',
      explanation: 'One synthetic pathology/molecular source currently records this result.',
      sources: [{ ...baseSource, title: 'Molecular pathology result', type: 'Synthetic pathology report' }],
    };
  }

  if (label === 'Disease') {
    return {
      statement,
      state: 'corroborated',
      explanation: 'The same diagnosis appears in three separate synthetic records. The records are simulated for this demonstration.',
      sources: [
        { title: 'Pathology report', hospital: 'Utrecht University Medical Center', date: record.diagnosis.date, type: 'Synthetic pathology report', excerpt: `“${statement} confirmed on the submitted specimen.”` },
        { title: 'Oncology consultation', hospital: 'Milan Cancer Centre', date: record.diagnosis.date, type: 'Synthetic clinical note', excerpt: `“Assessment: ${statement}.”` },
        { title: 'Referral letter', hospital: 'Tuscan Oncology Network', date: record.diagnosis.date, type: 'Synthetic referral', excerpt: `“Referred for MDT review of ${statement}.”` },
      ],
    };
  }

  if (label === 'Stage / current state') {
    return {
      statement,
      state: 'source-confirmed',
      explanation: 'This value is explicitly present in the patient record; a second independent staging source is not available in this case.',
      sources: [{ ...baseSource, title: 'Diagnosis and staging record', excerpt: `${record.diagnosis.stage}. ${record.current_status ?? 'Current status is not explicitly recorded.'}` }],
    };
  }

  if (label === 'Treatments so far') {
    return {
      statement,
      state: 'single-source',
      explanation: 'These treatment entries come from one synthetic patient record; they are not independently corroborated.',
      sources: [{
        title: 'Treatment history',
        hospital: sourceFor(record.id).label,
        date: record.treatments.at(-1)?.start ?? record.diagnosis.date,
        type: 'Synthetic patient record',
        excerpt: statement,
      }],
    };
  }

  if (label === 'What changed') {
    return {
      statement,
      state: 'single-source',
      explanation: 'One dated timeline entry supports this update.',
      sources: [{ ...baseSource, title: 'Dated oncology timeline', type: 'Synthetic timeline entry' }],
    };
  }

  if (label === 'Question for the MDT') {
    return {
      statement,
      state: 'source-confirmed',
      explanation: 'This question is recorded as an open item; it is not an AI recommendation.',
      sources: [{ ...baseSource, title: 'Open questions in the patient record', type: 'Synthetic MDT preparation entry' }],
    };
  }

  return {
    statement,
    state: 'single-source',
    explanation: 'One synthetic source currently supports this statement.',
    sources: [{ ...baseSource, title: label, type: `Synthetic record · ${patientFile}` }],
  };
}

export default function TeamDomitian() {
  const [records, setRecords] = useState<Record<string, PatientRecord>>({});
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [agentResults, setAgentResults] = useState<Record<string, AgentResult>>({});
  const [statuses, setStatuses] = useState<Record<string, CaseStatus>>(
    Object.fromEntries(scheduled.map(({ id }) => [id, 'scheduled'])),
  );
  const [selectedId, setSelectedId] = useState('P-003');
  const [view, setView] = useState<View>('worklist');
  const [specialty, setSpecialty] = useState<Specialty>('Oncology');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [preparing, setPreparing] = useState(false);
  const [requestsDone, setRequestsDone] = useState(false);
  const [notice, setNotice] = useState('');
  const [challenge, setChallenge] = useState('');
  const [identityDecisions, setIdentityDecisions] = useState<Record<string, IdentityDecision>>({});
  const [evidenceDrawer, setEvidenceDrawer] = useState<EvidenceAssertion | null>(null);
  const [datasetGroups, setDatasetGroups] = useState<{ group: string; elements: { name: string; likely_source: string }[] }[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all(
      scheduled.map(async ({ id }) => {
        try {
          const record = await api.patient(id);
          if (active) setRecords((current) => ({ ...current, [id]: record }));
        } catch {
          if (active) setLoadErrors((current) => [...current, id]);
        }
      }),
    );
    api
      .sampleData<{ groups: { group: string; elements: { name: string; likely_source: string }[] }[] }>('minimal-mdt-dataset.json')
      .then((data) => {
        if (active) setDatasetGroups(data.groups);
      })
      .catch(() => setDatasetGroups([]));
    return () => {
      active = false;
    };
  }, []);

  const record = records[selectedId];
  const readyCount = Object.values(statuses).filter((status) => status === 'prepared' || status === 'accepted').length;
  const hasPreparation = Object.values(statuses).some((status) => status !== 'scheduled' && status !== 'preparing');
  const timeline = useMemo(() => [...(record?.timeline ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [record]);
  const storyStep = preparing
    ? 'acquire'
    : statuses[selectedId] === 'accepted'
      ? 'decision'
      : hasPreparation
        ? 'review'
        : 'list';

  const prepareAll = async () => {
    if (preparing || Object.keys(records).length < scheduled.length) return;
    setPreparing(true);
    setRequestsDone(false);
    setView('case');
    setNotice('');
    setStatuses(Object.fromEntries(scheduled.map(({ id }) => [id, 'preparing'])));
    await Promise.all(
      scheduled.map(async ({ id }) => {
        const patient = records[id];
        try {
          const result = await api.runAgent({
            patient_id: id,
            role: 'MDT coordinator',
            task: `Prepare this synthetic colorectal cancer case for tomorrow's MDT. Review diagnosis, stage, treatment, recent changes and open questions from the patient record. Return a short patient-at-a-glance summary, a chronological timeline, source-grounded evidence, and any facts that are missing or need specialist review. Do not infer missing facts or make a clinical decision.`,
          });
          setAgentResults((current) => ({ ...current, [id]: result }));
          setStatuses((current) => ({ ...current, [id]: 'prepared' }));
        } catch {
          setStatuses((current) => ({ ...current, [id]: 'prepared' }));
          setNotice('The assistant could not be reached. The synthetic records and review controls are still available in this demo.');
        }
        if (!patient) setStatuses((current) => ({ ...current, [id]: 'scheduled' }));
      }),
    );
    setRequestsDone(true);
    setView('case');
  };

  const goToStoryStep = (id: string) => {
    if (id === 'list') setView('worklist');
    if (id === 'acquire') void prepareAll();
    if (id === 'review') setView('case');
    if (id === 'decision') setView('evidence');
  };

  const choosePatient = (id: string) => {
    setSelectedId(id);
    setView('case');
    setNotice('');
    setChallenge('');
  };

  const updateDecision = (status: CaseStatus, message: string) => {
    setStatuses((current) => ({ ...current, [selectedId]: status }));
    setNotice(message);
    if (status === 'challenged') setChallenge('');
  };

  const dataReady = Object.keys(records).length === scheduled.length;

  return (
    <div className="issue74" data-theme={theme}>
      <a className="issue74-skip-link" href="#issue74-main">Skip to case work</a>
      <div className="issue74-controls">
        <div>
          <span className="issue74-eyebrow">TUMOUR BOARD PREPARATION · 4 SYNTHETIC CASES</span>
          <strong>Assemble the story before the MDT</strong>
        </div>
        <div className="issue74-control-group" aria-label="Prototype view controls">
          <div className="issue74-switch" aria-label="Time horizon">
            <button type="button" aria-pressed={horizon === 'sixMonths'} className={horizon === 'sixMonths' ? 'active' : ''} onClick={() => setHorizon('sixMonths')}>
              In six months
            </button>
            <button type="button" aria-pressed={horizon === 'future'} className={horizon === 'future' ? 'active' : ''} onClick={() => setHorizon('future')}>
              The future
            </button>
          </div>
          <div className="issue74-switch" aria-label="Colour theme">
            <button type="button" aria-pressed={theme === 'light'} className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
              Light
            </button>
            <button type="button" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
              Dark
            </button>
          </div>
        </div>
      </div>

      <HospitalShell
        module="MDT preparation"
        guide={<StoryGuide steps={story} current={storyStep} onGo={goToStoryStep} nextLabel="Prepare all" />}
        nav={[
          { id: 'worklist', label: 'Upcoming MDT', badge: scheduled.length },
          { id: 'identity', label: 'Patient identity' },
          { id: 'case', label: 'Patient at a glance' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'evidence', label: 'Evidence & gaps' },
        ]}
        active={view}
        onNav={(id) => setView(id as View)}
        patient={
          record
            ? {
                id: record.id,
                name: record.name,
                age: record.age,
                sex: record.sex,
                diagnosis: `${record.diagnosis.primary} · stage ${record.diagnosis.stage}`,
              }
            : null
        }
        toolbar={
          <>
            <label>
              Patient{' '}
              <select value={selectedId} onChange={(event) => choosePatient(event.target.value)}>
                {scheduled.map(({ id }) => (
                  <option key={id} value={id}>
                    {records[id]?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Specialty view{' '}
              <select value={specialty} disabled={horizon === 'sixMonths'} onChange={(event) => setSpecialty(event.target.value as Specialty)}>
                {specialties.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <span className="hx-spacer" />
            <button className="hx-btn primary" type="button" disabled={!dataReady || preparing} onClick={() => void prepareAll()}>
              {preparing ? <><span className="hx-spinner" aria-hidden /> Preparing all four…</> : 'Prepare all'}
            </button>
          </>
        }
      >
        <div className="issue74-main" id="issue74-main" tabIndex={-1}>
        {notice && <div className="issue74-notice" role="status">{notice}</div>}
        {loadErrors.length > 0 && <div className="issue74-notice issue74-warning">Could not load {loadErrors.join(', ')}. Start the local demo API to open the synthetic records.</div>}
        {preparing && (
          <Panel title="Preparing the scheduled patients in parallel">
            <Backstage
              title="Assistant work · all four cases"
              stages={prepareStages}
              running
              holdLast
              release={requestsDone}
              onFinished={() => setPreparing(false)}
              note="The Copilot SDK reads each synthetic record; the visible summary stays available in demo mode without a Copilot token."
            />
            <div className="issue74-progress-list">
              {scheduled.map(({ id }) => (
                <div key={id}><span>{records[id]?.name ?? id}</span><Pill tone={preparedTone(statuses[id])}>{statusLabel(statuses[id])}</Pill></div>
              ))}
            </div>
          </Panel>
        )}

        {view === 'worklist' && (
          <>
            <Panel title="Upcoming colorectal MDT · Tomorrow, 08:30" actions={<Pill tone={readyCount === scheduled.length ? 'ok' : 'warn'}>{readyCount} of {scheduled.length} prepared</Pill>}>
              <p className="issue74-intro">Gather the evidence for the whole list before the first case is discussed. Sources and dates remain visible; missing items stay open.</p>
              <DataTable
                rowKey={(patient) => patient.id}
                rows={scheduled.map((item) => ({ ...item, name: records[item.id]?.name ?? item.id, diagnosis: records[item.id]?.diagnosis.primary ?? 'Loading synthetic record…' }))}
                selected={selectedId}
                onSelect={(patient) => choosePatient(patient.id)}
                columns={[
                  { key: 'time', label: 'Time', width: '70px' },
                  { key: 'name', label: 'Patient', render: (patient) => <strong>{patient.name}</strong> },
                  { key: 'diagnosis', label: 'Diagnosis' },
                  { key: 'source', label: 'Evidence available' },
                  { key: 'status', label: 'Preparation', render: (patient) => <Pill tone={preparedTone(statuses[patient.id])}>{statusLabel(statuses[patient.id])}</Pill> },
                ]}
              />
              <div className="issue74-worklist-footer">
                <span>One outside hospital · report in Italian · source remains authoritative</span>
                <button className="hx-btn primary" type="button" disabled={!dataReady || preparing} onClick={() => void prepareAll()}>
                  {preparing ? <><span className="hx-spinner" aria-hidden /> Working…</> : 'Prepare all four patients'}
                </button>
              </div>
            </Panel>
            {horizon === 'sixMonths' && <CoveragePanel groups={datasetGroups} record={record} />}
          </>
        )}

        {view !== 'worklist' && (
          record ? (
            <>
              {view === 'identity' && (
                <IdentityPanel
                  record={record}
                  horizon={horizon}
                  decisions={identityDecisions}
                  onDecision={(id, decision) => {
                    setIdentityDecisions((current) => ({ ...current, [`${record.id}:${id}`]: decision }));
                    const message = decision === 'confirmed'
                      ? 'Human verified: this source can now be considered for this synthetic case.'
                      : decision === 'separate'
                        ? 'This source will remain separate from the patient timeline.'
                        : 'Investigation noted. This source remains separate until a clinician verifies it.';
                    setNotice(message);
                  }}
                />
              )}
              {view === 'case' && (
                <IdentityPanel
                  record={record}
                  horizon={horizon}
                  decisions={identityDecisions}
                  onDecision={(id, decision) => {
                    setIdentityDecisions((current) => ({ ...current, [`${record.id}:${id}`]: decision }));
                    setNotice(decision === 'confirmed' ? 'Human verified: this source can now be considered for this synthetic case.' : decision === 'separate' ? 'This source will remain separate from the patient timeline.' : 'Investigation noted. This source remains separate until a clinician verifies it.');
                  }}
                />
              )}
              {view === 'case' && <AtAGlance record={record} agentResult={agentResults[selectedId]} specialty={specialty} horizon={horizon} onInspect={(assertion) => setEvidenceDrawer(assertion)} />}
              {view === 'timeline' && <TimelinePanel record={record} timeline={timeline} onInspect={(assertion) => setEvidenceDrawer(assertion)} />}
              {view === 'evidence' && <EvidencePanel record={record} agentResult={agentResults[selectedId]} horizon={horizon} onInspect={(assertion) => setEvidenceDrawer(assertion)} />}
              {horizon === 'sixMonths' && <CoveragePanel groups={datasetGroups} record={record} />}
              <Panel title="Your review">
                <p className="issue74-intro">Preparation is a draft. The team keeps every clinical judgment and decision.</p>
                {statuses[selectedId] === 'accepted' ? (
                  <Pill tone="ok">Preparation accepted for the MDT</Pill>
                ) : (
                  <div className="issue74-actions">
                    <button className="hx-btn primary" type="button" onClick={() => updateDecision('accepted', 'Preparation accepted for the MDT. The clinical decision remains with the team.')}>Accept preparation</button>
                    <button className="hx-btn" type="button" onClick={() => updateDecision('challenged', 'Tell the team what needs a second look.')}>Challenge</button>
                    <button className="hx-btn" type="button" onClick={() => updateDecision('returned', 'Preparation sent back for correction. The source record is unchanged.')}>Send back for correction</button>
                  </div>
                )}
                {statuses[selectedId] === 'challenged' && (
                  <form className="issue74-challenge" onSubmit={(event) => { event.preventDefault(); setNotice(challenge.trim() ? `Challenge noted: ${challenge}` : 'Add a short note so the team knows what to review.'); }}>
                    <label htmlFor="issue74-challenge">What should the team check?</label>
                    <textarea id="issue74-challenge" value={challenge} onChange={(event) => setChallenge(event.target.value)} placeholder="For example: confirm the date of the outside MRI report" rows={2} />
                    <button className="hx-btn" type="submit">Save review note</button>
                  </form>
                )}
              </Panel>
              {horizon === 'future' && specialty === 'Radiology' && <SpecialtyPanel record={record} specialty={specialty} onInspect={(assertion) => setEvidenceDrawer(assertion)} />}
              {horizon === 'future' && specialty === 'Pathology' && <SpecialtyPanel record={record} specialty={specialty} onInspect={(assertion) => setEvidenceDrawer(assertion)} />}
            </>
          ) : (
            <Panel title="Loading synthetic patient record"><span className="hx-working"><span className="hx-spinner" aria-hidden /> Loading the record…</span></Panel>
          )
        )}
        </div>
      </HospitalShell>
      {evidenceDrawer && <EvidenceDrawer assertion={evidenceDrawer} onClose={() => setEvidenceDrawer(null)} />}
    </div>
  );
}

function statusLabel(status: CaseStatus) {
  return ({
    scheduled: 'Not started',
    preparing: 'Preparing',
    prepared: 'Draft ready',
    accepted: 'Accepted',
    challenged: 'Needs review',
    returned: 'Sent back',
  })[status];
}

function EvidenceMarker({ state }: { state: EvidenceState }) {
  const symbols: Record<EvidenceState, string> = {
    corroborated: '✓',
    'source-confirmed': '●',
    'single-source': '○',
    unverified: '?',
    contradictory: '!',
    missing: '–',
  };
  return (
    <span className={`issue74-evidence-state state-${state}`} title={evidenceLabels[state]}>
      <span aria-hidden="true">{symbols[state]}</span> {evidenceLabels[state]}
    </span>
  );
}

function EvidenceLink({ assertion, onInspect, label }: { assertion: EvidenceAssertion; onInspect: (assertion: EvidenceAssertion) => void; label?: string }) {
  return (
    <button type="button" className="issue74-evidence-link" title={`${assertion.explanation}${assertion.sources[0] ? ` · ${assertion.sources[0].title}, ${assertion.sources[0].hospital}` : ''}`} onClick={() => onInspect(assertion)}>
      {label ?? `${assertion.sources.length} ${assertion.sources.length === 1 ? 'source' : 'sources'} ↗`}
    </button>
  );
}

function EvidenceReadiness({ record, onInspect }: { record: PatientRecord; onInspect: (assertion: EvidenceAssertion) => void }) {
  const assertions = [
    evidenceFor(record, 'Disease', record.diagnosis.primary),
    evidenceFor(record, 'Stage / current state', `${record.diagnosis.stage} · ${record.current_status ?? 'See latest record entry'}`),
    evidenceFor(record, 'Treatments so far', record.treatments.map((item) => `${item.regimen} · ${item.status}`).join('; ') || 'No treatment recorded'),
    evidenceFor(record, 'What changed', record.timeline.at(-1)?.event ?? 'No recent change recorded'),
    evidenceFor(record, 'Question for the MDT', clinicalQuestion(record)),
  ];
  const contradictionCount = record.id === 'P-003' ? 1 : 0;
  const missingCount = (record.id === 'P-010' ? 1 : 0) + (record.diagnosis.primary.toLowerCase().includes('metast') && !Object.keys(record.diagnosis.biomarkers).some((key) => /ras|kras/i.test(key)) ? 1 : 0);
  const counts = [
    { state: 'corroborated' as const, count: assertions.filter((item) => item.state === 'corroborated').length },
    { state: 'source-confirmed' as const, count: assertions.filter((item) => item.state === 'source-confirmed').length },
    { state: 'single-source' as const, count: assertions.filter((item) => item.state === 'single-source').length },
    { state: 'unverified' as const, count: record.open_questions.length },
    { state: 'contradictory' as const, count: contradictionCount },
    { state: 'missing' as const, count: missingCount },
  ];
  return (
    <Panel title="Evidence readiness · support, not a clinical confidence score">
      <div className="issue74-readiness">
        {counts.map(({ state, count }) => (
          <div key={state} className={`readiness-${state}`}><EvidenceMarker state={state} /><strong>{count}</strong></div>
        ))}
      </div>
      <div className="issue74-evidence-assertions">
        {assertions.map((assertion) => (
          <div key={assertion.statement} className="issue74-assertion-row">
            <strong>{assertion.statement}</strong>
            <EvidenceMarker state={assertion.state} />
            <EvidenceLink assertion={assertion} onInspect={onInspect} />
          </div>
        ))}
      </div>
      {record.id === 'P-003' && <ConflictCard record={record} onInspect={onInspect} />}
    </Panel>
  );
}

function IdentityPanel({
  record,
  horizon,
  decisions,
  onDecision,
}: {
  record: PatientRecord;
  horizon: Horizon;
  decisions: Record<string, IdentityDecision>;
  onDecision: (id: string, decision: IdentityDecision) => void;
}) {
  const candidates = identityCandidates(record);
  const verified = candidates.filter((candidate) => candidate.state === 'verified').length;
  return (
    <Panel title="Patient identity · before records join the timeline" actions={<Pill tone="info">{verified} verified match · 4 not auto-linked</Pill>}>
      <p className="issue74-intro">Synthetic identity matching across participating hospitals. Identity confidence answers “same person?”—it is separate from evidence support for clinical facts.</p>
      {horizon === 'sixMonths' && <div className="issue74-future-only"><strong>Future capability · not in six months</strong><span>Cross-hospital patient-level retrieval and identity matching need the richer platform. Candidate cards below are a simulated preview, not available from the minimal dataset alone.</span></div>}
      <div className="issue74-identity-current">
        <span className="issue74-eyebrow">CURRENT SYNTHETIC PATIENT</span>
        <strong>{record.name}</strong>
        <span>{record.id} · age {record.age} · DOB not in source record</span>
        <span>Search complete · simulated fan-out to five hospital records <span aria-hidden="true">↓</span></span>
      </div>
      <p className="issue74-identity-assumption">Demo-only comparison: hospital DOB fields are synthetic values generated for this walkthrough; the sample patient record itself contains age, not date of birth.</p>
      <div className="issue74-identity-fanout" aria-label="Simulated hospital search results">
        {candidates.map((candidate) => <div key={candidate.id}><span aria-hidden="true">↓</span><strong>{candidate.hospital.split(' ')[0]}</strong><small>{candidate.recordCount} records returned</small></div>)}
      </div>
      <div className="issue74-identity-grid">
        {candidates.map((candidate) => {
          const decision = decisions[`${record.id}:${candidate.id}`];
          const status = decision === 'confirmed' ? 'verified' : candidate.state;
          return (
            <article key={candidate.id} className={`issue74-identity-card identity-${status}${horizon === 'sixMonths' ? ' identity-future-locked' : ''}`}>
              <header>
                <strong>{decision === 'confirmed' ? '✓ Human verified' : decision === 'separate' ? 'Human kept separate' : decision === 'investigating' ? 'Investigation in progress' : identityLabels[status]}</strong>
                <span>{candidate.hospital}</span>
              </header>
              <div className="issue74-identity-details">
                <strong>{candidate.name}</strong>
                <span>DOB: {candidate.dob}</span>
                <span>Local ID: {candidate.localId}</span>
                <span>Referral: {candidate.referral}</span>
              </div>
              <details>
                <summary>Compare identity evidence</summary>
                <ul>{candidate.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                <div className="issue74-identity-comparison">
                  <span>Selected patient</span><strong>{record.name} · age {record.age}</strong>
                  <span>{candidate.hospital}</span><strong>{candidate.name} · {candidate.dob}</strong>
                  <span>Referral link</span><strong>{candidate.referral}</strong>
                </div>
              </details>
              {horizon === 'future' && candidate.state === 'review' && (!decision || decision === 'investigating') && (
                <div className="issue74-identity-actions">
                  <button className="hx-btn primary" type="button" onClick={() => onDecision(candidate.id, 'confirmed')}>Confirm same patient</button>
                  <button className="hx-btn" type="button" onClick={() => onDecision(candidate.id, 'separate')}>Keep separate</button>
                  {!decision && <button className="hx-btn" type="button" onClick={() => onDecision(candidate.id, 'investigating')}>Investigate</button>}
                </div>
              )}
              {decision === 'separate' && <p className="identity-decision">Kept separate · not added to this timeline</p>}
              {decision === 'investigating' && <p className="identity-decision">Investigation noted · remains separate until verified</p>}
              {candidate.state !== 'review' && !decision && <p className="identity-decision">{candidate.state === 'mismatch' ? 'Not linked to this patient' : candidate.state === 'probable' ? 'Held separate until a clinician confirms' : 'Included in the synthetic verified set'}</p>}
            </article>
          );
        })}
      </div>
      <p className="issue74-identity-boundary">Only the verified match and records a clinician confirms can be considered for this patient's longitudinal history. Probable, review-required and mismatched records are not silently merged. Names, identifiers and DOBs above are synthetic demo values.</p>
    </Panel>
  );
}

function EvidenceDrawer({ assertion, onClose }: { assertion: EvidenceAssertion; onClose: () => void }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  useEffect(() => setSourceIndex(0), [assertion]);
  useEffect(() => setSourceOpen(false), [assertion, sourceIndex]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  const source = assertion.sources[sourceIndex];
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div className="issue74-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="issue74-evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="issue74-evidence-title" onKeyDown={keepFocusInside}>
        <header>
          <div><span className="issue74-eyebrow">INSPECTABLE BY DESIGN · SYNTHETIC SOURCE</span><h2 id="issue74-evidence-title">Evidence</h2></div>
          <button ref={closeButton} type="button" className="hx-btn" aria-label="Close evidence drawer" onClick={onClose}>Close</button>
        </header>
        <h3>{assertion.statement}</h3>
        <EvidenceMarker state={assertion.state} />
        <p>{assertion.explanation}</p>
        <div className="issue74-source-tabs" aria-label="Evidence sources">
          {assertion.sources.map((item, index) => <button type="button" key={`${item.title}-${item.hospital}`} aria-pressed={index === sourceIndex} onClick={() => setSourceIndex(index)}>{index + 1}. {item.title}</button>)}
        </div>
        {source && (
          <article className="issue74-source-preview">
            <span className="issue74-eyebrow">{source.type.includes('Generated') ? 'GENERATED ASSERTION · SOURCE NOT VERIFIED' : 'SYNTHETIC SOURCE PREVIEW'}</span>
            <h3>{source.title}</h3>
            <dl><dt>Hospital</dt><dd>{source.hospital}</dd><dt>Date</dt><dd>{source.date}</dd><dt>Record type</dt><dd>{source.type}</dd></dl>
            <h4>{source.type.includes('Generated') ? 'Source check' : 'Supporting passage'}</h4>
            <blockquote>{source.excerpt}</blockquote>
            <button type="button" className="hx-btn" onClick={() => setSourceOpen(true)}>{source.type.includes('Generated') ? 'Open synthetic patient record' : 'Open source record'}</button>
            {sourceOpen && <div className="issue74-opened-source" role="status"><strong>{source.title} · {source.hospital}</strong><span>{source.date} · {source.type}</span><p>Original passage</p><blockquote>{source.excerpt}</blockquote><span>The passage supporting “{assertion.statement}” is highlighted. This is a simulated synthetic source document.</span></div>}
          </article>
        )}
        <div className="issue74-normalized">
          <span className="issue74-eyebrow">NORMALIZED ASSERTION</span>
          <strong>{assertion.statement}</strong>
          <span>{assertion.sources.length} source{assertion.sources.length === 1 ? '' : 's'} linked · no real hospital was contacted</span>
        </div>
      </aside>
    </div>
  );
}

function AssistantEvidence({ record, result, onInspect }: { record: PatientRecord; result: AgentResult; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <div className="issue74-agent-blocks">
      {result.blocks.map((block, blockIndex) => (
        <section className="issue74-agent-block" key={`${block.title}-${blockIndex}`}>
          <h4>{block.title}</h4>
          {block.body && (
            <div className="issue74-agent-item">
              <div><strong>{block.body}</strong></div>
              <div className="issue74-fact-evidence">
                <EvidenceMarker state="unverified" />
                <EvidenceLink assertion={generatedAssertion(record, block.body)} onInspect={onInspect} label="Check source ↗" />
              </div>
            </div>
          )}
          {block.items.map((item, itemIndex) => {
            const assertion = generatedAssertion(record, [item.label, item.detail].filter(Boolean).join(' · '), item.source ?? undefined);
            return (
              <div className="issue74-agent-item" key={`${item.label}-${itemIndex}`}>
                <div><strong>[{blockIndex + itemIndex + 1}] {item.label}</strong>{item.detail && <span>{item.detail}</span>}</div>
                <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} /><EvidenceLink assertion={assertion} onInspect={onInspect} label={item.source ?? 'Check source ↗'} /></div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function AtAGlance({ record, agentResult, specialty, horizon, onInspect }: { record: PatientRecord; agentResult?: AgentResult; specialty: Specialty; horizon: Horizon; onInspect: (assertion: EvidenceAssertion) => void }) {
  const treatments = record.treatments.map((treatment) => `${treatment.regimen} · ${treatment.status}`).join('; ') || 'No treatment recorded';
  const recentChange = record.timeline.at(-1)?.event ?? 'No recent change recorded';
  return (
    <>
      <Panel title="Patient at a glance" actions={<Pill tone={agentResult?.mode === 'copilot' ? 'ok' : agentResult ? 'neutral' : 'warn'}>{agentResult ? (agentResult.mode === 'copilot' ? 'Copilot reviewed' : 'Demo mode · synthetic record') : 'Preparation not started'}</Pill>}>
        <div className="issue74-glance">
          <Fact label="Disease" value={record.diagnosis.primary} assertion={evidenceFor(record, 'Disease', record.diagnosis.primary)} onInspect={onInspect} />
          <Fact label="Stage / current state" value={`${record.diagnosis.stage} · ${record.current_status ?? 'See latest record entry'}`} assertion={evidenceFor(record, 'Stage / current state', `${record.diagnosis.stage} · ${record.current_status ?? 'See latest record entry'}`)} onInspect={onInspect} />
          <Fact label="Treatments so far" value={treatments} assertion={evidenceFor(record, 'Treatments so far', treatments)} onInspect={onInspect} />
          <Fact label="What changed" value={recentChange} assertion={evidenceFor(record, 'What changed', recentChange)} onInspect={onInspect} />
          <Fact label="Question for the MDT" value={clinicalQuestion(record)} assertion={evidenceFor(record, 'Question for the MDT', clinicalQuestion(record))} onInspect={onInspect} />
        </div>
      </Panel>
      <EvidenceReadiness record={record} onInspect={onInspect} />
      <Panel title={`What matters to ${specialty.toLowerCase()}`} actions={horizon === 'sixMonths' ? <Pill tone="warn">Future capability · not in six months</Pill> : undefined}>
        {horizon === 'sixMonths' ? (
          <p className="issue74-muted">Role-specific views need the richer future platform. The six-month view keeps one shared case summary and the visible gaps.</p>
        ) : (
          <SpecialtyFocus record={record} specialty={specialty} onInspect={onInspect} />
        )}
      </Panel>
      <Panel title="Other case context · source linked">
        <div className="issue74-extra-facts">
          {Object.entries(record.diagnosis.biomarkers).map(([key, value]) => (
            <Fact key={key} label={`Biomarker · ${key}`} value={value} assertion={evidenceFor(record, `Biomarker · ${key}`, `${key}: ${value}`)} onInspect={onInspect} />
          ))}
          {record.imaging?.slice(-1).map((scan) => <Fact key="imaging" label="Imaging finding" value={`${scan.modality} · ${scan.date}: ${scan.result}`} assertion={evidenceFor(record, 'Imaging finding', scan.result)} onInspect={onInspect} />)}
          {record.comorbidities.length > 0 && <Fact label="Relevant comorbidities" value={record.comorbidities.join('; ')} assertion={evidenceFor(record, 'Comorbidity', record.comorbidities.join('; '))} onInspect={onInspect} />}
        </div>
      </Panel>
      {agentResult && (
        <details className="issue74-agent-details">
          <summary>Open the assistant's evidence pass · {agentResult.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
          <p>{agentResult.note ?? 'The assistant used the synthetic sample record. Review the source before relying on any extracted fact.'}</p>
          <p className="issue74-cited-draft">
            {record.name} has {record.diagnosis.primary} <EvidenceLink assertion={evidenceFor(record, 'Disease', record.diagnosis.primary)} onInspect={onInspect} label="[1]" />.
            {' '}Treatment to date: {treatments} <EvidenceLink assertion={evidenceFor(record, 'Treatments so far', treatments)} onInspect={onInspect} label="[2]" />.
          </p>
          <AssistantEvidence record={record} result={agentResult} onInspect={onInspect} />
        </details>
      )}
    </>
  );
}

function Fact({ label, value, assertion, onInspect }: { label: string; value: string; assertion: EvidenceAssertion; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <div className="issue74-fact">
      <span className="issue74-fact-label">{label}</span>
      <strong>{value}</strong>
      <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div>
    </div>
  );
}

function SpecialtyFocus({ record, specialty, onInspect }: { record: PatientRecord; specialty: Specialty; onInspect: (assertion: EvidenceAssertion) => void }) {
  if (specialty === 'Radiology') {
    const scan = record.imaging?.at(-1);
    const assertion = scan ? evidenceFor(record, 'Imaging finding', scan.result) : missingAssertion(record, 'Imaging report');
    return <div><p>{scan ? `${scan.modality} · ${scan.date}: ${scan.result}` : 'No imaging report is present in the retrieved record.'} <strong>Direct review of images remains a human task.</strong></p><EvidenceMarker state={assertion.state} /> <EvidenceLink assertion={assertion} onInspect={onInspect} /></div>;
  }
  if (specialty === 'Pathology') {
    const biomarkers = Object.entries(record.diagnosis.biomarkers).map(([name, value]) => `${name}: ${value}`).join(' · ');
    const assertion = evidenceFor(record, 'Biomarker', biomarkers || 'No biomarker result recorded');
    return <div><p>{record.diagnosis.primary}{record.diagnosis.grade ? ` · grade ${record.diagnosis.grade}` : ''}. Biomarkers recorded: {biomarkers || 'none found'}.</p><EvidenceMarker state={assertion.state} /> <EvidenceLink assertion={assertion} onInspect={onInspect} /></div>;
  }
  const assertion = evidenceFor(record, 'Stage / current state', `${record.diagnosis.stage} · ECOG ${record.ecog}`);
  return <div><p>{record.diagnosis.stage} · ECOG {record.ecog}. {record.treatments.at(-1)?.regimen ?? 'No treatment recorded'}; MDT question: {clinicalQuestion(record)}</p><EvidenceMarker state={assertion.state} /> <EvidenceLink assertion={assertion} onInspect={onInspect} /></div>;
}

function SpecialtyPanel({ record, specialty, onInspect }: { record: PatientRecord; specialty: Specialty; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <Panel title={`${specialty} view · same prepared case`}>
      <SpecialtyFocus record={record} specialty={specialty} onInspect={onInspect} />
      <p className="issue74-muted">This changes what is foregrounded, not the source record or the clinical decision.</p>
    </Panel>
  );
}

function TimelinePanel({ record, timeline, onInspect }: { record: PatientRecord; timeline: PatientRecord['timeline']; onInspect: (assertion: EvidenceAssertion) => void }) {
  return (
    <Panel title="Longitudinal clinical timeline" actions={<Pill tone="info">{timeline.length} dated events</Pill>}>
      <p className="issue74-intro">Equivalent events are grouped rather than repeated. Each assertion shows how many sources support it; open a source to inspect the passage.</p>
      <ol className="issue74-timeline">
        {timeline.map((event) => {
          const assertion = event.event.toLowerCase().includes('diagnos')
            ? evidenceFor(record, 'Disease', record.diagnosis.primary)
            : event.event.toLowerCase().includes('treatment')
              ? evidenceFor(record, 'Treatments so far', event.event)
              : {
                  statement: event.event,
                  state: 'single-source' as const,
                  explanation: 'One dated synthetic record entry supports this timeline event.',
                  sources: [{
                    title: 'Dated timeline entry',
                    hospital: sourceFor(record.id).label,
                    date: event.date,
                    type: 'Synthetic source record',
                    excerpt: `“${event.event}”`,
                  }],
                };
          return (
            <li key={`${event.date}-${event.event}`} className={assertion.state === 'contradictory' ? 'timeline-contradiction' : undefined}>
              <time>{event.date}</time>
              <div>
                <strong>{event.event}</strong>
                <div className="issue74-fact-evidence"><EvidenceMarker state={assertion.state} /><EvidenceLink assertion={assertion} onInspect={onInspect} /></div>
              </div>
            </li>
          );
        })}
      </ol>
      {record.id === 'P-003' && <ConflictCard record={record} onInspect={onInspect} />}
      {record.id === 'P-010' && <ItalianReport onInspect={() => onInspect(missingAssertion(record, 'Resectability'))} />}
    </Panel>
  );
}

function ItalianReport({ onInspect }: { onInspect: () => void }) {
  return (
    <div className="issue74-source-card">
      <div><Pill tone="warn">Outside source · simulated PDF</Pill><span> Italian · MRI liver report · Ospedale Esempio</span></div>
      <p className="issue74-eyebrow">ORIGINAL SOURCE SENTENCE</p>
      <blockquote lang="it">“Le lesioni epatiche note sono descritte; la resecabilità non è specificata nel referto.”</blockquote>
      <p><strong>Working extraction:</strong> Liver lesions mentioned. Resectability is not stated; direct image review is still needed.</p>
      <p className="issue74-muted">The source remains authoritative. This prototype shows a simulated artifact; no image or outside hospital was contacted.</p>
      <button type="button" className="issue74-evidence-link" onClick={onInspect}>Inspect this source passage ↗</button>
    </div>
  );
}

function missingAssertion(record: PatientRecord, statement: string): EvidenceAssertion {
  return {
    statement,
    state: 'missing',
    explanation: 'No available source explicitly states this fact. The system has not inferred an answer.',
    sources: [{
      title: 'Sources searched',
      hospital: sourceFor(record.id).label,
      date: 'Current MDT preparation',
      type: 'Synthetic retrieval result',
      excerpt: 'No explicit statement found in the available reports. Direct specialist review remains open.',
    }],
  };
}

function generatedAssertion(record: PatientRecord, statement: string, sourceReference?: string): EvidenceAssertion {
  const treatment = record.treatments.at(-1);
  const timeline = record.timeline.slice(-2).map((event) => `${event.date}: ${event.event}`).join(' · ');
  return {
    statement,
    state: 'unverified',
    explanation: 'This generated text has no exact cited passage. The linked patient record is provided for manual checking, not as confirmation.',
    sources: [{
      title: sourceReference ?? `Manual check · patients/${record.id}.json`,
      hospital: sourceFor(record.id).label,
      date: record.diagnosis.date,
      type: 'Generated assertion · synthetic record context, no verbatim citation',
      excerpt: `No verbatim supporting passage is attached. Record context: ${record.diagnosis.primary}; stage ${record.diagnosis.stage}; ${treatment?.regimen ?? 'no treatment recorded'}. Latest dated entries: ${timeline || 'none recorded'}. Check the original synthetic patient record against this statement.`,
    }],
  };
}

function conflictFor(record: PatientRecord): EvidenceAssertion {
  const biomarker = Object.entries(record.diagnosis.biomarkers).find(([key]) => /ras|braf/i.test(key));
  const actual = biomarker ? `${biomarker[0]} ${biomarker[1]}` : 'KRAS G12D';
  return {
    statement: `Molecular result needs reconciliation · ${actual}`,
    state: 'contradictory',
    explanation: 'Two clearly labelled synthetic source excerpts disagree. Neither result is selected or reconciled; clinical review is required.',
    sources: [
      { title: 'Pathology molecular addendum', hospital: 'Utrecht University Medical Center', date: record.diagnosis.date, type: 'Synthetic pathology report', excerpt: `${actual} detected in the synthetic pathology addendum.` },
      { title: 'Outside referral letter', hospital: 'Milan Cancer Centre', date: record.diagnosis.date, type: 'Synthetic referral · intentionally conflicting demo value', excerpt: 'The referral letter lists KRAS wild type. This conflicts with the pathology addendum; verify the original report.' },
    ],
  };
}

function ConflictCard({ record, onInspect }: { record: PatientRecord; onInspect: (assertion: EvidenceAssertion) => void }) {
  const assertion = conflictFor(record);
  return (
    <div className="issue74-conflict">
      <div className="issue74-conflict-heading"><EvidenceMarker state="contradictory" /><strong>Conflicting molecular evidence</strong></div>
      <div className="issue74-conflict-values">
        {assertion.sources.map((source) => <div key={source.title}><span>{source.hospital}</span><strong>{source.excerpt}</strong></div>)}
      </div>
      <p>These synthetic sources disagree. Nothing is silently selected; clinical review is required.</p>
      <EvidenceLink assertion={assertion} onInspect={onInspect} label="Compare evidence" />
    </div>
  );
}

function EvidencePanel({ record, agentResult, horizon, onInspect }: { record: PatientRecord; agentResult?: AgentResult; horizon: Horizon; onInspect: (assertion: EvidenceAssertion) => void }) {
  const source = sourceFor(record.id);
  const molecularKeys = Object.keys(record.diagnosis.biomarkers).map((key) => key.toLowerCase());
  const molecularGap = record.diagnosis.primary.toLowerCase().includes('metast') && !molecularKeys.some((key) => key.includes('ras') || key.includes('kras'));
  const gaps = [...record.open_questions, ...(molecularGap ? ['RAS result not found in this record.'] : [])];
  const facts = [
    { label: 'Diagnosis and stage', value: `${record.diagnosis.primary} · ${record.diagnosis.stage}`, assertion: evidenceFor(record, 'Disease', record.diagnosis.primary) },
    { label: 'Treatment', value: record.treatments.map((treatment) => treatment.regimen).join('; ') || 'Not recorded', assertion: evidenceFor(record, 'Treatments so far', record.treatments.map((treatment) => treatment.regimen).join('; ') || 'Not recorded') },
    { label: 'Latest imaging report', value: record.imaging?.at(-1)?.result ?? 'No imaging report found in this record.', assertion: record.imaging?.length ? evidenceFor(record, 'Latest imaging report', record.imaging.at(-1)?.result ?? '') : missingAssertion(record, 'Imaging report') },
  ];
  return (
    <>
      <Panel title="Evidence gathered" actions={<Pill tone="info">{source.format}</Pill>}>
        <dl className="issue74-evidence-facts"><dt>Source institution</dt><dd>{source.label}</dd>
          {facts.map((fact) => <div className="issue74-evidence-fact-row" key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}<span className="issue74-fact-evidence"><EvidenceMarker state={fact.assertion.state} /><EvidenceLink assertion={fact.assertion} onInspect={onInspect} /></span></dd></div>)}
        </dl>
        {record.id === 'P-010' && horizon === 'future' && <ItalianReport onInspect={() => onInspect(missingAssertion(record, 'Resectability'))} />}
      </Panel>
      <Panel title="Missing or unresolved" actions={<Pill tone={gaps.length ? 'warn' : 'ok'}>{gaps.length ? `${gaps.length} open` : 'No gap recorded'}</Pill>}>
        {gaps.length ? <ul className="issue74-gaps">{gaps.map((gap) => <li key={gap}><EvidenceMarker state="unverified" /><span>{gap}</span><EvidenceLink assertion={missingAssertion(record, gap)} onInspect={onInspect} label="View searched sources" /></li>)}</ul> : <p>No open questions are recorded in this synthetic file.</p>}
        {record.id === 'P-010' && <p><EvidenceMarker state="missing" /> Direct review of the MRI images. Resectability is not stated in the source report. <EvidenceLink assertion={missingAssertion(record, 'Resectability')} onInspect={onInspect} label="View searched sources" /></p>}
        {record.id === 'P-003' && <ConflictCard record={record} onInspect={onInspect} />}
      </Panel>
      {agentResult && (
        <Panel title="Assistant's source-grounded output" actions={<Pill tone={agentResult.mode === 'copilot' ? 'ok' : 'neutral'}>{agentResult.mode === 'copilot' ? 'Copilot SDK' : 'Demo mode'}</Pill>}>
          <p className="issue74-muted">Generated assertions are labelled below. An item without an attached source is marked unverified.</p>
          <AssistantEvidence record={record} result={agentResult} onInspect={onInspect} />
        </Panel>
      )}
    </>
  );
}

function CoveragePanel({ groups, record }: { groups: { group: string; elements: { name: string; likely_source: string }[] }[]; record?: PatientRecord }) {
  const allElements = groups.flatMap((group) => group.elements.map((element) => ({ ...element, group: group.group })));
  const neededNames = [
    'Date of tumour diagnosis',
    'Systemic therapy regimen',
    'Imaging result (e.g. CT thorax-abdomen)',
    'mCRC: RAS',
  ];
  const items = neededNames.map((name) => {
    const element = allElements.find((item) => item.name === name);
    let found = false;
    if (record && name === 'Date of tumour diagnosis') found = Boolean(record.diagnosis.date);
    if (record && name === 'Systemic therapy regimen') found = record.treatments.length > 0;
    if (record && name === 'Imaging result (e.g. CT thorax-abdomen)') found = Boolean(record.imaging?.length);
    if (record && name === 'mCRC: RAS') found = Object.keys(record.diagnosis.biomarkers).some((key) => /^(k?ras)$/i.test(key));
    return { name, group: element?.group ?? 'Minimal tumour-board dataset', likely_source: element?.likely_source ?? 'report text', state: found ? 'Available in record' : 'Not found in this record' };
  });
  const available = items.filter((item) => item.state === 'Available in record').length;
  return (
    <Panel title="In six months · what the minimal dataset can do" actions={<Pill tone="info">Simulated from the UMC Utrecht working list</Pill>}>
      <p className="issue74-intro">{groups.length ? `${available} of ${items.length} relevant fields are present in this synthetic record.` : 'Loading the minimal tumour-board dataset…'} The usual source is an assumption to check with each hospital.</p>
      <ul className="issue74-coverage">{items.map((item) => <li key={item.name}><span>{item.state === 'Available in record' ? '✓' : '—'}</span><strong>{item.name}</strong><small>{item.group} · usually {item.likely_source}</small></li>)}</ul>
      <div className="issue74-future-only"><strong>Needs the future platform</strong><span>Retrieving the Italian PDF from a hospital outside the shared layer, full image review and tailored specialty views.</span></div>
      <p className="issue74-muted">Each hospital would deliver the listed structured fields, start structuring report text and record MDT questions in a fixed form. Images are not part of the minimal dataset.</p>
    </Panel>
  );
}
