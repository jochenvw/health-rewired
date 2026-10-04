import { useEffect, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './workspace.css';

export const meta: IdeaMeta = {
  id: '68', issue: 68,
  title: 'Is the patient ready for the tumour board?',
  tagline: 'See missing colorectal results, prepare reminders, and decide who stays on the agenda.',
};

type Result = {
  id: string; label: string; state: 'available' | 'missing' | 'outdated';
  date: string | null; detail: string; source: string; source_path: string;
  recipient: string; why: string; rule: string;
};
type Patient = {
  id: string; name: string; age: number; sex: string; diagnosis: string;
  question: string; time: string; missing_count: number; results: Result[];
};
type Board = { label: string; board_date: string; snapshot_date: string; patients: Patient[] };
type Reminder = { id: string; label: string; recipient: string; message: string; approved?: boolean };
type Review = { assessment: AgentResult; reminders: Reminder[] };
type Agenda = 'Keep on agenda' | 'Postpone';

const story: StoryStep[] = [
  { id: 'list', title: 'Next week’s list', explain: 'Five synthetic colorectal cases. A tick means a result is available—not that treatment is decided.' },
  { id: 'inspect', title: 'Find the gaps', explain: 'Open Eva’s record: staging and MSI/MMR are missing. Inspect the source and the demo checklist rule.' },
  { id: 'draft', title: 'Review reminders', explain: 'The assistant checks the sources and drafts requests. Edit and approve each; nothing is sent to a real team.' },
  { id: 'agenda', title: 'Decide the agenda', explain: 'A requested result is still missing. You—not the assistant—decide whether this case stays on the agenda.' },
  { id: 'done', title: 'Board prepared', explain: 'The coordinator’s decision and approved requests are recorded in this demo session. Treatment remains with the board.' },
];
const stages = [
  { label: 'Checking pathology and molecular reporting', detail: 'Synthetic source records and reporting status', ms: 600 },
  { label: 'Checking radiology and laboratory results', detail: 'Compare dates with this board’s demo checklist', ms: 600 },
  { label: 'Preparing requests for the coordinator', detail: 'Propose contacts and reminder drafts; no automatic sending' },
];

export default function TumourBoard() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [board, setBoard] = useState<Board | null>(null);
  const [patientId, setPatientId] = useState('CRC-068-01');
  const [step, setStep] = useState('list');
  const [filter, setFilter] = useState('all');
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [agenda, setAgenda] = useState<Record<string, Agenda>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api.ideaRequest<Board>('68', 'board').then(setBoard).catch(() => setLoadError(true));
  }, []);

  const patient = board?.patients.find((p) => p.id === patientId);
  const review = reviews[patientId];
  const requested = review?.reminders.filter((r) => r.approved).length ?? 0;
  const ready = board?.patients.filter((p) => !p.missing_count).length ?? 0;

  const select = (id: string) => {
    if (busy) return;
    setPatientId(id);
    setStep('inspect');
    setNotice('');
  };

  const run = async () => {
    if (busy || !patient) return;
    setStep('draft');
    if (review) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await api.ideaRequest<Review>('68', 'review', { patient_id: patientId });
      setReviews((previous) => ({ ...previous, [patientId]: response }));
    } catch {
      setNotice('The assistant could not be reached. Your checklist is still available. Try checking again.');
    } finally {
      setBusy(false);
    }
  };

  const go = (id: string) => {
    if (busy) return;
    setNotice('');
    if (id === 'draft') { void run(); return; }
    if (id === 'agenda' && patient?.missing_count && (!review || requested !== review.reminders.length)) {
      setNotice('Review and approve the reminder drafts first, or use the patient’s agenda controls below without sending requests.');
      setStep('draft');
      return;
    }
    if (id === 'done' && !agenda[patientId]) {
      setNotice('Choose “Keep on agenda” or “Postpone” for this patient first.');
      setStep('agenda');
      return;
    }
    setStep(id);
  };

  const updateReminder = (id: string, changes: Partial<Reminder>) => {
    setReviews((previous) => ({
      ...previous,
      [patientId]: { ...previous[patientId], reminders: previous[patientId].reminders.map((r) => r.id === id ? { ...r, ...changes } : r) },
    }));
  };

  return (
    <div className="tb68" data-theme={theme}>
      <a className="tb68-skip" href="#tb68-work" onClick={(event) => {
        event.preventDefault();
        const worklist = document.getElementById('tb68-work');
        worklist?.focus();
        worklist?.scrollIntoView();
      }}>Skip to board worklist</a>
      <header className="tb68-top">
        <div><strong>Colorectal tumour board</strong><span>Coordinator workstation · Munich · simulated records</span></div>
        <div className="tb68-themes" aria-label="Workspace theme">
          {(['light', 'dark'] as const).map((value) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}
        </div>
      </header>
      <div className="tb68-disclaimer">Hackathon prototype – synthetic data – not for clinical use · No reminders leave this demo.</div>
      <HospitalShell
        module="Tumour board preparation"
        nav={[{ id: 'list', label: 'Board worklist', badge: 5 }, { id: 'inspect', label: 'Result evidence' }, { id: 'draft', label: 'Assistant & reminders' }, { id: 'agenda', label: 'Agenda decisions' }]}
        active={step}
        onNav={go}
        guide={<StoryGuide steps={story} current={step} onGo={go} nextLabel={step === 'inspect' ? (busy ? 'Checking sources…' : 'Check sources & draft requests') : step === 'draft' ? 'Review agenda' : undefined} />}
        toolbar={<><strong>{board?.label ?? 'Loading next week’s board…'}</strong><span className="hx-spacer" /><span>Snapshot: {board?.snapshot_date ?? '—'} · fixed demo week</span>
          {patient && <button className="hx-btn primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? <><span className="hx-spinner" aria-hidden /> Checking sources…</> : `Review ${patient.name}`}</button>}
        </>}
      >
        {notice && <div className="tb68-attention" role="status">{notice}</div>}
        {!board && (loadError ? <Panel title="Board unavailable">Could not load the synthetic list. Reload this page to try again.</Panel> : <Working label="Loading synthetic board" />)}
        {board && patient && <>
          <section id="tb68-work" tabIndex={-1}>
            <div className="tb68-heading">
              <div><span className="tb68-eyebrow">Next week · colorectal cancer</span><h1>Is the patient ready?</h1></div>
              <div className="tb68-counts"><strong>{ready} / {board.patients.length}</strong> checklists complete <span>· {board.patients.length - ready} need results</span></div>
            </div>
            <div className="tb68-attention">✓ Available · ✗ Missing or outdated · “Requested – awaiting” never counts as available. Requirements and time windows are illustrative, not clinical guidance.</div>
            {(step === 'list' || step === 'done') && <Panel title="Patients for discussion" actions={
              <label>Show <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All patients</option><option value="gaps">Needs results</option><option value="ready">Checklist complete</option>
              </select></label>
            }>
              <div className="tb68-table-scroll">
                <table className="hx-table">
                  <caption>Readiness ranked by gaps first · select a patient to inspect the record</caption>
                  <thead><tr><th scope="col">Patient / board question</th>{board.patients[0].results.map((r) => <th scope="col" key={r.id}>{r.label}</th>)}<th scope="col">Follow-up / agenda</th></tr></thead>
                  <tbody>{[...board.patients].sort((a, b) => b.missing_count - a.missing_count || a.time.localeCompare(b.time))
                    .filter((p) => filter === 'all' || (filter === 'gaps' ? p.missing_count > 0 : p.missing_count === 0))
                    .map((p) => <tr key={p.id} className={p.id === patientId ? 'selected' : ''}>
                      <td><button type="button" className="tb68-patient" disabled={busy} aria-pressed={p.id === patientId} onClick={() => select(p.id)}>{p.time} · {p.name}</button><small>{p.id} · {p.diagnosis}</small><small>{p.question}</small></td>
                      {p.results.map((r) => <td key={r.id}><span className={r.state === 'available' ? 'tb68-ok' : 'tb68-gap'}>{r.state === 'available' ? '✓ Available' : r.state === 'outdated' ? '✗ Outdated' : '✗ Missing'}</span></td>)}
                      <td><Pill tone={p.missing_count ? 'warn' : 'ok'}>{p.missing_count ? `${p.missing_count} gaps` : 'Checklist complete'}</Pill>
                        {reviews[p.id]?.reminders.some((r) => r.approved) && <small>Requested – awaiting ({reviews[p.id].reminders.filter((r) => r.approved).length})</small>}
                        <small>{agenda[p.id] ?? 'Agenda: not yet reviewed'}</small></td>
                    </tr>)}</tbody>
                </table>
              </div>
            </Panel>}
          </section>
          <div className="tb68-detail">
            <Panel title={`${patient.name} · ${patient.id}`} actions={<Pill tone={patient.missing_count ? 'warn' : 'ok'}>{patient.missing_count ? `${patient.missing_count} results need attention` : 'Checklist complete'}</Pill>}>
              <p className="tb68-context">{patient.age} y · {patient.sex} · {patient.diagnosis}<br /><strong>Board question:</strong> {patient.question}</p>
              {patient.results.map((r) => <details key={r.id} open={r.state !== 'available'}>
                <summary><span className={r.state === 'available' ? 'tb68-ok' : 'tb68-gap'}>{r.state === 'available' ? '✓' : '✗'} {r.label} · {r.state}</span> <span>{r.date ?? 'No signed result'}</span></summary>
                <p>{r.detail}</p><dl><dt>Looked in</dt><dd>{r.source} · {r.source_path}</dd><dt>Why required</dt><dd>{r.why}</dd><dt>Demo rule</dt><dd>{r.rule}</dd><dt>Ask</dt><dd>{r.recipient}</dd></dl>
              </details>)}
              <div className="tb68-actions"><button className="hx-btn primary" type="button" disabled={busy} onClick={() => void run()}>{busy ? <><span className="hx-spinner" aria-hidden /> Checking sources…</> : review ? 'Open reminder review' : 'Check sources & draft requests'}</button></div>
            </Panel>
            <Panel title={step === 'done' ? 'Board preparation recorded' : 'Coordinator review'}>
              {busy && <Backstage stages={stages} running holdLast release={false} note="Source-check animation is illustrative. Copilot SDK review may take up to a minute; no hospital systems are connected." />}
              {!busy && !review && <p>The assistant will explain the gaps and propose who to ask. No treatment advice, no automatic agenda decisions.</p>}
              {!busy && review && <div aria-live="polite">
                <Pill tone={review.assessment.mode === 'copilot' ? 'ok' : 'neutral'}>{review.assessment.mode === 'copilot' ? 'Copilot SDK review' : 'Demo fallback · no live AI'}</Pill>
                {review.assessment.note && <p className="tb68-muted">{review.assessment.note}</p>}
                <details><summary>Assistant’s source review</summary>{review.assessment.blocks.filter((b) => b.type !== 'actions').map((block, i) => <RenderBlock key={i} block={block} />)}</details>
                {review.reminders.length === 0 && <p>All four results are recorded within this demo checklist. The coordinator still decides whether to discuss the case.</p>}
                {review.reminders.map((r) => <section className="tb68-reminder" key={r.id}>
                  <h2>{r.label} → {r.recipient}</h2>
                  <label htmlFor={`reminder-${r.id}`}>Reminder draft · editable before approval</label>
                  <textarea id={`reminder-${r.id}`} rows={4} value={r.message} disabled={r.approved} onChange={(e) => updateReminder(r.id, { message: e.target.value })} />
                  {r.approved ? <p className="tb68-receipt" role="status">✓ Approved to {r.recipient} · Requested – awaiting · simulated only, not sent</p> :
                    <button className="hx-btn primary" type="button" disabled={!r.message.trim()} onClick={() => updateReminder(r.id, { approved: true })}>Approve simulated request to {r.recipient}</button>}
                </section>)}
              </div>}
              <section className="tb68-agenda">
                <h2>Your agenda decision</h2>
                <p>Results remain {patient.missing_count ? 'incomplete' : 'complete'} regardless of requests. Discuss or postpone based on your judgment; treatment is not decided here.</p>
                <div className="tb68-actions">{(['Keep on agenda', 'Postpone'] as Agenda[]).map((decision) =>
                  <button key={decision} className="hx-btn" type="button" disabled={busy} aria-pressed={agenda[patientId] === decision} onClick={() => { setAgenda((previous) => ({ ...previous, [patientId]: decision })); setNotice(''); setStep('done'); }}>{decision}</button>)}</div>
                {agenda[patientId] && <div className="tb68-receipt" role="status"><strong>{patient.name}: {agenda[patientId]}</strong><br />Coordinator decision saved for this session · {requested} approved requests awaiting results. Reload resets the demo.</div>}
                {step === 'done' && <p>{Object.keys(agenda).length} / {board.patients.length} agenda decisions reviewed. Select another patient to prepare their case.</p>}
              </section>
            </Panel>
          </div>
        </>}
      </HospitalShell>
    </div>
  );
}
