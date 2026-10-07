import { useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type StoryStep } from '../../hospital/Story';
import { data } from './data';
import { criteria, initialPriorities, rebalancePriorities, type Priorities } from './priorities';
import type { IdeaMeta } from '../index';
import './decision.css';

export const meta: IdeaMeta = {
  id: '104', issue: 104, title: 'Post-MDT shared decision making',
  tagline: 'Compare treatment trade-offs with the patient, explain the evidence and decide together.',
};
const steps: StoryStep[] = [
  { id: 'worklist', title: 'Post-MDT worklist', explain: 'Open Eva’s consultation: three choices after surgery.' },
  { id: 'options', title: 'Compare options', explain: 'Explore outcomes and treatment burden. All figures are invented.' },
  { id: 'priorities', title: 'What matters to you?', explain: 'Share ten priority points. More for one means less for the others.' },
  { id: 'patients', title: 'Patients like me', explain: 'Explore synthetic cases with similar age, stage and priorities.' },
  { id: 'decision', title: 'Decide together', explain: 'Record a joint choice or defer; nothing is selected automatically.' },
];
const stages = [
  { label: 'Read the synthetic consultation', detail: 'Age, stage and recorded options', ms: 400 },
  { label: 'Compare three teaching summaries', detail: 'Guideline pointers, not verified evidence', ms: 400 },
  { label: 'Explain the options and priorities', detail: 'Copilot SDK or labelled demo fallback' },
];
type Country = 'Germany' | 'Italy' | 'Netherlands';

