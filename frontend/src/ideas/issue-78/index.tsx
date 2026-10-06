import { useEffect, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './trial-matching.css';

export const meta: IdeaMeta = {
  id: '78', issue: 78,
  title: 'Trials for this patient',
  tagline: 'Compare trial criteria with the patient record, see missing evidence, and decide what to pursue.',
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
};
type Context = {
  patient: { id: string; name: string; age: number; sex: string; diagnosis: string; allergies: string };
  snapshot_date: string; notice: string;
  facts: Record<string, { label: string; display: string; source: string }>;
  trials: Trial[];
  coverage: { name: string; group: string; likely_source: string; status: string }[];
};

const story: StoryStep[] = [
  { id: 'record', title: 'Open patient chart', explain: 'Eva is attending after FOLFOX. The hospital has flagged a possible local trial without leaving her chart.' },
  { id: 'matches', title: 'Compare trial criteria', explain: 'Inspect what matches, what conflicts and what is unknown. Ask the assistant to explain the outstanding checks.' },
  { id: 'decision', title: 'Clinician review', explain: 'Decide whether to request missing evidence, prepare a screening enquiry, or dismiss the candidate.' },
  { id: 'receipt', title: 'Review-ready draft', explain: 'The screening enquiry stays a local draft. Nothing is sent, ordered or written back into the hospital record.' },
];
const stages = [
  { label: 'Read synthetic patient evidence', detail: 'Pathology, molecular results, labs, CT report and treatment history' },
  { label: 'Compare inclusion and exclusion criteria', detail: 'Keep conflicts separate from absent or outdated evidence' },
  { label: 'Prepare checks for clinician review', detail: 'No eligibility decision or treatment recommendation' },
];

export default function TrialMatching() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [step, setStep] = useState('record');
  const [context, setContext] = useState<Context | null>(null);
  const [selected, setSelected] = useState('LOCAL-078-A');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    let active = true;
    setContext(null);
    setError('');
    request<Context>(`/api/ideas/78/context?horizon=${horizon}`)
      .then((data) => { if (active) setContext(data); })
      .catch((err: Error) => { if (active) setError(`The trial catalogue could not be loaded: ${err.message}`); });
    return () => { active = false; };
  }, [horizon, runs]);

  const trial = context?.trials.find((t) => t.id === selected) ?? context?.trials[0];
  const changeHorizon = (value: Horizon) => {
    setHorizon(value); setResult(null); setDecision(''); setReviewed(false); setNotes('');
    setSelected('LOCAL-078-A'); setStep('record');
  };
  const selectTrial = (id: string) => {
    setSelected(id); setDecision(''); setReviewed(false); setNotes(''); setStep('matches');
  };
  const go = (id: string) => {
    if (id === 'receipt' && !decision) { setStep('decision'); return; }
    setStep(id);
  };
  const explain = async () => {
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await request<AgentResult>('/api/ideas/78/review', {
        method: 'POST', body: JSON.stringify({ horizon }),
      }));
    } catch (err) {
      setError(`Assistant review unavailable. The criterion table remains available. ${err instanceof Error ? err.message : ''}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="tm78" data-theme={theme}>
      <a className="tm78-skip" href="#tm78-main">Skip to trial matching</a>
      <div className="tm78-controls">
        <span>Hackathon prototype – synthetic data – not for clinical use</span>
        <div role="group" aria-label="Time horizon">
          <button disabled={busy} aria-pressed={horizon === 'six-month'} onClick={() => changeHorizon('six-month')}>In six months</button>
          <button disabled={busy} aria-pressed={horizon === 'future'} onClick={() => changeHorizon('future')}>The future</button>
        </div>
        <div role="group" aria-label="Theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <HospitalShell module="Patient trial matching" patient={context?.patient}
        nav={story.slice(0, 3).map((s) => ({ id: s.id, label: s.title }))}
        active={step} onNav={go}
        guide={<StoryGuide steps={story} current={step} onGo={go}
          nextLabel={step === 'record' ? 'Inspect potential trials' : step === 'matches' ? 'Review next steps' : 'Review draft'} />}
        toolbar={<><span className="tm78-eyebrow">Trial office · fictional hospital</span><span className="hx-spacer" />
          <span>{horizon === 'future' ? 'Local + simulated partner catalogue' : 'Local catalogue only'}</span></>}>
        <div id="tm78-main" tabIndex={-1}>
          <h1>Trials for this patient</h1>
          <p className="tm78-attention">Potential matches are not confirmed eligibility. The oncologist and trial team decide; this screen does not recommend treatment.</p>
        </div>
        {error && <div role="alert" className="tm78-attention">{error}
          {!context && <button className="hx-btn" onClick={() => setRuns((n) => n + 1)}>Retry catalogue</button>}</div>}
        {!context && !error && <Working label="Loading synthetic patient and trial catalogue" />}
        {context && <>
          {step === 'record' && <div className="tm78-grid">
            <Panel title="Patient chart · current synthetic snapshot">
              <dl className="hx-facts">{Object.entries(context.facts).map(([key, fact]) =>
                <div key={key} className="tm78-fact"><dt>{fact.label}</dt><dd><strong>{fact.display}</strong><small>{fact.source}</small></dd></div>)}</dl>
              <p className="tm78-muted">Assessment date: {context.snapshot_date}. Report text is shown, not image analysis.</p>
            </Panel>
            <Panel title="Proactive trial signal">
              <Pill tone="warn">Human review required</Pill>
              <h2>PATHWAY-CRC may be relevant</h2>
              <p>KRAS G12D and prior FOLFOX support a local screening discussion. Renal function is absent; eligibility cannot be established.</p>
              <button className="hx-btn primary" onClick={() => setStep('matches')}>Compare {context.trials.length} synthetic trials</button>
              <p className="tm78-muted">All protocols and recruitment statuses are fictional. No PubMed or ClinicalTrials.gov search has been performed.</p>
            </Panel>
          </div>}
          {(step === 'matches' || step === 'decision') && trial && <div className="tm78-grid">
            <Panel title={`Trial catalogue · ${context.trials.length} fictional recruiting studies`}>
              <div className="tm78-trials">{context.trials.map((t) => <button key={t.id} className="tm78-trial"
                aria-pressed={trial.id === t.id} onClick={() => selectTrial(t.id)}>
                <strong>{t.title} · phase {t.phase}</strong><span>{t.site}</span>
                <span>{t.counts.Match} match · {t.counts.Conflict} conflict · {t.counts.Unknown} unknown</span>
                <Pill tone={t.counts.Conflict ? 'crit' : 'warn'}>{t.assessment}</Pill>
              </button>)}</div>
            </Panel>
            <Panel title={`${trial.title} · criterion-by-criterion evidence`}>
              <p>{trial.description}</p>
              <div className="tm78-table"><table className="hx-table"><caption>Every conclusion links to the synthetic record and protocol</caption>
                <thead><tr><th scope="col">Criterion</th><th scope="col">Finding</th><th scope="col">Evidence</th></tr></thead>
                <tbody>{trial.criteria.map((c) => <tr key={c.id}>
                  <td><small>{c.kind} · {c.id}</small>{c.text}</td>
                  <td><Pill tone={c.status === 'Match' ? 'ok' : c.status === 'Conflict' ? 'crit' : 'warn'}>{c.status}</Pill></td>
                  <td>{c.evidence}<details><summary>Inspect sources</summary><p>{c.source}</p><p>{c.protocol_source}</p></details></td>
                </tr>)}</tbody>
              </table></div>
              <p className="tm78-muted">“Match” supports this criterion only. This is a small illustrative protocol, not a complete eligibility assessment.</p>
              {step === 'matches' && <button className="hx-btn primary" disabled={busy} onClick={explain}>
                {busy && <span className="hx-spinner" aria-hidden />}{busy ? 'Working…' : 'Ask assistant to review all trials'}
              </button>}
              {step === 'decision' && <>
                <h2>Clinician next steps</h2>
                <ul>{trial.criteria.filter((c) => c.status !== 'Match').map((c) => <li key={c.id}>{c.status}: {c.text}</li>)}</ul>
                <label className="tm78-notes">Screening enquiry notes (synthetic only)
                  <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Questions for the trial coordinator; no real patient information." /></label>
                <label className="tm78-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                  I reviewed the criteria, conflicts and missing evidence. This is not confirmation of eligibility.</label>
                <div className="tm78-actions">
                  <button className="hx-btn primary" disabled={!reviewed || trial.counts.Conflict > 0} onClick={() => { setDecision('Screening enquiry draft approved for discussion'); setStep('receipt'); }}>Approve local enquiry draft</button>
                  <button className="hx-btn" disabled={!reviewed} onClick={() => { setDecision('Missing-evidence checklist prepared'); setStep('receipt'); }}>Prepare missing-evidence checklist</button>
                  <button className="hx-btn" onClick={() => { setDecision('Candidate dismissed by clinician'); setStep('receipt'); }}>Dismiss candidate</button>
                </div>
                {trial.counts.Conflict > 0 && <p>Resolve the protocol conflicts before preparing an enquiry; you can dismiss or request further review.</p>}
              </>}
            </Panel>
          </div>}
          {(busy || result) && <Panel title="Assistant review · all trials">
            {busy && <Backstage title="Assistant is checking the evidence" stages={stages} running holdLast release={false}
              note="Illustrative activity stages; the review uses the Copilot SDK when configured. It can take up to a minute." />}
            {result && <><Pill tone="info">{result.mode === 'copilot' ? 'Copilot SDK review' : 'Deterministic demo · SDK unavailable'}</Pill>
              <p>{result.note}</p><h2>{result.headline}</h2>
              <p>Assistant-generated draft only; the criterion table remains the screening record. Review every statement.</p>
              {result.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}</>}
          </Panel>}
          {step === 'receipt' && trial && <Panel title="Clinician review receipt">
            <div role="status"><Pill tone="ok">{decision}</Pill></div>
            <h2>{context.patient.name} → {trial.title}</h2>
            <p>{trial.site} · fictional protocol {trial.id}</p>
            <p>{trial.counts.Match} supported criteria · {trial.counts.Conflict} conflicts · {trial.counts.Unknown} unknowns</p>
            <ul>{trial.criteria.filter((c) => c.status !== 'Match').map((c) => <li key={c.id}>{c.status}: {c.text} — {c.evidence}</li>)}</ul>
            <p>{notes || 'No additional clinician notes.'}</p>
            <p><strong>Local session draft only.</strong> No referral sent, tests ordered or chart updated. Confirm the full protocol, current results and patient preference with the trial team before any real action.</p>
            <button className="hx-btn" onClick={() => setStep('decision')}>Edit clinician decision</button>
          </Panel>}
          {horizon === 'six-month' && <Panel title="What this needs from the minimal dataset">
            <p>{context.coverage.length} mapped elements; {context.coverage.filter((c) => c.status === 'Available').length} available in this synthetic hospital.
              Likely sources are hackathon assumptions, not measured hospital readiness.</p>
            <div className="tm78-table"><table className="hx-table"><caption>Colorectal minimal dataset coverage</caption>
              <thead><tr><th scope="col">Group / element</th><th scope="col">Likely source</th><th scope="col">Demo coverage</th></tr></thead>
              <tbody>{context.coverage.map((c) => <tr key={c.name}><td>{c.group} / {c.name}</td><td>{c.likely_source}</td><td>{c.status}</td></tr>)}</tbody>
            </table></div>
            <h2>What this hospital must do</h2>
            <ul><li>Map demographics, pathology, prescribing and current laboratory values, including units and dates.</li>
              <li>Structure RAS, MSI and CT report findings; record performance status and medical history consistently.</li>
              <li>Keep the local trial catalogue current and agree who reviews screening enquiries.</li></ul>
            <div className="tm78-unavailable" aria-disabled="true">Partner-site detailed matching — needs the future federated platform; not available in six months.</div>
            <div className="tm78-unavailable" aria-disabled="true">Hospital chart write-back — outside the minimal dataset. Both modes keep drafts here only.</div>
          </Panel>}
        </>}
      </HospitalShell>
    </div>
  );
}
