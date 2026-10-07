import { useEffect, useRef, useState, type ReactNode } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, Working } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import { EnrollmentMatch, type Inspection } from './EnrollmentMatch';
import { SourceReference, TrialCentres } from './SourceReference';
import './trial-matching.css';

export const meta: IdeaMeta = {
  id: '78', issue: 78,
  title: 'Trials for this patient',
  tagline: 'Compare potential trials, inspect the evidence, and prepare a clinician-approved screening enquiry.',
};

type Horizon = 'future' | 'six-month';
export type Criterion = {
  id: string; kind: string; text: string; status: 'Match' | 'Conflict' | 'Unknown';
  evidence: string; source: string; protocol_source: string; patient_label: string; patient_value: string;
};
export type Trial = {
  id: string; title: string; site: string; phase: string; status: string;
  registry_id: string; centres: { name: string; city: string; distance_km: number; nearest: boolean }[];
  site_contact: { name: string; email: string }; handoff_email: EmailDraft;
  description: string; assessment: string; criteria: Criterion[];
  counts: { Match: number; Conflict: number; Unknown: number };
  treatment: string; design: string; arms: string[]; practical_meaning: string;
  evidence_track?: { phase: string; population: string; sample_size: number | null; result: string; limitation: string; source: string }[];
  patient_pack?: string; enquiry_note: string; proposed_orders: string[]; priority_reason: string;
};
export type Context = {
  patient: { id: string; name: string; age: number; sex: string; diagnosis: string; allergies: string };
  snapshot_date: string; notice: string; horizon: Horizon; excluded_count: number;
  data_principles: string;
  facts: Record<string, { label: string; display: string; source: string }>;
  trials: Trial[]; excluded_trials: Trial[];
  coverage: { name: string; group: string; likely_source: string; status: string }[];
};
type Review = AgentResult & { enquiry_notes?: Record<string, string> };
type EmailDraft = { to: string; subject: string; body: string; reference: string; channel: 'email'; simulation: boolean };
type Handoff = EmailDraft & { mode: string; note: string };
type Receipt = { kind: 'screening' | 'patient'; trial: string; note: string; orders: string[]; gaps: string[]; time: string };
type Phase = 'eligibility' | 'screening' | 'start';

function MatchingTable({ trial }: { trial: Trial }) {
  return <div className="tm78-table"><table className="hx-table tm78-matching">
    <caption>{trial.title} · synthetic criteria, not a complete eligibility assessment</caption>
    <thead><tr><th scope="col">Patient</th><th scope="col">Trial criterion</th><th scope="col">Status</th></tr></thead>
    <tbody>{[...trial.criteria].sort((a, b) => Number(b.status === 'Unknown') - Number(a.status === 'Unknown')).map((criterion) => <tr key={criterion.id} className={criterion.status === 'Unknown' ? 'tm78-unknown-row' : ''}>
      <td><strong>{criterion.patient_label || 'Recorded evidence'}</strong><br />{criterion.patient_value || criterion.evidence}<SourceReference source={criterion.source} /></td>
      <td>{criterion.text}<details><summary>Evidence & provenance</summary>
        <dl><dt>Patient evidence</dt><dd>{criterion.evidence}</dd><dt>Record source</dt><dd>{criterion.source}</dd></dl>
      </details><SourceReference source={criterion.protocol_source} /></td>
      <td><Pill tone={criterion.status === 'Match' ? 'ok' : criterion.status === 'Conflict' ? 'crit' : 'warn'}>
        {criterion.status === 'Unknown' ? 'Missing information' : criterion.status === 'Conflict' ? 'No match' : 'Match'}
      </Pill></td>
    </tr>)}</tbody>
  </table></div>;
}

function PhaseInspector({ trial, children }: { trial: Trial; children?: ReactNode }) {
  return <aside className="tm78-inspector tm78-phase-inspector" aria-label="Selected trial context and safeguards">
    <span className="tm78-eyebrow">Inspectable by design · selected protocol</span>
    <h2>{trial.title}</h2>
    <div className="tm78-section-meta"><span>Phase {trial.phase}</span><span>{trial.status}</span></div>
    <TrialCentres trial={trial} />
    <div className="tm78-counts"><Pill tone="ok">{trial.counts.Match} met</Pill>
      <Pill tone="warn">{trial.counts.Unknown} unknown</Pill></div>
    <h3>Evidence still required</h3>
    {trial.criteria.filter((criterion) => criterion.status !== 'Match').map((criterion) =>
      <div className="tm78-criterion" key={criterion.id}><strong className="tm78-status-Unknown">
        {criterion.patient_label || criterion.text} · {criterion.status === 'Unknown' ? 'Unknown' : 'Conflict'}</strong>
        <p>{criterion.text}</p><SourceReference source={criterion.protocol_source} /></div>)}
    {children}
    <div className="tm78-inspector-gate"><span className="tm78-eyebrow">Human control · assessment only</span>
      <strong>Eligibility and enrolment remain unconfirmed</strong>
      <p>Missing evidence never becomes met through a request or acknowledgement. Patient agreement and trial-team validation remain required.</p>
      <small>Only a minimum pseudonymised email may be approved. Hospital records are not shared.</small></div>
  </aside>;
}

const stages = [
  { label: 'Read synthetic patient evidence', detail: 'Review the record available in this horizon' },
  { label: 'Compare selected fictional protocols', detail: 'Separate supported criteria from gaps; no eligibility decision' },
  { label: 'Draft enquiries for human review', detail: 'Copilot SDK when configured; nothing sent or ordered' },
];

