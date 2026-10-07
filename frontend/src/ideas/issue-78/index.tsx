import { useEffect, useRef, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, Working } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './trial-matching.css';

export const meta: IdeaMeta = {
  id: '78', issue: 78,
  title: 'Trials for this patient',
  tagline: 'Compare potential trials, inspect the evidence, and prepare a clinician-approved screening enquiry.',
};

type Horizon = 'future' | 'six-month';
type Criterion = {
  id: string; kind: string; text: string; status: 'Match' | 'Conflict' | 'Unknown';
  evidence: string; source: string; protocol_source: string;
};
type Trial = {
  id: string; title: string; site: string; phase: string; status: string;
  description: string; assessment: string; criteria: Criterion[];
  counts: { Match: number; Conflict: number; Unknown: number };
  evidence_track: { phase: string; population: string; sample_size: number | null; result: string; limitation: string; source: string }[];
  patient_pack: string; enquiry_note: string; proposed_orders: string[]; priority_reason: string;
};
type Context = {
  patient: { id: string; name: string; age: number; sex: string; diagnosis: string; allergies: string };
  snapshot_date: string; notice: string; horizon: Horizon; excluded_count: number;
  facts: Record<string, { label: string; display: string; source: string }>;
  trials: Trial[];
  coverage: { name: string; group: string; likely_source: string; status: string }[];
};
type Review = AgentResult & { enquiry_notes?: Record<string, string> };
type Receipt = { kind: 'screening' | 'patient'; trial: string; note: string; orders: string[]; gaps: string[]; time: string };

const stages = [
  { label: 'Read synthetic patient evidence', detail: 'Review the record available in this horizon' },
  { label: 'Compare selected fictional protocols', detail: 'Separate supported criteria from gaps; no eligibility decision' },
  { label: 'Draft enquiries for human review', detail: 'Copilot SDK when configured; nothing sent or ordered' },
];

