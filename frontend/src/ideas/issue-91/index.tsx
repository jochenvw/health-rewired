import { useEffect, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import '../../hospital/hospital.css';
import './safety.css';

export const meta: IdeaMeta = {
  id: '91',
  issue: 91,
  title: 'Drug Safety Monitor',
  tagline: 'Spot possible side effects after cancer treatment starts, inspect the evidence, and review a safety report.',
};

type Horizon = 'future' | 'six-months';
type Event = { term: string; grade: number; source: string; evidence: string };
type Patient = {
  id: string; age: number; start: string; lab_date: string; baseline_alt: number;
  alt: number; alt_uln: number; anc: number; note?: string; admission?: string | null; events: Event[];
};
type Comparison = {
  term: string; count: number; total: number; rate: number; trial_rate: number | null; grades: Record<string, number>;
};
type Drug = {
  id: string; name: string; type: string; approved: string; signal: string;
  patients: Patient[]; comparisons: Comparison[];
};
type Monitor = {
  period: string; disclaimer: string; drugs: Drug[];
  coverage: { group: string; name: string; likely_source: string; moments?: string }[];
};

export default function DrugSafetyMonitor() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [data, setData] = useState<Monitor | null>(null);
  const [selected, setSelected] = useState('immune-a');
  const [step, setStep] = useState('drugs');
  const [patientId, setPatientId] = useState('S91-01');
  const [term, setTerm] = useState('ALT increased');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [draft, setDraft] = useState('');
  const [decision, setDecision] = useState<'approved' | 'dismissed' | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [causality, setCausality] = useState('Not assessed');
  const [acknowledged, setAcknowledged] = useState(false);
  const future = horizon === 'future';
  const drug = data?.drugs.find(d => d.id === selected);
  const patient = drug?.patients.find(p => p.id === patientId) ?? drug?.patients[0];
  const affected = drug?.patients.filter(p => p.events.some(e => e.term === term)) ?? [];
  const older = drug?.patients.filter(p => p.age > 75) ?? [];
  const younger = drug?.patients.filter(p => p.age <= 75) ?? [];
  const countLiver = (rows: Patient[]) => rows.filter(p => p.events.some(e => e.term === 'ALT increased')).length;
  const steps: StoryStep[] = [
    { id: 'drugs', title: 'New treatments', explain: 'Monday morning: a scheduled synthetic scan has found one liver signal needing review.' },
    { id: 'rates', title: 'Compare events', explain: future ? 'Compare patients with candidate side effects against fictional trial rates—not a causal risk estimate.' : 'Count lab-based toxicity per drug. Trial comparison needs reference data and matched follow-up.' },
    { id: 'evidence', title: 'Why this signal?', explain: 'Inspect each source and the older-patient subgroup before judging the signal.' },
    { id: 'extract', title: 'Read the notes', explain: future ? 'The assistant reviews notes, surfaces unrecorded symptoms and prepares a report for you.' : 'Note extraction is unavailable. The assistant can prepare a smaller lab-only summary.' },
    { id: 'report', title: 'Human review', explain: future ? 'Edit the draft, assess causality, and approve locally or dismiss. Nothing goes to authorities.' : 'Review a lab-only monitoring summary. Full regulatory reporting remains unavailable.' },
  ];
  const stages = [
    { label: 'Collect treatment starts and dated labs', detail: 'Synthetic records only; no live hospital connections.', ms: 450 },
    { label: future ? 'Review notes and admission evidence' : 'Calculate lab-only candidate grades', detail: future ? 'Look for exact symptom passages and missing structured entries.' : 'CTCAE v5.0 candidates; a clinician confirms the grades.', ms: 450 },
    { label: future ? 'Prepare signal review and periodic report' : 'Prepare lab monitoring summary', detail: 'Waiting for Copilot; a labelled demo is available without a token.' },
  ];

  function resetReview() {
    setResult(null); setDraft(''); setDecision(null); setReviewed(false);
    setCausality('Not assessed'); setAcknowledged(false);
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setData(null); setError('');
    api.safetyMonitor<Monitor>(horizon).then(value => {
      if (active) setData(value);
    }).catch(() => {
      if (active) setError('The synthetic records could not be loaded. Check that the API is running, then reload.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [horizon]);

  async function runReview() {
    if (!drug || busy) return;
    setBusy(true); setError('');
    setDecision(null); setReviewed(false); setCausality('Not assessed');
    try {
      const value = await api.reviewSafety({ drug_id: selected, horizon });
      setResult(value);
      const report = value.blocks.find(b => b.type === 'summary' && /report|summary/i.test(b.title))
        ?? value.blocks.find(b => b.type === 'summary');
      setDraft(report?.body ?? value.blocks.map(b => `${b.title}\n${b.body ?? ''}`).join('\n\n'));
    } catch {
      setError('The assistant could not finish. Your evidence is still available; retry the review.');
    } finally {
      setBusy(false);
    }
  }

  function go(next: string) {
    if (busy) return;
    setStep(next);
    if ((next === 'extract' || next === 'report') && !result) void runReview();
  }

  function chooseDrug(value: Drug) {
    setSelected(value.id); setPatientId(value.patients[0].id);
    setTerm('ALT increased'); setStep('rates'); resetReview();
  }

  return (
    <div className="s91" data-theme={theme}>
      <a className="s91-skip" href="#s91-main">Skip to safety review</a>
      <div className="s91-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
      <header className="s91-header">
        <div><span className="s91-eyebrow">Klinikum Rewired München · pharmacovigilance</span><h1>Drug Safety Monitor</h1></div>
        <div className="s91-controls" aria-label="Monitoring horizon">
          <button aria-pressed={!future} disabled={busy || loading} onClick={() => { setHorizon('six-months'); resetReview(); }}>In six months</button>
          <button aria-pressed={future} disabled={busy || loading} onClick={() => { setHorizon('future'); resetReview(); }}>The future</button>
        </div>
        <div className="s91-controls" aria-label="Workspace theme">
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
        <a href="#/">All ideas ↗</a>
      </header>
      <div className="s91-context">
        <strong>Colorectal cancer · newly approved therapies</strong>
        <span>Review period: {data?.period ?? 'July – September 2026'}</span>
        <span>One hospital · simulated scheduled monitoring</span>
      </div>
      <div className={busy ? 's91-guide-busy' : undefined} aria-busy={busy}>
        <StoryGuide steps={steps} current={step} onGo={go} nextLabel={step === 'evidence' ? (future ? 'Review notes with assistant' : 'Prepare lab summary') : undefined} />
        {busy && <div className="s91-guide-working"><Working label="Assistant working — preparing safety review" /></div>}
      </div>
      <div className="s91-workspace">
        <aside className="s91-sidebar">
          <span className="s91-eyebrow">Treatment worklist</span>
          <h2>Patients started</h2>
          {data?.drugs.map(d => (
            <button className="s91-drug" key={d.id} aria-pressed={d.id === selected} disabled={busy} onClick={() => chooseDrug(d)}>
              <strong>{d.name}</strong>
              <span>{d.patients.length} patients · {d.approved}</span>
              <span className={`s91-status ${d.id === 'immune-a' ? 'danger' : d.signal === 'Review signal' ? 'warning' : 'success'}`}>
                {d.id === 'immune-a' ? '● Liver signal · review' : d.signal === 'Review signal' ? '● Lab event · watch' : '● No observed events'}
              </span>
            </button>
          ))}
          <div className="s91-sidebar-note">
            <strong>Monitoring already set up</strong>
            <p>Treatment starts → labs → {future ? 'notes and admissions → ' : ''}candidate events → human review.</p>
            <p>Demo snapshot; no background service or real alert delivery.</p>
          </div>
        </aside>
        <main id="s91-main" tabIndex={-1}>
          {loading && <Working label="Loading synthetic monitoring records" />}
          {error && <div className="s91-attention" role="alert">{error}<button onClick={() => result ? setError('') : void runReview()} disabled={!drug || busy}>Retry assistant review</button></div>}
          {drug && <>
            <div className="s91-title"><div><span className="s91-eyebrow">Current treatment</span><h2>{drug.name}</h2><p>{drug.type}</p></div><span className="s91-tag">{drug.patients.length} monitored starts</span></div>
            <div className="s91-attention">
              <div><strong>{countLiver(drug.patients) ? 'Liver laboratory signal needs review' : 'Review recorded lab events'}</strong>
                <p>{countLiver(drug.patients)}/{drug.patients.length} patients with ALT increase. Alert recipient: pharmacovigilance lead. Drug causality is not assessed.</p>
              </div>
              <button onClick={() => setAcknowledged(!acknowledged)} aria-pressed={acknowledged}>{acknowledged ? 'Acknowledged locally ✓' : 'Acknowledge review task'}</button>
            </div>
            {(step === 'drugs' || step === 'rates') && <>
              <div className="s91-metrics">
                <div><span className="s91-eyebrow">Starts in review period</span><strong>{drug.patients.length}</strong><span>All included in denominator</span></div>
                <div><span className="s91-eyebrow">ALT increase · over 75</span><strong>{countLiver(older)}/{older.length}</strong><span>Age ≤75: {countLiver(younger)}/{younger.length}</span></div>
                <div><span className="s91-eyebrow">Human control</span><strong>Not assessed</strong><span>Causality · reporting · care</span></div>
              </div>
              <section className="s91-panel">
                <h3>{future ? 'Observed events compared with trial rates' : 'Lab-based toxicity per drug'}</h3>
                <div className="s91-table-scroll"><table>
                  <caption>Patients with ≥1 event after treatment start · candidate CTCAE v5.0 grades</caption>
                  <thead><tr><th>Candidate side effect</th><th>Observed</th><th>{future ? 'Fictional trial' : 'Trial comparison'}</th><th>Grade 1 / 2 / 3 / 4</th><th>Evidence</th></tr></thead>
                  <tbody>{drug.comparisons.map(c => <tr key={c.term}>
                    <th scope="row">{c.term}</th><td><strong>{c.count}/{c.total}</strong> · {c.rate}%</td>
                    <td>{c.trial_rate === null ? 'Future only' : `${c.trial_rate}%`}</td>
                    <td>{Object.values(c.grades).join(' / ')}</td>
                    <td><button onClick={() => { setTerm(c.term); setPatientId(drug.patients.find(p => p.events.some(e => e.term === c.term))?.id ?? drug.patients[0].id); go('evidence'); }}>Why?</button></td>
                  </tr>)}</tbody>
                </table></div>
                <p className="s91-muted">Descriptive signals only. Small cohorts, variable follow-up and unmatched trial populations cannot establish excess risk. ALT increase is not a diagnosis of hepatitis.</p>
                <details><summary>Trial reference and grading assumptions</summary><p>Trial percentages are invented demonstration references in /sample-data/drug-safety-91.json, not published findings. Trial denominators and matched observation windows are unavailable.</p><p>Candidate CTCAE v5.0 grades: ALT with normal baseline: grade 1 &gt;1–3× upper limit of normal (ULN), grade 2 &gt;3–5×, grade 3 &gt;5–20×, grade 4 &gt;20×. Neutrophil count: grade 1 &lt;1.8–1.5, grade 2 &lt;1.5–1.0, grade 3 &lt;1.0–0.5, grade 4 &lt;0.5 ×10⁹/L. Grades 1–4 describe increasing severity; grade 5 is death (none here).</p></details>
              </section>
            </>}
            {step === 'evidence' && <section className="s91-panel">
              <h3>Why? {term}</h3>
              <p>ALT subgroup: over 75, {countLiver(older)}/{older.length}; age ≤75, {countLiver(younger)}/{younger.length}. Small numbers—not proof of an age effect.</p>
              <div className="s91-evidence-grid">
                <div><h4>Patients behind this signal</h4>{affected.length === 0 && <p>No recorded events of this type.</p>}
                  {affected.map(p => <button className="s91-patient" aria-pressed={patient?.id === p.id} key={p.id} onClick={() => setPatientId(p.id)}>{p.id} · age {p.age}<span>{p.events.find(e => e.term === term)?.source}</span></button>)}
                </div>
                {patient && <div className="s91-record">
                  <h4>{patient.id} · age {patient.age} · synthetic record</h4>
                  <p>Treatment started {patient.start} → lab follow-up {patient.lab_date}</p>
                  <dl><dt>ALT baseline / follow-up</dt><dd>{patient.baseline_alt} / {patient.alt} U/L · ULN {patient.alt_uln}</dd><dt>Neutrophils</dt><dd>{patient.anc} ×10⁹/L</dd></dl>
                  {patient.events.map((e, i) => <p key={i}><strong>{e.term} · candidate grade {e.grade}</strong><br />{e.evidence}<br /><span className="s91-muted">Source: {e.source} · {patient.id} · {patient.lab_date}</span></p>)}
                  {future ? <><h4>Original clinical note</h4><blockquote>{patient.note}</blockquote><p><strong>Admission:</strong> {patient.admission ?? 'None recorded'}</p></> : <p className="s91-unavailable">Full notes and admission detail need richer feeds—not available in six months.</p>}
                  <p className="s91-muted">Source: /sample-data/drug-safety-91.json · {patient.id}. These records have normal ALT baselines; other baseline patterns require separate grading.</p>
                </div>}
              </div>
            </section>}
            {step === 'extract' && <section className="s91-panel">
              <h3>{future ? 'Side effects missing from structured fields' : 'Lab-only assistant review'}</h3>
              {future ? <p>Prepared synthetic note candidate: “diarrhoea, 5 stools/day over baseline” → diarrhoea, candidate grade 2 (4–6 stools/day over baseline). Confirm the context and grade; this is not a diagnosis of immune colitis.</p> : <p className="s91-unavailable">Note extraction is greyed out: full free-text notes are not reliably available. Detailed admissions and trial comparison remain future-only.</p>}
              <button className="s91-primary" disabled={busy} onClick={() => void runReview()}>{busy ? <Working label="Reviewing evidence" /> : result ? 'Run assistant review again' : 'Run assistant review'}</button>
              {result && <><p className="s91-mode">{result.mode === 'copilot' ? 'Copilot SDK review' : 'Prepared synthetic demo · Copilot unavailable'}</p><p>{result.note}</p><div className="s91-blocks">{result.blocks.filter(b => b.type !== 'summary').map((b, i) => <RenderBlock key={i} block={b} />)}</div></>}
            </section>}
            {busy && <><Working label="Reviewing safety evidence and preparing your draft" hint="This can take up to a minute" /><Backstage stages={stages} running holdLast note="Stage timings are simulated; the final stage waits for the assistant response." /></>}
            {step === 'report' && <section className="s91-panel">
              <h3>{future ? 'Periodic safety report · draft for authorities' : 'Lab monitoring summary · local review'}</h3>
              {!future && <p className="s91-unavailable">Full regulatory report unavailable: needs notes, admission detail, trial references and validated reporting rules.</p>}
              {result && <>
                <p className="s91-mode">{result.mode === 'copilot' ? 'Draft prepared by Copilot SDK' : 'Prepared synthetic draft · Copilot unavailable'}</p>
                <p>{result.note}</p>
                <label htmlFor="s91-draft">Edit the {future ? 'periodic report' : 'lab summary'}</label>
                <textarea id="s91-draft" value={draft} disabled={!!decision || busy} onChange={e => setDraft(e.target.value)} rows={12} />
                <div className="s91-review-controls">
                  <label htmlFor="s91-causality">Your causality assessment<select id="s91-causality" value={causality} disabled={!!decision || busy} onChange={e => setCausality(e.target.value)}><option>Not assessed</option><option>Uncertain — further review needed</option><option>Possibly related</option><option>Unlikely related</option></select></label>
                  <label className="s91-check"><input type="checkbox" checked={reviewed} disabled={!!decision || busy} onChange={e => setReviewed(e.target.checked)} />I reviewed sources, candidate grades and the edited draft.</label>
                </div>
                {!decision ? <div className="s91-actions">
                  <button className="s91-primary" disabled={!reviewed || causality === 'Not assessed' || !draft.trim() || busy} onClick={() => setDecision('approved')}>Approve for local review</button>
                  <button className="s91-dismiss" disabled={busy} onClick={() => setDecision('dismissed')}>Dismiss draft</button>
                </div> : <div className="s91-receipt" role="status"><strong>{decision === 'approved' ? 'Approved locally — ready for pharmacovigilance review' : 'Draft dismissed — no report will be used'}</strong><p>Causality: {causality}. No report was sent; no patient care was changed. State lasts for this page visit only.</p><button onClick={() => setDecision(null)}>Reopen review</button></div>}
                <p className="s91-muted">The pharmacovigilance team decides whether and what to report. Real regulatory formats are outside this prototype.</p>
              </>}
              {!result && !busy && <button className="s91-primary" onClick={() => void runReview()}>Prepare draft</button>}
            </section>}
            {!future && <section className="s91-panel s91-coverage">
              <h3>What this needs from the minimal dataset</h3>
              <p>9 mapped elements; one is usually clinic-note text. Exact treatment start dates, dated regular labs and reference limits need a local delivery agreement. Source classifications are hackathon assumptions, not measured readiness.</p>
              <details open><summary>Dataset coverage and hospital commitments</summary>
                <ul>{data?.coverage.map(c => <li key={c.name}><strong>{c.likely_source === 'patient / clinic note' ? '◐' : '✓'} {c.name}</strong> · {c.group} · {c.likely_source}{c.moments && <span> · {c.moments}</span>}</li>)}</ul>
                <p>✕ Full clinical notes, detailed admission feeds and original trial references are not assumed available for this walkthrough. The minimal list includes an admission-due-to-toxicity indicator, not a full admission record.</p>
                <h4>What each hospital must do</h4>
                <ul><li>Map systemic regimen, individual drug duration, age and follow-up to an agreed format.</li><li>Link exact treatment starts to dated blood counts and liver values; provide baseline, units and local reference limits.</li><li>Agree regular lab export: the working list specifies diagnosis and grade 3–4 toxicity, not continuous sampling. Missing measurements mean missing events.</li><li>Agree who reviews alerts and candidate grades. Keep patient-level data at the hospital; only approved aggregates travel.</li></ul>
                <p className="s91-muted">Source: /sample-data/minimal-mdt-dataset.json. Six-month payoff: a repeatable lab-toxicity overview and a reviewed local summary, not automated regulatory reporting.</p>
              </details>
            </section>}
          </>}
        </main>
      </div>
      <footer className="s91-footer">{data?.disclaimer ?? 'All data and trial references are fictional.'} <span>Human decisions: causality · authority reporting · patient care</span></footer>
    </div>
  );
}