export default function TrialMatching() {
  const [presentation, setPresentation] = useState<'current' | 'enrollment'>(() => {
    try { return localStorage.getItem('tm78-presentation') === 'current' ? 'current' : 'enrollment'; }
    catch { return 'enrollment'; }
  });
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [hiddenTrials, setHiddenTrials] = useState<string[]>([]);
  const [missingOnly, setMissingOnly] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [context, setContext] = useState<Context | null>(null);
  const [candidate, setCandidate] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const [result, setResult] = useState<Review | null>(null);
  const [notes, setNotes] = useState('');
  const [orders, setOrders] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<'screening' | 'patient' | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [phase, setPhase] = useState<Phase>('eligibility');
  const [screeningOpened, setScreeningOpened] = useState(false);
  const [screeningApproved, setScreeningApproved] = useState(false);
  const [patientAgreement, setPatientAgreement] = useState(false);
  const [teamValidation, setTeamValidation] = useState(false);
  const [missingExpanded, setMissingExpanded] = useState(true);
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [email, setEmail] = useState<EmailDraft | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [handoffResult, setHandoffResult] = useState<Handoff | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const handoffRun = useRef(0);
  const handoffController = useRef<AbortController | null>(null);
  const handoffTimer = useRef<number | undefined>(undefined);
  const reviewRun = useRef(0);
  const reviewController = useRef<AbortController | null>(null);
  const reviewTimer = useRef<number | undefined>(undefined);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const missingPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem('tm78-presentation', presentation); }
    catch { /* The presentation switch also works when storage is unavailable. */ }
  }, [presentation]);

  function cancelReview() {
    reviewRun.current += 1;
    reviewController.current?.abort();
    reviewController.current = null;
    window.clearTimeout(reviewTimer.current);
    setBusy(false);
  }

  function resetReview() {
    invalidateApproval();
    setResult(null); setConfirmation(null); setReceipt(null); setError(''); setMessage('');
    setScreeningApproved(false); setPatientAgreement(false); setTeamValidation(false);
  }

  function cancelHandoff() {
    handoffRun.current += 1;
    handoffController.current?.abort();
    window.clearTimeout(handoffTimer.current);
    handoffController.current = null;
    setHandoffBusy(false);
  }

  async function draftHandoff() {
    if (!chosen) return;
    cancelHandoff();
    const run = handoffRun.current;
    const controller = new AbortController();
    handoffController.current = controller;
    setHandoffBusy(true); setHandoffResult(null); setError('');
    handoffTimer.current = window.setTimeout(() => {
      if (run !== handoffRun.current) return;
      cancelHandoff();
      setError('Email drafting timed out after 60 seconds. Your editable demonstration draft is preserved.');
    }, 60000);
    try {
      const draft = await request<Handoff>('/api/ideas/78/handoff', {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ horizon, trial_id: chosen.id }),
      });
      if (run === handoffRun.current && !controller.signal.aborted) setHandoffResult(draft);
    } catch (err) {
      if (run === handoffRun.current && !controller.signal.aborted) setError(`Email assistant unavailable; use the preserved demo draft. ${err instanceof Error ? err.message : ''}`);
    } finally {
      if (run === handoffRun.current) {
        window.clearTimeout(handoffTimer.current);
        handoffController.current = null; setHandoffBusy(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setContext(null);
    setError('');
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    request<Context>(`/api/ideas/78/context?horizon=${horizon}`, { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        setContext(data);
        const first = data.trials.find((trial) => trial.title === 'PATHWAY-CRC') ?? data.trials[0];
        setCandidate(first?.id ?? '');
        setCompare(data.trials.slice(0, 2).map((trial) => trial.id));
        setNotes(first?.enquiry_note ?? '');
        setOrders(first?.proposed_orders ?? []);
        setEmail(first?.handoff_email ?? null);
      })
      .catch((err: unknown) => {
        if (active) setError(timedOut ? 'Catalogue load timed out. Please retry.' :
          `Could not load the synthetic catalogue: ${err instanceof Error ? err.message : 'connection unavailable'}`);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
      reviewRun.current += 1;
      reviewController.current?.abort();
      window.clearTimeout(reviewTimer.current);
      handoffRun.current += 1;
      handoffController.current?.abort();
      window.clearTimeout(handoffTimer.current);
    };
  }, [horizon, retry]);

  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus();
      confirmationRef.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [confirmation]);

  useEffect(() => {
    if (!missingPanelRef.current) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    missingPanelRef.current.focus({ preventScroll: true });
  }, [phase]);

  const chosen = context?.trials.find((trial) => trial.id === candidate);
  const compared = context?.trials.filter((trial) => compare.includes(trial.id)) ?? [];
  const gaps = chosen?.criteria.filter((criterion) => criterion.status !== 'Match') ?? [];

  function choose(id: string) {
    resetReview();
    setPhase('eligibility'); setScreeningOpened(false);
    setCandidate(id);
    const trial = context?.trials.find((item) => item.id === id);
    setNotes(trial?.enquiry_note ?? '');
    setOrders(trial?.proposed_orders ?? []);
    setEmail(trial?.handoff_email ?? null);
  }

  function toggleComparison(id: string) {
    cancelReview(); setResult(null);
    setCompare((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id].slice(0, 4));
  }

  function openScreening() {
    if (!chosen) return;
    setScreeningOpened(true); setPhase('screening'); setConfirmation(null);
  }

  function invalidateApproval() {
    cancelReview(); setReceipt(null); setConfirmation(null); setScreeningApproved(false);
    setPatientAgreement(false); setTeamValidation(false);
    cancelHandoff(); setHandoffOpen(false); setEmailSent(false); setHandoffResult(null);
  }

  async function refresh() {
    cancelReview();
    const run = reviewRun.current;
    const controller = new AbortController();
    reviewController.current = controller;
    setBusy(true); setResult(null); setError(''); setMessage(''); setConfirmation(null); setReceipt(null);
    let timedOut = false;
    reviewTimer.current = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (reviewRun.current === run) {
        reviewRun.current += 1;
        reviewController.current = null;
        setBusy(false);
        setError('Assistant review timed out after 60 seconds. Demo drafts and criterion evidence remain available.');
      }
    }, 60000);
    try {
      const review = await request<Review>('/api/ideas/78/review', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ horizon, trial_ids: compare }),
      });
      if (reviewRun.current !== run || controller.signal.aborted) return;
      setResult(review);
    } catch (err) {
      if (reviewRun.current === run && !controller.signal.aborted) {
        setError(`Assistant unavailable. Use the demo drafts and inspect the criteria. ${err instanceof Error ? err.message : ''}`);
      }
    } finally {
      if (reviewRun.current === run && !timedOut) {
        window.clearTimeout(reviewTimer.current);
        reviewController.current = null;
        setBusy(false);
      }
    }
  }

  function approve() {
    if (!chosen || !confirmation) return;
    setReceipt({
      kind: confirmation, trial: chosen.title,
      note: confirmation === 'screening' ? notes : chosen.patient_pack ?? 'No patient pack supplied.',
      orders: confirmation === 'screening' ? [...orders] : [],
      gaps: gaps.map((criterion) => `${criterion.text} — ${criterion.evidence}`),
      time: new Date().toLocaleTimeString(),
    });
    if (confirmation === 'screening') { setScreeningApproved(true); setPhase('start'); }
    setConfirmation(null);
  }

  const proposedChecks = chosen && <section className="tm78-proposed-checks" aria-label="Proposed order checklist">
    <h3>Proposed order checklist · draft only</h3>
    <p className="tm78-muted">Select or dismiss checks for the local draft. These are not orders and do not establish eligibility.</p>
    <SourceReference source={`${chosen.registry_id} · illustrative proposed checks derived from unresolved synthetic protocol criteria`} />
    {chosen.proposed_orders?.map((order) => <label key={order} className="tm78-choice">
      <input type="checkbox" checked={orders.includes(order)} onChange={() => {
        invalidateApproval();
        setOrders((items) => items.includes(order) ? items.filter((item) => item !== order) : [...items, order]);
      }} />{order}</label>)}
  </section>;

  return (
    <div className="tm78" data-theme={theme} data-presentation={presentation}>
      <a className="tm78-skip" href="#tm78-main">Skip to trial matching</a>
      <div className="tm78-controls">
        <span>Hackathon prototype – synthetic data – not for clinical use</span>
        <div role="group" aria-label="Interface presentation">
          <button aria-pressed={presentation === 'current'} onClick={() => setPresentation('current')}>Current UI</button>
          <button aria-pressed={presentation === 'enrollment'} onClick={() => setPresentation('enrollment')}>Enrollment Match</button>
        </div>
        <div role="group" aria-label="Time horizon">
          {(['six-month', 'future'] as const).map((value) => <button key={value} aria-pressed={horizon === value}
            onClick={() => { if (horizon !== value) { resetReview(); setPhase('eligibility'); setScreeningOpened(false); setContext(null); setHorizon(value); } }}>
            {value === 'future' ? 'The future' : 'In six months'}</button>)}
        </div>
        <div role="group" aria-label="Theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <HospitalShell module="Patient trial matching" nav={[]} active="" onNav={() => {}}>
        <div id="tm78-main" tabIndex={-1} className="tm78-heading">
          <div><div className="tm78-eyebrow">Trial office · synthetic consultation</div><h1>Trials for this patient</h1></div>
          <small>{horizon === 'future' ? 'Local + simulated partner catalogue' : 'Local catalogue · minimal dataset'}</small>
        </div>
        <ol className="tm78-guide" aria-label="Three-phase trial journey">
          <li aria-current={phase === 'eligibility' ? 'step' : undefined}>
            <button className="hx-btn" aria-pressed={phase === 'eligibility'} onClick={() => { setPhase('eligibility'); setConfirmation(null); }}>
              <strong>1 · Eligibility</strong><span>Can this patient join?</span></button></li>
          <li aria-current={phase === 'screening' ? 'step' : undefined}>
            <button className="hx-btn" aria-pressed={phase === 'screening'} disabled={!screeningOpened || !chosen}
              onClick={() => { setPhase('screening'); setConfirmation(null); }}><strong>2 · Screening / preparation</strong><span>Request missing information</span></button></li>
          <li aria-current={phase === 'start' ? 'step' : undefined}>
            <button className="hx-btn" aria-pressed={phase === 'start'} disabled={!screeningApproved || !chosen}
              onClick={() => { setPhase('start'); setConfirmation(null); }}><strong>3 · Start trial</strong><span>Agreement + trial-team validation required</span></button></li>
        </ol>
        {error && <div role="alert" className="tm78-attention">{error}
          {!context && <button className="hx-btn" onClick={() => { resetReview(); setRetry((value) => value + 1); }}>Retry catalogue</button>}</div>}
        {!context && !error && <Working label="Loading synthetic patient and trial catalogue" />}
        {context && <>
         {presentation === 'enrollment' && <section className="tm78-context-banner" aria-label="Synthetic patient context">
           <div><span className="tm78-eyebrow">Synthetic patient · colorectal MDT</span>
             <h2>{context.patient.name}</h2><small>{context.patient.id} · {context.patient.age} years · {context.patient.sex}</small></div>
           <div><span className="tm78-eyebrow">Diagnosis</span><strong>{context.patient.diagnosis}</strong></div>
           <div><span className="tm78-eyebrow">Molecular profile</span><strong>{context.facts.ras?.display} · {context.facts.msi?.display}</strong></div>
           <div><span className="tm78-eyebrow">Performance status</span><strong>{context.facts.ecog?.display ?? 'Not recorded'}</strong></div>
           <button className="hx-btn" onClick={() => {
             const record = document.getElementById('tm78-record') as HTMLDetailsElement | null;
             if (record) {
               record.open = true;
               record.querySelector('summary')?.focus();
               record.scrollIntoView({ block: 'center', behavior: 'instant' });
             }
           }}>Full chart & sources ↓</button>
         </section>}
         <section className="tm78-attention tm78-missing" aria-label="Missing information" ref={missingPanelRef} tabIndex={-1}>
           <div className="tm78-section-meta"><strong>Missing information · {chosen?.title ?? 'No screening candidate'} · eligibility not confirmed</strong>
             <button className="hx-btn" aria-expanded={missingExpanded} onClick={() => setMissingExpanded(!missingExpanded)}>
               {missingExpanded ? 'Collapse missing information' : 'Expand missing information'}</button></div>
           {missingExpanded && <><div className="tm78-gaps">{gaps.map((criterion) =>
             <span key={criterion.id}><strong>{criterion.patient_label || criterion.text}</strong> — {criterion.status === 'Unknown' ? 'missing' : 'known conflict'}</span>)}
             {!gaps.length && <span>Full protocol review still required; supported checks are not eligibility confirmation.</span>}</div>
             <small>Missing renal evidence does not block an email requesting assessment. It still blocks eligibility and enrolment; no override is available.</small></>}
         </section>
         <p className="tm78-data-principles">{context.data_principles || 'Patient data stays in the hospital by default. Only minimum pseudonymised referral information may be shared after clinician approval.'}</p>
         <div className={`tm78-grid tm78-phase-${phase}`}>
          <aside className="tm78-patient">
            <Panel title="Patient context">
              <div className="tm78-eyebrow">Synthetic patient</div>
              <h2 className="tm78-identity">{context.patient.name}</h2>
              <p className="tm78-demographics">{context.patient.id} · {context.patient.age} years · {context.patient.sex}</p>
              <p><strong>{context.patient.diagnosis}</strong></p>
              <details id="tm78-record"><summary>Full chart & record sources</summary>
              <small>Allergies: {context.patient.allergies}</small>
              <small>Simulated EHR launch · not connected</small>
              <dl className="hx-facts">{Object.entries(context.facts).map(([key, fact]) =>
                <div key={key} className="tm78-fact"><dt>{fact.label}</dt><dd><strong>{fact.display}</strong>
                  <SourceReference source={fact.source} /></dd></div>)}</dl>
              <small>Synthetic snapshot: {context.snapshot_date}. Report text only, not image analysis.</small>
              </details>
            </Panel>
            <details className="tm78-coverage">
              <summary>What works in six months · dataset coverage</summary>
              <p>{context.coverage.filter((item) => item.status === 'Available').length} of {context.coverage.length} mapped elements available in this
                synthetic snapshot. Likely sources are hackathon assumptions, not measured readiness.</p>
              <div className="tm78-table"><table className="hx-table"><caption>Minimal colorectal tumour-board dataset</caption>
                <thead><tr><th>Element</th><th>Likely source</th><th>Coverage</th></tr></thead>
                <tbody>{context.coverage.map((item) => <tr key={item.name}><td>{item.group} / {item.name}</td>
                  <td>{item.likely_source}</td><td>{item.status}</td></tr>)}</tbody>
              </table></div>
              <h3>What each hospital must do</h3>
              <ul><li>Map demographics, pathology, treatments and dated laboratory values with units.</li>
                <li>Structure molecular and CT reports; record performance status and medical history.</li>
                <li>Maintain the local catalogue and assign a clinician to approve screening enquiries.</li></ul>
              <div className="tm78-unavailable" aria-disabled="true">Live partner-site matching needs the future platform; unavailable in six months.</div>
              <div className="tm78-unavailable" aria-disabled="true">Hospital write-back is not connected. Both horizons keep drafts here only.</div>
            </details>
          </aside>
          <div className="tm78-workspace">
            {message && <p role="status" className="tm78-attention">{message}</p>}
            {phase === 'eligibility' && presentation === 'enrollment' && <EnrollmentMatch
              context={context} chosen={chosen} compare={compare} choose={choose} toggleComparison={toggleComparison}
              openScreening={openScreening} inspection={inspection} setInspection={setInspection}
              hiddenTrials={hiddenTrials} setHiddenTrials={setHiddenTrials}
              missingOnly={missingOnly} setMissingOnly={setMissingOnly}
              secondaryExpanded={secondaryExpanded} setSecondaryExpanded={setSecondaryExpanded} />}
            {phase === 'eligibility' && presentation === 'current' && <Panel title={chosen?.title === 'PATHWAY-CRC'
              ? 'Best screening candidate · local first' : 'Selected screening candidate'}>
              {chosen ? <>
                <div className="tm78-candidate-header"><h2>{chosen.title}</h2><Pill tone={gaps.length ? 'warn' : 'ok'}>
                  {gaps.length ? 'Partial match' : 'Supported criteria'}</Pill></div>
                <div className="tm78-section-meta"><span>{chosen.site}</span><span>Phase {chosen.phase} · {chosen.status}</span></div>
                <TrialCentres trial={chosen} />
                <div className="tm78-counts"><Pill tone="ok">{chosen.counts.Match} supported</Pill>
                  <Pill tone="warn">{chosen.counts.Unknown} missing information</Pill>
                  {!!chosen.counts.Conflict && <Pill tone="crit">{chosen.counts.Conflict} no match</Pill>}</div>
                <div className="tm78-attention"><strong>Can this patient join? Not confirmed.</strong>
                  <div className="tm78-gaps">{gaps.map((criterion) => <span key={criterion.id}>
                    {criterion.patient_label || criterion.text}: {criterion.status === 'Conflict' ? 'known conflict' : 'missing information'}
                  </span>)}</div>
                  {!gaps.length && <small>Supported checks alone do not establish full protocol eligibility.</small>}
                </div>
                <dl className="tm78-regimen">
                  <dt>Study treatment</dt><dd>{chosen.treatment || 'Fictional demo regimen · protocol details pending'}</dd>
                  <dt>Design</dt><dd>{chosen.design || 'Fictional protocol · design details pending'}</dd>
                  <dt>Arms</dt><dd>{chosen.arms?.join(' / ') || 'Not supplied'}</dd>
                  <dt>For this patient</dt><dd>{chosen.practical_meaning || 'Screening enquiry only; trial team must verify the protocol.'}</dd>
                </dl>
                <small>All treatment and regimen names are fictional demo names · not clinical advice.</small>
                <SourceReference source={`${chosen.registry_id} · synthetic protocol treatment, design, arms and practical meaning`} />
                <details><summary>Why this screening priority · not predicted benefit</summary><small>{chosen.priority_reason}</small></details>
                {phase === 'eligibility' && <div className="tm78-actions">
                  <button className="hx-btn primary" onClick={openScreening}>Approve screening preparation</button>
                </div>}
                <button className="hx-btn" aria-expanded={secondaryExpanded} onClick={() => setSecondaryExpanded(!secondaryExpanded)}>
                  {secondaryExpanded ? 'Hide 3 secondary sections' : '3 sections hidden — show'}</button>
                <details hidden={!secondaryExpanded} className="tm78-disclosure"><summary>Patient ↔ trial matching · criterion table</summary><MatchingTable trial={chosen} /></details>
                <details hidden={!secondaryExpanded} className="tm78-disclosure"><summary>Evidence, prior phases & sources</summary>
                  <small>Synthetic evidence only; no live literature search or personalised response prediction.</small>
                  {chosen.evidence_track?.length ? chosen.evidence_track.map((evidence, index) =>
                    <div className="tm78-evidence" key={index}><strong>Phase {evidence.phase}{evidence.phase === chosen.phase ? ' · current phase' : ' · prior phase'}</strong>
                      <dl><dt>Result</dt><dd>{evidence.result}</dd><dt>Population</dt><dd>{evidence.population} · {evidence.sample_size == null ? 'Size not supplied' : `n=${evidence.sample_size}`}</dd></dl>
                      <SourceReference source={evidence.source} />
                      <details><summary>Limitations & provenance</summary><dl><dt>Limitations</dt><dd>{evidence.limitation}</dd><dt>Source</dt><dd>{evidence.source}</dd></dl></details>
                    </div>) : <small>No evidence track supplied.</small>}
                </details>
              </> : <p>No candidate selected. No screening enquiry will be prepared.</p>}
            </Panel>}
            {phase === 'eligibility' && presentation === 'current' && <details hidden={!!chosen && !secondaryExpanded} className="tm78-coverage">
              <summary>Other candidates, comparison & excluded trials</summary>
              <small>Missing information retains a potential candidate; known conflicts exclude it. Compare up to four; choose one or none.</small>
              {context.trials.map((trial) => <article className={`tm78-trial ${candidate === trial.id ? 'selected' : ''}`} key={trial.id}>
                <h2>{trial.title}</h2><span>{trial.site} · phase {trial.phase}</span>
                <TrialCentres trial={trial} />
                <span>{trial.counts.Match} supported · {trial.counts.Unknown} missing information</span>
                <div className="tm78-actions"><label className="tm78-choice"><input type="radio" name="screening-candidate"
                  checked={candidate === trial.id} onChange={() => choose(trial.id)} />Choose for screening</label>
                  <label className="tm78-choice"><input type="checkbox" checked={compare.includes(trial.id)}
                    disabled={!compare.includes(trial.id) && compare.length >= 4} onChange={() => toggleComparison(trial.id)} />Compare</label></div>
                <details><summary>Matching table</summary><MatchingTable trial={trial} /></details>
              </article>)}
              <label className="tm78-choice tm78-none"><input type="radio" name="screening-candidate" checked={!candidate}
                onChange={() => choose('')} />None — do not pursue a screening enquiry</label>
              <details><summary>Compare selected trials · {compared.length} of 4</summary>
                {compared.length ? <div className="tm78-table"><table className="hx-table tm78-comparison">
                  <caption>Screening priority, not treatment recommendation or predicted benefit</caption>
                  <thead><tr><th scope="col">Compare</th>{compared.map((trial) => <th scope="col" key={trial.id}>{trial.title}</th>)}</tr></thead>
                  <tbody>
                    <tr><th scope="row">Treatment / design</th>{compared.map((trial) => <td key={trial.id}>{trial.treatment}<br />{trial.design}<br />{trial.arms?.join(' / ')}
                      <SourceReference source={`${trial.registry_id} · synthetic protocol treatment, design and arms`} /></td>)}</tr>
                    <tr><th scope="row">Practical meaning</th>{compared.map((trial) => <td key={trial.id}>{trial.practical_meaning}
                      <SourceReference source={`${trial.registry_id} · synthetic protocol practical summary`} /></td>)}</tr>
                    <tr><th scope="row">Screening evidence</th>{compared.map((trial) => <td key={trial.id}>{trial.counts.Match} supported · {trial.counts.Unknown} missing
                      <details><summary>Patient ↔ criterion table</summary><MatchingTable trial={trial} /></details></td>)}</tr>
                    <tr><th scope="row">Prior phases</th>{compared.map((trial) => <td key={trial.id}>
                      {trial.evidence_track?.filter((evidence) => evidence.phase !== trial.phase).map((evidence, index) =>
                        <details key={index}><summary>Phase {evidence.phase} · synthetic evidence</summary>
                          <dl><dt>Result</dt><dd>{evidence.result}</dd><dt>Population</dt><dd>{evidence.population} · n={evidence.sample_size ?? 'unknown'}</dd>
                            <dt>Limitations</dt><dd>{evidence.limitation}</dd><dt>Source</dt><dd>{evidence.source}</dd></dl>
                          <SourceReference source={evidence.source} />
                        </details>)}
                      <small>No completed current-phase outcomes; not a personalised prediction.</small>
                    </td>)}</tr>
                  </tbody>
                </table></div> : <small>Select a trial to compare.</small>}
              </details>
              <details><summary>Excluded trials · {context.excluded_count} known conflicts</summary>
                {context.excluded_trials?.map((trial) => <article className="tm78-trial" key={trial.id}>
                  <h3>{trial.title}</h3><Pill tone="crit">Excluded · cannot select</Pill>
                  <span>{trial.site} · phase {trial.phase}</span><span>{trial.treatment} · {trial.design}</span>
                  <TrialCentres trial={trial} />
                  <span>{trial.arms?.join(' / ')}</span><span>{trial.practical_meaning}</span>
                  <MatchingTable trial={trial} />
                </article>)}
                {!context.excluded_trials?.length && <small>No excluded protocol details supplied.</small>}
              </details>
            </details>}
            {phase === 'screening' && <section className="tm78-phase-workspace" aria-label="Screening preparation workspace">
              {presentation === 'enrollment' && <div className="tm78-match-toolbar"><div><span className="tm78-eyebrow">Patient ↔ protocol · preparation</span>
                <h2>Prepare the screening request</h2><small>Review the clinical note and proposed checks before explicit approval.</small></div>
                <Pill tone="warn">{chosen?.counts.Unknown ?? 0} unknown · assessment only</Pill></div>}
              <div className="tm78-phase-layout"><Panel title="Screening / preparation · clinician approval">
              <div className="tm78-section-meta"><span>Human approval retained for every request and patient pack.</span>
                <button className="hx-btn" disabled aria-describedby="tm78-auto">Auto-send: off</button></div>
              <small id="tm78-auto">Auto-send is disabled in this prototype. A clinician must explicitly approve; no external systems are connected.</small>
              {chosen ? <>
                <h2>Screening enquiry · {chosen.title}</h2>
                {presentation === 'current' && <TrialCentres trial={chosen} />}
                <div className="tm78-attention"><strong>{chosen.counts.Match} supported · {chosen.counts.Unknown} missing information · eligibility not confirmed</strong>
                  <div className="tm78-gaps">{gaps.map((criterion) => <span key={criterion.id}>{criterion.patient_label || criterion.text}</span>)}</div></div>
                <small>Editable synthetic draft · verify every statement. Optional assistant drafts require explicit application.</small>
                <label className="tm78-notes">Enquiry to the trial coordinator (synthetic only)
                  <textarea rows={6} value={notes} onChange={(event) => {
                    invalidateApproval(); setNotes(event.target.value);
                  }} /></label>
                <SourceReference source={`${chosen.registry_id} · synthetic clinical-note draft from the patient snapshot and protocol criteria; clinician edits unverified`} />
                <small>Missing information requests are drafts; requests do not resolve the gaps.</small>
                <details><summary>Inspect matching evidence & provenance</summary><MatchingTable trial={chosen} /></details>
                {presentation === 'current' && proposedChecks}
                <div className="tm78-actions">
                  <button className="hx-btn primary" disabled={!notes.trim()} onClick={() => {
                    cancelReview(); setReceipt(null); setConfirmation('screening');
                  }}>Review simulated screening request</button>
                  <button className="hx-btn" onClick={() => { choose(''); setMessage('Candidate dismissed locally. No screening request was created.'); }}>Dismiss candidate</button>
                </div>
              </> : <p>No candidate chosen. You can continue comparing without requesting screening.</p>}
              <div className="tm78-ai-controls">
                <button className="hx-btn" disabled={busy || !compare.length} onClick={refresh}>
                  {busy && <span className="hx-spinner" aria-hidden />}{busy ? 'Working…' : 'Copilot review (optional)'}</button>
                {busy && <button className="hx-btn" onClick={() => { cancelReview(); setMessage('AI refresh cancelled. Demo drafts remain available.'); }}>Cancel AI refresh</button>}
                <small>Copilot SDK · up to 60 seconds. Your edits are preserved until you explicitly apply a returned draft.</small>
              </div>
              {busy && <Backstage title="Preparing a clinician-review draft" stages={stages} running holdLast release={false}
                note="Activity stages are illustrative. Cancel at any time; no referrals, orders or messages are sent." />}
              {result && <details><summary>Inspect assistant review · {result.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
                <p>{result.note}</p><h3>{result.headline}</h3>
                <p>Unverified synthetic draft, not confirmation of eligibility. The source criteria remain inspectable above.</p>
                {result.blocks.map((block, index) => <div key={index}><RenderBlock block={block} />
                  <SourceReference source={`Issue 78 ${result.mode === 'copilot' ? 'Copilot SDK clinical-note draft' : 'deterministic clinical-note draft'} · synthetic patient evidence and fictional protocol criteria; clinician verification required`} /></div>)}
              </details>}
              {chosen && result?.enquiry_notes?.[chosen.id] && <button className="hx-btn" onClick={() => {
                invalidateApproval(); setNotes(result.enquiry_notes?.[chosen.id] ?? notes);
              }}>Apply assistant draft (replace enquiry)</button>}
              {confirmation && chosen && <div className="tm78-confirmation" ref={confirmationRef} tabIndex={-1}>
                <h2>{confirmation === 'screening' ? 'Approve a simulated screening request?' : 'Approve simulated patient sharing?'}</h2>
                <p>{chosen.title} · {confirmation === 'screening' ? 'Your edited enquiry and selected proposed checks will be recorded only in this page.' :
                  'The plain-language pack will be recorded only in this page. No patient receives a message.'}</p>
                <p><strong>{gaps.length} unresolved evidence gaps remain.</strong> This does not establish eligibility, enrol the patient, send a referral or place an order.</p>
                <div className="tm78-actions"><button className="hx-btn primary" onClick={approve}>
                  {confirmation === 'screening' ? 'Approve simulated screening request' : 'Approve simulated send to patient'}</button>
                  <button className="hx-btn" onClick={() => setConfirmation(null)}>Dismiss confirmation</button></div>
              </div>}
              {screeningApproved && <button className="hx-btn" onClick={() => { setPhase('start'); setConfirmation(null); }}>Review trial-start requirements →</button>}
            </Panel>
            {presentation === 'enrollment' && chosen && <PhaseInspector trial={chosen}>{proposedChecks}</PhaseInspector>}
            </div></section>}
            {phase === 'screening' && chosen && <details className="tm78-coverage"><summary>Patient information pack · simulated sharing</summary>
              <p className="tm78-preserve">{chosen.patient_pack}</p>
              <SourceReference source={`${chosen.registry_id} · synthetic patient information pack`} />
              <p className="tm78-muted">Synthetic information to discuss with your care team, not medical advice. This is not an offer of a place or a prediction of benefit.</p>
              <button className="hx-btn" onClick={() => {
                cancelReview(); setReceipt(null); setConfirmation('patient');
              }}>Send to patient</button>
              <small>Simulation only. Opens a separate clinician approval; no actual message is sent.</small>
            </details>}
            {phase === 'start' && chosen && <section className="tm78-phase-workspace" aria-label="Investigator hand-off workspace">
              {presentation === 'enrollment' && <div className="tm78-match-toolbar"><div><span className="tm78-eyebrow">Patient ↔ protocol · human hand-off</span>
                <h2>Principal investigator assessment</h2><small>Clinician acknowledgement unlocks only a minimum-information email draft.</small></div>
                <Pill tone="warn">Not enrolled · eligibility unresolved</Pill></div>}
              <div className="tm78-phase-layout"><Panel title="Start · request trial-site assessment">
              <h2>{chosen.title}</h2>
              {presentation === 'current' && <TrialCentres trial={chosen} />}
              <div className="tm78-attention"><strong>No actual trial start or enrolment is available.</strong>
                <small>{gaps.length} unresolved evidence gaps remain. Sending requests never changes criterion status.</small></div>
              <div className="tm78-start-gate">
                <button className="hx-btn" disabled aria-describedby="tm78-start-blocked">
                  {gaps.length ? 'Start trial — eligibility unresolved' : 'Start trial — not available'}</button>
                <small id="tm78-start-blocked">{gaps.length
                  ? `Blocked: ${gaps.length} unresolved evidence gaps. Current renal and other missing evidence must be supplied and validated by the trial team; acknowledgements cannot resolve Unknown criteria.`
                  : 'Full trial-team validation and documented patient agreement are required. This prototype never starts or enrols a patient.'}</small>
              </div>
              <p>Both documented patient agreement and the trial team's full eligibility validation are required before a real trial start.</p>
              <label className="tm78-choice"><input type="checkbox" checked={patientAgreement} onChange={(event) => {
                setPatientAgreement(event.target.checked); setReceipt(null); setHandoffOpen(false); setEmailSent(false); cancelHandoff();
              }} />I acknowledge patient agreement must be obtained and documented; it is not recorded here.</label>
              <label className="tm78-choice"><input type="checkbox" checked={teamValidation} onChange={(event) => {
                setTeamValidation(event.target.checked); setReceipt(null); setHandoffOpen(false); setEmailSent(false); cancelHandoff();
              }} />I acknowledge trial-team eligibility validation is required; the evidence gaps remain unresolved.</label>
              <button className="hx-btn primary" disabled={!screeningApproved || !patientAgreement || !teamValidation}
                onClick={() => setHandoffOpen(true)}>Start · prepare investigator hand-off</button>
              <small>These acknowledgements allow only a request for assessment, not eligibility approval or enrolment.</small>
              {handoffOpen && email && <section className="tm78-handoff" aria-label="Request participation from the principal investigator">
                <h2>Request participation from the principal investigator</h2>
                <p>Request assessment only · {chosen.site_contact?.name} · email simulation. Patient data remains in the hospital.</p>
                <small>Minimum referral information only: REF-078, diagnosis, relevant molecular/history and criterion gaps. Do not add names, demographics, hospital identifiers or raw record provenance.</small>
                <label className="tm78-notes">To (demonstration address only)<input readOnly value={email.to} /></label>
                <label className="tm78-notes">Email subject<input value={email.subject} onChange={(event) => { setEmail({ ...email, subject: event.target.value }); setEmailSent(false); }} /></label>
                <label className="tm78-notes">Pseudonymised email draft<textarea rows={9} value={email.body}
                  onChange={(event) => { setEmail({ ...email, body: event.target.value }); setEmailSent(false); }} /></label>
                <SourceReference source={`${chosen.registry_id} · synthetic minimum referral draft · REF-078`} />
                <div className="tm78-actions"><button className="hx-btn" disabled={handoffBusy} onClick={draftHandoff}>
                  {handoffBusy && <span className="hx-spinner" aria-hidden />}{handoffBusy ? 'Working… drafting email' : 'Copilot email draft (optional)'}</button>
                  {handoffBusy && <button className="hx-btn" onClick={cancelHandoff}>Cancel email drafting</button>}</div>
                {handoffBusy && <Working label="Preparing minimum referral email · up to 60 seconds; your edits are preserved" />}
                {handoffResult && <details open><summary>Inspect assistant email · {handoffResult.mode}</summary>
                  <p>{handoffResult.note}</p><strong>{handoffResult.subject}</strong><p className="tm78-preserve">{handoffResult.body}</p>
                  <SourceReference source={`${chosen.registry_id} · Copilot SDK / bounded demo email draft based on synthetic minimum referral information`} />
                  <button className="hx-btn" onClick={() => { setEmail(handoffResult); setEmailSent(false); }}>Apply assistant email (replace draft)</button>
                </details>}
                <p><strong>Approval simulates sending this email only.</strong> It does not enrol a patient, confirm eligibility or send any real message.</p>
                <button className="hx-btn primary" disabled={emailSent || !email.subject.trim() || !email.body.trim()} onClick={() => {
                  const text = `${email.subject} ${email.body}`.toLowerCase();
                  const forbidden = [context.patient.name, context.patient.id, ...context.patient.name.split(' ')]
                    .filter(Boolean).some((value) => text.includes(value.toLowerCase()));
                  if (forbidden || !email.to.endsWith('.invalid') || !email.body.includes('REF-078')) {
                    setError('Use REF-078 and the demo .invalid address only. Remove patient names and hospital identifiers before approving.'); return;
                  }
                  setError(''); setEmailSent(true);
                }}>Approve simulated email sending only</button>
                {emailSent && <div className="tm78-receipt" role="status"><strong>Email sending simulated · REF-078</strong>
                  <p>Your edited email was approved locally. Nothing actually sent; eligibility remains unresolved and no enrolment occurred.</p></div>}
              </section>}
              <p className="tm78-unavailable">Trial onboarding — handled by the trial site (out of scope)</p>
              <details><summary>Outstanding matching evidence</summary><MatchingTable trial={chosen} /></details>
            </Panel>
            {presentation === 'enrollment' && <PhaseInspector trial={chosen}>
              <div className="tm78-handoff-context"><span className="tm78-eyebrow">Trial-site hand-off · REF-078</span>
                <h3>Principal investigator</h3><p>{chosen.site_contact.name}</p><small>{chosen.site_contact.email} · demo address</small>
                <p>Request participation assessment only. The trial site handles onboarding outside this prototype.</p>
                <SourceReference source={`${chosen.registry_id} · illustrative trial-site contact and assessment pathway`} />
                <button className="hx-btn" onClick={() => { setPhase('screening'); setConfirmation(null); }}>Back to screening preparation</button></div>
            </PhaseInspector>}
            </div></section>}
            {receipt && phase !== 'eligibility' && <div className="tm78-receipt" role="status">
              <Pill tone="ok">Local simulation receipt · {receipt.time}</Pill>
              <h2>{receipt.kind === 'screening' ? 'Screening request recorded locally' : 'Patient pack sharing recorded locally'}</h2>
              <small>{receipt.trial} · clinician approved · session only</small>
              <details><summary>Inspect approved draft / receipt</summary><div className="tm78-preserve">{receipt.note}</div>
                {!!receipt.orders.length && <><strong>Proposed checks only</strong><ul>{receipt.orders.map((order) => <li key={order}>{order}</li>)}</ul></>}
              </details>
              <strong>{receipt.gaps.length} unresolved evidence gaps remain.</strong>
              <details><summary>Inspect outstanding information</summary><ul>{receipt.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details>
              <small>Nothing actually sent, ordered, enrolled or written to the EHR. Trial-team validation and patient agreement remain required.</small>
            </div>}
          </div>
        </div></>}
      </HospitalShell>
    </div>
  );
}
