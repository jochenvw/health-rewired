import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult, type PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
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
type View = 'worklist' | 'case' | 'timeline' | 'evidence';
type Specialty = 'Oncology' | 'Radiology' | 'Pathology';
type Horizon = 'future' | 'sixMonths';

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
              {view === 'case' && <AtAGlance record={record} agentResult={agentResults[selectedId]} specialty={specialty} horizon={horizon} />}
              {view === 'timeline' && <TimelinePanel record={record} timeline={timeline} />}
              {view === 'evidence' && <EvidencePanel record={record} agentResult={agentResults[selectedId]} horizon={horizon} />}
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
              {horizon === 'future' && specialty === 'Radiology' && <SpecialtyPanel record={record} specialty={specialty} />}
              {horizon === 'future' && specialty === 'Pathology' && <SpecialtyPanel record={record} specialty={specialty} />}
            </>
          ) : (
            <Panel title="Loading synthetic patient record"><span className="hx-working"><span className="hx-spinner" aria-hidden /> Loading the record…</span></Panel>
          )
        )}
        </div>
      </HospitalShell>
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

function AtAGlance({ record, agentResult, specialty, horizon }: { record: PatientRecord; agentResult?: AgentResult; specialty: Specialty; horizon: Horizon }) {
  const treatments = record.treatments.map((treatment) => `${treatment.regimen} · ${treatment.status}`).join('; ') || 'No treatment recorded';
  const recentChange = record.timeline.at(-1)?.event ?? 'No recent change recorded';
  return (
    <>
      <Panel title="Patient at a glance" actions={<Pill tone={agentResult?.mode === 'copilot' ? 'ok' : agentResult ? 'neutral' : 'warn'}>{agentResult ? (agentResult.mode === 'copilot' ? 'Copilot reviewed' : 'Demo mode · synthetic record') : 'Preparation not started'}</Pill>}>
        <div className="issue74-glance">
          <Fact label="Disease" value={record.diagnosis.primary} source={`patients/${record.id}.json · diagnosis`} />
          <Fact label="Stage / current state" value={`${record.diagnosis.stage} · ${record.current_status ?? 'See latest record entry'}`} source={`patients/${record.id}.json · staging and current status`} />
          <Fact label="Treatments so far" value={treatments} source={`patients/${record.id}.json · treatments`} />
          <Fact label="What changed" value={recentChange} source={`patients/${record.id}.json · dated timeline`} />
          <Fact label="Question for the MDT" value={clinicalQuestion(record)} source={`patients/${record.id}.json · open questions`} />
        </div>
      </Panel>
      <Panel title={`What matters to ${specialty.toLowerCase()}`} actions={horizon === 'sixMonths' ? <Pill tone="warn">Future capability · not in six months</Pill> : undefined}>
        {horizon === 'sixMonths' ? (
          <p className="issue74-muted">Role-specific views need the richer future platform. The six-month view keeps one shared case summary and the visible gaps.</p>
        ) : (
          <SpecialtyFocus record={record} specialty={specialty} />
        )}
      </Panel>
      {agentResult && (
        <details className="issue74-agent-details">
          <summary>Open the assistant's evidence pass · {agentResult.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
          <p>{agentResult.note ?? 'The assistant used the synthetic sample record. Review the source before relying on any extracted fact.'}</p>
          <div className="issue74-agent-blocks">{agentResult.blocks.map((block, index) => <RenderBlock key={`${block.title}-${index}`} block={block} />)}</div>
        </details>
      )}
    </>
  );
}

function Fact({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="issue74-fact">
      <span className="issue74-fact-label">{label}</span>
      <strong>{value}</strong>
      <details><summary>Source</summary><span>{source}</span></details>
    </div>
  );
}

function SpecialtyFocus({ record, specialty }: { record: PatientRecord; specialty: Specialty }) {
  if (specialty === 'Radiology') {
    const scan = record.imaging?.at(-1);
    return <p>{scan ? `${scan.modality} · ${scan.date}: ${scan.result}` : 'No imaging report is present in the retrieved record.'} <strong>Direct review of images remains a human task.</strong></p>;
  }
  if (specialty === 'Pathology') {
    const biomarkers = Object.entries(record.diagnosis.biomarkers).map(([name, value]) => `${name}: ${value}`).join(' · ');
    return <p>{record.diagnosis.primary}{record.diagnosis.grade ? ` · grade ${record.diagnosis.grade}` : ''}. Biomarkers recorded: {biomarkers || 'none found'}.</p>;
  }
  return <p>{record.diagnosis.stage} · ECOG {record.ecog}. {record.treatments.at(-1)?.regimen ?? 'No treatment recorded'}; MDT question: {clinicalQuestion(record)}</p>;
}