export default function SharedDecision() {
  const [theme, setTheme] = useState('light');
  const [step, setStep] = useState('worklist');
  const [countryName, setCountry] = useState<Country>('Germany');
  const [weights, setWeights] = useState<Priorities>(initialPriorities);
  const [term, setTerm] = useState<keyof typeof data.terms>('Adjuvant therapy');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState('undecided');
  const [notes, setNotes] = useState('I want to keep walking and understand whether extra treatment time is worth it.');
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [consent, setConsent] = useState(false);
  const [contributed, setContributed] = useState(false);
  const country = data.countries.find((item) => item.name === countryName)!;
  const scores = data.options.map((option) => criteria.reduce((sum, item) => sum + weights[item.key] * option[item.key], 0));
  const bestFits = country.labels.filter((_, i) => scores[i] === Math.max(...scores));
  const topPriorities = criteria.filter((item) => weights[item.key] === Math.max(...Object.values(weights)));
  const comparable = data.comparablePatients.filter((patient) => Math.abs(patient.age - data.patient.age) <= 5 &&
    patient.stage === 'III' && topPriorities.some((item) => item.key === patient.priority));
  const invalidateDecision = () => { setReceipt(''); setConfirmed(false); setConsent(false); setContributed(false); };
  const resetDraft = () => { setResult(null); setError(''); setStarted(false); invalidateDecision(); };
  const changeWeights = (next: Priorities) => { setWeights(next); resetDraft(); };
  const explain = async () => {
    setBusy(true); setStarted(true); setRuns((n) => n + 1); setError(''); setResult(null);
    try {
      setResult(await request<AgentResult>('/api/ideas/104/explain', {
        method: 'POST', body: JSON.stringify({ country: countryName, horizon: 'future', priorities: weights }),
      }));
    } catch { setError('Assistant unavailable. The synthetic comparisons and term definitions remain available.'); }
    finally { setBusy(false); }
  };
  const why = (text: string) => <details className="sdm-why"><summary>Why? · source and limitations</summary>
    <p>{text}</p><p>{data.notice}</p><small>Teaching data: sample-data/issue-104.json. The guideline pointer is not the source of invented figures.</small>
    <a href={country.url} target="_blank" rel="noreferrer">{country.source} ↗</a>
  </details>;
  const fitPlot = <div className="sdm-live-fit" aria-live="polite" aria-atomic="true">
    <strong>Fit with your values · not a probability</strong>
    {data.options.map((option, i) => <div className="sdm-fit" key={option.id}><span>{country.labels[i]}</span>
      <strong>{scores[i]} / 100</strong><progress max="100" value={scores[i]} aria-label={`${country.labels[i]} preference fit`} /></div>)}
    <small>Closest fit: {bestFits.join(' / ')}. You decide together.</small>
  </div>;
  return <div className="sdm104" data-theme={theme}>
    <a className="sdm-skip" href="#sdm-task" onClick={(event) => { event.preventDefault(); document.getElementById('sdm-task')?.focus(); }}>Skip to consultation</a>
    <div className="sdm-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
    <HospitalShell module="Post-MDT shared decision making" active={step} onNav={setStep}
      nav={steps.map((item) => ({ id: item.id, label: item.title }))}
      patient={{ ...data.patient, ward: 'Colorectal consultation · Room 2' }}
      guide={<StoryGuide steps={steps} current={step} onGo={setStep} nextLabel={step === 'worklist' ? 'Open Eva’s consultation' : undefined} />}
      toolbar={<><label>Country <select value={countryName} disabled={busy} onChange={(event) => { setCountry(event.target.value as Country); resetDraft(); }}>
        {data.countries.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><span className="hx-spacer" />
        {['light', 'dark'].map((value) => <button key={value} className="hx-btn" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</>}>
      <div id="sdm-task" tabIndex={-1}><h1>{steps.find((item) => item.id === step)?.title}</h1>
        <div className="sdm-attention"><Pill tone="warn">Human review required</Pill> Synthetic estimates · no validated prediction model</div>
      </div>
      {step === 'worklist' && <>
        <Panel title="Colorectal clinic · post-MDT"><div className="sdm-scroll"><table className="hx-table"><caption>Synthetic consultations</caption>
          <thead><tr><th>Time</th><th>Patient</th><th>MDT outcome</th><th>Action</th></tr></thead><tbody>
            <tr><td>09:30</td><td>Eva Sommer · 68</td><td>Stage III · discuss three choices</td><td><button className="hx-btn primary" onClick={() => setStep('options')}>Open consultation</button></td></tr>
            <tr><td>10:00</td><td>Leon Fischer · 72</td><td>Stage II</td><td>Awaiting pathology</td></tr>
            <tr><td>10:30</td><td>Marta Klein · 61</td><td>Stage III</td><td>Nurse toxicity review</td></tr>
          </tbody></table></div></Panel>
        <Panel title="Eva’s MDT outcome"><p>{data.patient.mdt}</p>{why(data.patient.details)}</Panel>
      </>}
      {step === 'options' && <>
        <Panel title="Clinical outcomes · invented scenario">
          <div className="sdm-option-cards">{data.options.map((option, i) => <section key={option.id}>
            <h3>{country.labels[i]}</h3><small>{option.plain}</small>
            {[{ label: 'Alive at five years', value: option.survival, tone: 'benefit' },
              { label: 'Recurrence within five years', value: option.recurrence, tone: 'burden' },
              { label: 'Chemotherapy-related nerve symptoms', value: option.neuropathy, tone: 'tradeoff' }].map((outcome) =>
              <div className={`sdm-outcome ${outcome.tone}`} key={outcome.label}><span>{outcome.label}</span><strong>{outcome.value} / 100</strong>
                <meter min="0" max="100" value={outcome.value} aria-label={`${country.labels[i]}: ${outcome.label}, ${outcome.value} of 100, simulated`} /></div>)}
            <p><strong>{option.visits}</strong> chemotherapy infusion visits</p>
            {why(`${option.benefit} ${option.burden} Fixed invented figures, not personal predictions. No additional chemotherapy avoids chemotherapy toxicity, not existing symptoms or cancer risk; follow-up continues.`)}
          </section>)}</div>
        </Panel>
        <Panel title="Recovery over time · simulated fatigue">
          <div className="sdm-recovery">{data.options.map((option, i) => <figure key={option.id}><figcaption>{country.labels[i]}</figcaption>
            <svg viewBox="0 0 240 125" role="img" aria-label={`${country.labels[i]} fatigue at weeks 4, 12, 24: ${option.fatigue.join(', ')} out of 10; invented`}>
              <path d="M20 10V100H220" className="sdm-axis" />
              <polyline points={option.fatigue.map((value, j) => `${30 + j * 90},${100 - value * 8}`).join(' ')} className="sdm-line" />
              {option.fatigue.map((value, j) => <g key={j}><circle cx={30 + j * 90} cy={100 - value * 8} r="4" /><text x={30 + j * 90} y={90 - value * 8}>{value}</text><text x={30 + j * 90} y="118">{[4, 12, 24][j]}w</text></g>)}
            </svg></figure>)}</div><small>Fatigue score: 0 none, 10 severe. Not a validated trajectory.</small>
          {why('Invented fatigue samples at weeks 4, 12 and 24. Lines connect these samples only; no clinical model is connected.')}
        </Panel>
        <Panel title="Evidence · inspect before use"><div className="sdm-evidence-sources">
          <section><h4>Guidelines / trials</h4><Pill tone="warn">Unverified pointer</Pill>{why(country.summary + ' Full guideline texts and trial results have not been reviewed.')}</section>
          <section><h4>Prediction model</h4><Pill tone="warn">Not connected</Pill>{why('Inputs would include age, stage, molecular findings, fitness and renal function. Model version, calibration and uncertainty intervals are unavailable; local validation and clinician review are required.')}</section>
          <section><h4>Patients like me</h4><Pill>Simulated examples</Pill><button className="hx-btn" onClick={() => setStep('patients')}>Explore comparable cases</button></section>
        </div></Panel>
      </>}
      {step === 'priorities' && <div className="sdm-columns"><Panel title="Share ten priority points">
        <p>Increase one slider; the others give up points. Outcomes do not change.</p>
        <div className="sdm-budget" role="img" aria-label={criteria.map((item) => `${item.label} ${weights[item.key]} of 10`).join(', ')}>
          {criteria.map((item, i) => <span key={item.key} className={`sdm-budget-${i}`} style={{ flexGrow: weights[item.key] }} />)}
        </div>
        {criteria.map((item) => <div className="sdm-priority" key={item.key}><label htmlFor={`sdm-${item.key}`}>{item.label}<strong>{weights[item.key]} / 10</strong></label>
          <input id={`sdm-${item.key}`} type="range" min="0" max="10" step="1" value={weights[item.key]} disabled={busy}
            onChange={(event) => changeWeights(rebalancePriorities(weights, item.key, Number(event.target.value)))} /></div>)}
        <div className="sdm-presets"><button className="hx-btn" disabled={busy} onClick={() => changeWeights({ quality: 1, survivalFit: 8, mobility: 1 })}>Try: survival first</button>
          <button className="hx-btn" disabled={busy} onClick={() => changeWeights({ quality: 5, survivalFit: 0, mobility: 5 })}>Try: everyday life first</button>
          <button className="hx-btn" disabled={busy} onClick={() => changeWeights(initialPriorities)}>Reset priorities</button></div>
        {why('Total = 10 points. Remaining points are redistributed proportionally between the other sliders, rounded to whole points. If both were zero, remaining points split evenly. Fit is a weighted mean of invented quality/survival/walking scores: shorter 8/6/8, longer 5/9/4, no treatment 9/1/10. Not a recommendation or confidence score. Costs are unavailable.')}
      </Panel><Panel title="How the comparison changes">{fitPlot}
        {why('Higher survival weighting favours longer treatment in this invented scenario; everyday-life weighting can favour no additional chemotherapy. This is patient-value fit, not evidence of a best treatment.')}
      </Panel></div>}
      {step === 'patients' && <Panel title="Patients like me · synthetic European examples">
        <p>{comparable.length} matches · age 63–73 · stage III · {topPriorities.map((item) => item.label).join(' / ')}</p>
        <div className="sdm-option-cards">{data.options.map((option, i) => <section key={option.id}><h3>{country.labels[i]}</h3>
          <div className="sdm-match-count"><strong>{comparable.filter((patient) => patient.option === option.id).length}</strong> synthetic cases</div>
          {comparable.filter((patient) => patient.option === option.id).map((patient) => <details className="sdm-case" key={patient.id}><summary>{patient.age} years · {patient.site.split(' · ')[0]}</summary>
            <p>{patient.outcome}</p><small>{patient.id} · {criteria.find((item) => item.key === patient.priority)?.label}</small></details>)}
        </section>)}</div>
        <button className="hx-btn" onClick={() => setStep('priorities')}>Change priorities to explore other cases</button>
        {why('Local invented cases only: age within five years, stage III and any tied highest priority. Different follow-up, missing outcomes and selection bias prevent causal comparisons. No real hospital query or pooled outcome probability.')}
      </Panel>}
      {step === 'decision' && <Panel title="Your joint decision"><div className="sdm-decision">
        <label>Choice <select value={choice} onChange={(event) => { setChoice(event.target.value); invalidateDecision(); }}><option value="undecided">Defer — another conversation</option>
          {data.options.map((option, i) => <option key={option.id} value={option.id}>{country.labels[i]}</option>)}</select></label>
        <label>Priorities and next steps<textarea rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); invalidateDecision(); }} /></label>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => { invalidateDecision(); setConfirmed(event.target.checked); }} /> Patient and clinician reviewed options and uncertainty together.</label>
        <button className="hx-btn primary" disabled={!confirmed || !notes.trim()} onClick={() => { setConsent(false); setContributed(false); setReceipt(`${choice === 'undecided' ? 'Decision deferred' : country.labels[data.options.findIndex((option) => option.id === choice)]} · ${countryName} · Eva. ${notes} Priorities: ${criteria.map((item) => `${item.label} ${weights[item.key]}/10`).join(', ')}. Unverified guidelines; no prediction model; synthetic examples only.`); }}>Record joint decision · demo</button>
        {receipt && <div className="sdm-attention" role="status"><strong>Conversation recorded ✓</strong><p>{receipt}</p><small>Local only · not persisted · no EHR write-back</small>
          <label><input type="checkbox" checked={consent} disabled={contributed} onChange={(event) => setConsent(event.target.checked)} /> Agree to a synthetic learning-loop preview.</label>
          <button className="hx-btn" disabled={!consent || contributed} onClick={() => setContributed(true)}>Contribute to learning loop · simulate</button>
          {contributed && <p>Learning-loop preview received ✓ · nothing sent or trained.</p>}</div>}
        {why('Only the patient and clinician choose. No additional treatment includes follow-up and supportive care; it is not the same as deferring. Recording needs human confirmation; contribution needs separate consent. Edits invalidate both.')}
      </div></Panel>}
      {step !== 'worklist' && <Panel title="Plain words · assistant">
        <div className="sdm-assistant-controls"><label>Explain a term <select value={term} onChange={(event) => setTerm(event.target.value as keyof typeof data.terms)}>
          {Object.keys(data.terms).map((key) => <option key={key}>{key}</option>)}</select></label>
          <button className="hx-btn primary" disabled={busy} onClick={explain}>{busy ? <><span className="hx-spinner" /> Working…</> : 'Explain options and priorities'}</button></div>
        <p>{data.terms[term]}</p>
        <Backstage key={runs} stages={stages} running={started} holdLast release={!busy} note="Illustrative steps · no live EHR or validated model." />
        {error && <p role="alert">{error}</p>}
        {result && <details open><summary>{result.mode === 'copilot' ? 'Live Copilot SDK explanation' : 'Demo fallback · no live AI'}</summary><p>{result.note}</p>
          {result.blocks.map((block, i) => <RenderBlock block={block} key={i} />)}</details>}
        {why('Plain-language teaching definitions and assistant explanations require clinician review. No treatment is selected or filed by the assistant.')}
      </Panel>}
    </HospitalShell>
  </div>;
}