export default function TrialMatching() {
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
  const reviewRun = useRef(0);
  const reviewController = useRef<AbortController | null>(null);
  const reviewTimer = useRef<number | undefined>(undefined);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  function cancelReview() {
    reviewRun.current += 1;
    reviewController.current?.abort();
    reviewController.current = null;
    window.clearTimeout(reviewTimer.current);
    setBusy(false);
  }

  function resetReview() {
    cancelReview();
    setResult(null); setConfirmation(null); setReceipt(null); setError(''); setMessage('');
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
        setCandidate(data.trials[0]?.id ?? '');
        setCompare(data.trials.slice(0, 2).map((trial) => trial.id));
        setNotes(data.trials[0]?.enquiry_note ?? '');
        setOrders(data.trials[0]?.proposed_orders ?? []);
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
    };
  }, [horizon, retry]);

  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus();
      confirmationRef.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [confirmation]);

  const chosen = context?.trials.find((trial) => trial.id === candidate);
  const compared = context?.trials.filter((trial) => compare.includes(trial.id)) ?? [];
  const gaps = chosen?.criteria.filter((criterion) => criterion.status !== 'Match') ?? [];

  function choose(id: string) {
    resetReview();
    setCandidate(id);
    const trial = context?.trials.find((item) => item.id === id);
    setNotes(trial?.enquiry_note ?? '');
    setOrders(trial?.proposed_orders ?? []);
  }

  function toggleComparison(id: string) {
    resetReview();
    setCompare((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id].slice(0, 4));
    setNotes(chosen?.enquiry_note ?? '');
  }

  async function refresh() {
    cancelReview();
    const run = reviewRun.current;
    const controller = new AbortController();
    reviewController.current = controller;
    setBusy(true); setResult(null); setError(''); setMessage(''); setConfirmation(null); setReceipt(null);
    setNotes(chosen?.enquiry_note ?? '');
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
      if (chosen && review.enquiry_notes?.[chosen.id]) setNotes(review.enquiry_notes[chosen.id]);
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
      note: confirmation === 'screening' ? notes : chosen.patient_pack,
      orders: confirmation === 'screening' ? [...orders] : [],
      gaps: gaps.map((criterion) => `${criterion.text} — ${criterion.evidence}`),
      time: new Date().toLocaleTimeString(),
    });
    setConfirmation(null);
  }

  return (
    <div className="tm78" data-theme={theme}>
      <a className="tm78-skip" href="#tm78-main">Skip to trial matching</a>
      <div className="tm78-controls">
        <span>Hackathon prototype – synthetic data – not for clinical use</span>
        <div role="group" aria-label="Time horizon">
          {(['six-month', 'future'] as const).map((value) => <button key={value} aria-pressed={horizon === value}
            onClick={() => { if (horizon !== value) { resetReview(); setContext(null); setHorizon(value); } }}>
            {value === 'future' ? 'The future' : 'In six months'}</button>)}
        </div>
        <div role="group" aria-label="Theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <HospitalShell module="Patient trial matching" nav={[]} active="" onNav={() => {}}>
        <div id="tm78-main" tabIndex={-1} className="tm78-heading">
          <div><div className="tm78-eyebrow">Trial office · synthetic consultation</div><h1>Trials for this patient</h1>
            <p>Potential candidates only. The trial team must confirm the full protocol and screening evidence.</p></div>
          <div className="tm78-primary">
            <button className="hx-btn primary" disabled={!chosen} onClick={() => {
              cancelReview(); setReceipt(null); setConfirmation('screening');
            }}>
              Request enrolment</button>
            <small>Opens a local simulated screening request; not confirmed eligibility.</small>
          </div>
        </div>
        <ol className="tm78-guide" aria-label="Guided workflow">
          <li><strong>1 · Compare</strong><span>Inspect potential trials beside the patient record.</span></li>
          <li aria-current={confirmation ? 'step' : undefined}><strong>2 · Review</strong><span>Choose one or none; edit the enquiry and proposed checks.</span></li>
          <li aria-current={receipt ? 'step' : undefined}><strong>3 · Approve locally</strong><span>A simulated receipt, never a real referral or order.</span></li>
        </ol>
        <p className="tm78-attention">All patients, protocols, prior-phase results and subgroup responses are synthetic demo evidence.
          No live registry or literature search; no treatment recommendation.</p>
        {error && <div role="alert" className="tm78-attention">{error}
          {!context && <button className="hx-btn" onClick={() => { resetReview(); setRetry((value) => value + 1); }}>Retry catalogue</button>}</div>}
        {!context && !error && <Working label="Loading synthetic patient and trial catalogue" />}
        {context && <div className="tm78-grid">
          <aside className="tm78-patient">
            <Panel title="Patient context">
              <div className="tm78-eyebrow">Synthetic patient · inherited chart identity</div>
              <h2 className="tm78-identity">{context.patient.name}</h2>
              <p className="tm78-demographics">{context.patient.id} · {context.patient.age} years · {context.patient.sex}</p>
              <p><strong>{context.patient.diagnosis}</strong></p>
              <small>Allergies: {context.patient.allergies}</small>
              <p className="tm78-launch">Simulated EHR launch; identity inherited; SMART on FHIR future, not connected.</p>
              <dl className="hx-facts">{Object.entries(context.facts).map(([key, fact]) =>
                <div key={key} className="tm78-fact"><dt>{fact.label}</dt><dd><strong>{fact.display}</strong>
                  <details><summary>Record source</summary>{fact.source}</details></dd></div>)}</dl>
              <small>Synthetic snapshot: {context.snapshot_date}. Report text only, not image analysis.</small>
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
            <Panel title="Best potential candidates · local first">
              <div className="tm78-section-meta"><span>{horizon === 'future' ? 'Local + simulated partner catalogue' : 'Local catalogue only'}</span>
                <span>{context.excluded_count ?? 0} conflicting studies excluded</span></div>
              <p className="tm78-muted">The first two candidates are compared by default. Compare up to four; choose only one for a screening enquiry.</p>
              <div className="tm78-candidates">{context.trials.slice(0, 2).map((trial, index) => <article key={trial.id}
                className={`tm78-trial ${candidate === trial.id ? 'selected' : ''}`}>
                <div className="tm78-eyebrow">Potential candidate {index + 1}</div>
                <h2>{trial.title}</h2><strong>Phase {trial.phase} · {trial.status}</strong><span>{trial.site}</span>
                <p>{trial.priority_reason}</p>
                <Pill tone="warn">{trial.counts.Unknown} evidence gaps · not confirmed eligible</Pill>
                <label className="tm78-choice"><input type="radio" name="screening-candidate" checked={candidate === trial.id}
                  onChange={() => choose(trial.id)} />Choose for enquiry</label>
                <label className="tm78-choice"><input type="checkbox" checked={compare.includes(trial.id)}
                  onChange={() => toggleComparison(trial.id)} />Include in comparison</label>
              </article>)}</div>
              {context.trials.length > 2 && <details><summary>Add another potential trial to compare</summary>
                {context.trials.slice(2, 4).map((trial) => <div className="tm78-other" key={trial.id}>
                  <strong>{trial.title}</strong><span>{trial.site} · phase {trial.phase}</span>
                  <label className="tm78-choice"><input type="checkbox" checked={compare.includes(trial.id)}
                    onChange={() => toggleComparison(trial.id)} />Compare</label>
                  <label className="tm78-choice"><input type="radio" name="screening-candidate" checked={candidate === trial.id}
                    onChange={() => choose(trial.id)} />Choose for enquiry</label>
                </div>)}</details>}
              <label className="tm78-choice tm78-none"><input type="radio" name="screening-candidate" checked={!candidate}
                onChange={() => choose('')} />None — do not pursue a screening enquiry</label>
              {!context.trials.length && <p>No potential candidates in this horizon. No screening request can be prepared.</p>}
            </Panel>
            <Panel title={`Compare selected trials · ${compared.length} of 4`}>
              {compared.length ? <div className="tm78-table"><table className="hx-table tm78-comparison">
                <caption>Synthetic evidence only. Prior-phase and subgroup findings do not predict this patient's response.</caption>
                <thead><tr><th scope="col">Review</th>{compared.map((trial) => <th scope="col" key={trial.id}>{trial.title}<small>{trial.site}</small></th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">Current phase</th>{compared.map((trial) => <td key={trial.id}><strong>Phase {trial.phase} · ongoing</strong>
                    <p>{trial.status}. No completed current-phase outcomes.</p><small>Fictional protocol {trial.id}</small></td>)}</tr>
                  <tr><th scope="row">Prior-phase evidence & subgroup response</th>{compared.map((trial) => <td key={trial.id}>
                    {trial.evidence_track?.some((evidence) => evidence.phase !== trial.phase) ?
                      trial.evidence_track.filter((evidence) => evidence.phase !== trial.phase).map((evidence, index) => <div className="tm78-evidence" key={index}>
                      <strong>Prior phase {evidence.phase}</strong><p>{evidence.result}</p>
                      <small>{evidence.population} · {evidence.sample_size == null ? 'Cohort size not available' : `n=${evidence.sample_size}`}</small>
                      <details><summary>Population, limitations & source</summary><p>{evidence.limitation}</p><p>{evidence.source}</p>
                        <p>Synthetic illustrative response; not a personalised prediction.</p></details>
                    </div>) : <p>No prior-phase evidence supplied.</p>}</td>)}</tr>
                  <tr><th scope="row">Key criteria & gaps</th>{compared.map((trial) => <td key={trial.id}>
                    <Pill tone="warn">{trial.counts.Match} supported · {trial.counts.Unknown} unknown</Pill>
                    <p>{trial.assessment}</p>
                    <ul>{trial.criteria.filter((criterion) => criterion.status !== 'Match').map((criterion) =>
                      <li key={criterion.id}>{criterion.text}<small>{criterion.evidence}</small></li>)}</ul>
                    <details><summary>Inspect every criterion & source</summary>
                      {trial.criteria.map((criterion) => <div className="tm78-criterion" key={criterion.id}>
                        <strong>{criterion.status} · {criterion.kind}</strong><p>{criterion.text}</p><p>{criterion.evidence}</p>
                        <small>Patient evidence: {criterion.source}</small><small>Protocol: {criterion.protocol_source}</small>
                      </div>)}
                    </details><small>Supported criteria are not a complete eligibility assessment.</small>
                  </td>)}</tr>
                </tbody>
              </table></div> : <p>Select at least one trial above to compare its evidence.</p>}
            </Panel>
            <Panel title="Clinician review · manual approval">
              <div className="tm78-section-meta"><span>Human approval retained for every request and patient pack.</span>
                <button className="hx-btn" disabled aria-describedby="tm78-auto">Auto-send: off</button></div>
              <small id="tm78-auto">Auto-send is disabled in this prototype. A clinician must explicitly approve; no external systems are connected.</small>
              {chosen ? <>
                <h2>Screening enquiry · {chosen.title}</h2>
                <p className="tm78-muted">{result?.enquiry_notes?.[chosen.id]
                  ? result.mode === 'copilot' ? 'AI-generated synthetic draft — editable; verify every statement.' : 'Deterministic demo draft — editable.'
                  : 'Prefilled deterministic demo draft — editable; not an AI refresh result.'}</p>
                <label className="tm78-notes">Enquiry to the trial coordinator (synthetic only)
                  <textarea rows={6} value={notes} onChange={(event) => { setNotes(event.target.value); setReceipt(null); setConfirmation(null); }} /></label>
                <details><summary>Missing evidence to resolve before any actual screening</summary>
                  <ul>{gaps.map((criterion) => <li key={criterion.id}>{criterion.text} — {criterion.evidence}</li>)}</ul>
                  <p>The trial team must verify the full protocol, current results and patient preference.</p></details>
                <h3>Proposed order checklist · draft only</h3>
                <p className="tm78-muted">Select proposed checks for the local draft. These are not orders and do not establish eligibility.</p>
                {chosen.proposed_orders?.map((order) => <label key={order} className="tm78-choice">
                  <input type="checkbox" checked={orders.includes(order)} onChange={() => {
                    setOrders((items) => items.includes(order) ? items.filter((item) => item !== order) : [...items, order]);
                    setReceipt(null); setConfirmation(null);
                  }} />{order}</label>)}
                <div className="tm78-actions">
                  <button className="hx-btn" onClick={() => { choose(''); setMessage('Candidate dismissed locally. No screening request was created.'); }}>Dismiss candidate</button>
                </div>
              </> : <p>No candidate chosen. You can continue comparing without requesting screening.</p>}
              <div className="tm78-ai-controls">
                <button className="hx-btn" disabled={busy || !compare.length} onClick={refresh}>
                  {busy && <span className="hx-spinner" aria-hidden />}{busy ? 'Working…' : 'Refresh draft with AI (optional)'}</button>
                {busy && <button className="hx-btn" onClick={() => { cancelReview(); setMessage('AI refresh cancelled. Demo drafts remain available.'); }}>Cancel AI refresh</button>}
                <small>Reviews only the compared trials through the Copilot SDK; may take up to 60 seconds. Review edits before refreshing.</small>
              </div>
              {busy && <Backstage title="Preparing a clinician-review draft" stages={stages} running holdLast release={false}
                note="Activity stages are illustrative. Cancel at any time; no referrals, orders or messages are sent." />}
              {result && <details><summary>Inspect assistant review · {result.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
                <p>{result.note}</p><h3>{result.headline}</h3>
                <p>Unverified synthetic draft, not confirmation of eligibility. The source criteria remain inspectable above.</p>
                {result.blocks.map((block, index) => <RenderBlock key={index} block={block} />)}
              </details>}
              {message && <p role="status" className="tm78-attention">{message}</p>}
              {confirmation && chosen && <div className="tm78-confirmation" ref={confirmationRef} tabIndex={-1}>
                <h2>{confirmation === 'screening' ? 'Approve a simulated screening request?' : 'Approve simulated patient sharing?'}</h2>
                <p>{chosen.title} · {confirmation === 'screening' ? 'Your edited enquiry and selected proposed checks will be recorded only in this page.' :
                  'The plain-language pack will be recorded only in this page. No patient receives a message.'}</p>
                <p><strong>{gaps.length} unresolved evidence gaps remain.</strong> This does not establish eligibility, enrol the patient, send a referral or place an order.</p>
                <div className="tm78-actions"><button className="hx-btn primary" onClick={approve}>
                  {confirmation === 'screening' ? 'Approve simulated screening request' : 'Approve simulated send to patient'}</button>
                  <button className="hx-btn" onClick={() => setConfirmation(null)}>Dismiss confirmation</button></div>
              </div>}
              {receipt && <div className="tm78-receipt" role="status">
                <Pill tone="ok">Local simulation receipt · {receipt.time}</Pill>
                <h2>{receipt.kind === 'screening' ? 'Screening request recorded locally' : 'Patient pack sharing recorded locally'}</h2>
                <p>{receipt.trial} · explicitly approved by clinician</p><p className="tm78-preserve">{receipt.note}</p>
                {!!receipt.orders.length && <><strong>Proposed checks only</strong><ul>{receipt.orders.map((order) => <li key={order}>{order}</li>)}</ul></>}
                <details><summary>{receipt.gaps.length} unresolved evidence gaps</summary><ul>{receipt.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details>
                <p><strong>Nothing actually sent, ordered, enrolled or written to the EHR.</strong> This receipt lasts only in this session.
                  Real screening requires the trial team's full protocol review and current evidence.</p>
              </div>}
            </Panel>
            {chosen && <Panel title="Patient information pack · plain language">
              <p className="tm78-preserve">{chosen.patient_pack}</p>
              <p className="tm78-muted">Synthetic information to discuss with your care team, not medical advice. This is not an offer of a place or a prediction of benefit.</p>
              <button className="hx-btn" onClick={() => {
                cancelReview(); setReceipt(null); setConfirmation('patient');
              }}>Send to patient</button>
              <small>Simulation only. Opens a separate clinician approval; no actual message is sent.</small>
            </Panel>}
          </div>
        </div>}
      </HospitalShell>
    </div>
  );
}