function SpecialtyPanel({ record, specialty }: { record: PatientRecord; specialty: Specialty }) {
  return (
    <Panel title={`${specialty} view · same prepared case`}>
      <SpecialtyFocus record={record} specialty={specialty} />
      <p className="issue74-muted">This changes what is foregrounded, not the source record or the clinical decision.</p>
    </Panel>
  );
}

function TimelinePanel({ record, timeline }: { record: PatientRecord; timeline: PatientRecord['timeline'] }) {
  const source = sourceFor(record.id);
  return (
    <Panel title="Longitudinal clinical timeline" actions={<Pill tone="info">{timeline.length} dated events</Pill>}>
      <p className="issue74-intro">The sequence is assembled from the dated entries in the synthetic patient record. Open a source line to inspect the text behind it.</p>
      <ol className="issue74-timeline">
        {timeline.map((event) => (
          <li key={`${event.date}-${event.event}`}>
            <time>{event.date}</time>
            <div>
              <strong>{event.event}</strong>
              <details>
                <summary>Source · {record.id === 'P-010' ? 'outside record' : 'hospital record'}</summary>
                <blockquote>{event.event}</blockquote>
                <span>{source.label} · `patients/{record.id}.json`</span>
              </details>
            </div>
          </li>
        ))}
      </ol>
      {record.id === 'P-010' && <ItalianReport />}
    </Panel>
  );
}

function ItalianReport() {
  return (
    <div className="issue74-source-card">
      <div><Pill tone="warn">Outside source · simulated PDF</Pill><span> Italian · MRI liver report · Ospedale Esempio</span></div>
      <p className="issue74-eyebrow">ORIGINAL SOURCE SENTENCE</p>
      <blockquote lang="it">“Le lesioni epatiche note sono descritte; la resecabilità non è specificata nel referto.”</blockquote>
      <p><strong>Working extraction:</strong> Liver lesions mentioned. Resectability is not stated; direct image review is still needed.</p>
      <p className="issue74-muted">The source remains authoritative. This prototype shows a simulated artifact; no image or outside hospital was contacted.</p>
    </div>
  );
}

function EvidencePanel({ record, agentResult, horizon }: { record: PatientRecord; agentResult?: AgentResult; horizon: Horizon }) {
  const source = sourceFor(record.id);
  const molecularKeys = Object.keys(record.diagnosis.biomarkers).map((key) => key.toLowerCase());
  const molecularGap = record.diagnosis.primary.toLowerCase().includes('metast') && !molecularKeys.some((key) => key.includes('ras') || key.includes('kras'));
  const gaps = [...record.open_questions, ...(molecularGap ? ['RAS result not found in this record.'] : [])];
  return (
    <>
      <Panel title="Evidence gathered" actions={<Pill tone="info">{source.format}</Pill>}>
        <dl className="issue74-evidence-facts">
          <dt>Source</dt><dd>{source.label}</dd>
          <dt>Diagnosis and stage</dt><dd>{record.diagnosis.primary} · {record.diagnosis.stage}</dd>
          <dt>Treatment</dt><dd>{record.treatments.map((treatment) => treatment.regimen).join('; ') || 'Not recorded'}</dd>
          <dt>Latest imaging report</dt><dd>{record.imaging?.at(-1)?.result ?? 'No imaging report found in this record.'}</dd>
        </dl>
        {record.id === 'P-010' && horizon === 'future' && <ItalianReport />}
      </Panel>
      <Panel title="Missing or unresolved" actions={<Pill tone={gaps.length ? 'warn' : 'ok'}>{gaps.length ? `${gaps.length} open` : 'No gap recorded'}</Pill>}>
        {gaps.length ? <ul className="issue74-gaps">{gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul> : <p>No open questions are recorded in this synthetic file.</p>}
        {record.id === 'P-010' && <p><Pill tone="warn">Needs specialist review</Pill> Direct review of the MRI images. Resectability is not stated in the source report.</p>}
      </Panel>
      {agentResult && (
        <Panel title="Assistant's source-grounded output" actions={<Pill tone={agentResult.mode === 'copilot' ? 'ok' : 'neutral'}>{agentResult.mode === 'copilot' ? 'Copilot SDK' : 'Demo mode'}</Pill>}>
          {agentResult.blocks.map((block, index) => <RenderBlock key={`${block.title}-${index}`} block={block} />)}
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
