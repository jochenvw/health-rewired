import { useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type StoryStep } from '../../hospital/Story';
import data from '../../../../sample-data/issue-104.json';
import dataset from '../../../../sample-data/minimal-mdt-dataset.json';
import type { IdeaMeta } from '../index';
import './decision.css';

export const meta: IdeaMeta = {
  id: '104', issue: 104, title: 'Post-MDT shared decision making',
  tagline: 'Compare treatment trade-offs with the patient, explain the evidence and decide together.',
};

const steps: StoryStep[] = [
  { id: 'worklist', title: 'Post-MDT worklist', explain: 'Eva has two options after surgery. Open her consultation to talk them through.' },
  { id: 'options', title: 'Compare options', explain: 'Choose a country and inspect the trade-offs. All summaries and numbers are synthetic, not verified guidance.' },
  { id: 'priorities', title: 'What matters to you?', explain: 'Move one priority at a time. Fit changes, but medical risks do not change when preferences change.' },
  { id: 'decision', title: 'Decide together', explain: 'Explain the terms, review uncertainties, then record a joint decision or defer it.' },
];
const stages = [
  { label: 'Read the synthetic consultation', detail: 'Age, stage and MDT options; richer record only in the future', ms: 400 },
  { label: 'Compare the two teaching summaries', detail: 'Country source pointers; full guideline texts not checked', ms: 400 },
  { label: 'Draft a plain-language explanation', detail: 'Copilot SDK or clearly labelled demo fallback' },
];
const criteria = [
  { key: 'quality', label: 'Everyday quality of life' },
  { key: 'survivalFit', label: 'Possible survival benefit' },
  { key: 'mobility', label: 'Avoid limitations to walking' },
] as const;
type Criterion = typeof criteria[number]['key'];
type Country = 'Germany' | 'Italy' | 'Netherlands';
type Option = typeof data.options[number];

export default function SharedDecision() {
  const [theme, setTheme] = useState('light');
  const [horizon, setHorizon] = useState<'future' | 'six-months'>('future');
  const [step, setStep] = useState('worklist');
  const [countryName, setCountry] = useState<Country>('Germany');
  const [weights, setWeights] = useState<Record<Criterion, number>>({ quality: 5, survivalFit: 5, mobility: 5 });
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
  const future = horizon === 'future';
  const country = data.countries.find((item) => item.name === countryName)!;
  const score = (option: Option) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return total ? Math.round(criteria.reduce((sum, item) => sum + weights[item.key] * option[item.key], 0) / total * 10) : null;
  };
  const resetDraft = () => { setResult(null); setError(''); setStarted(false); setReceipt(''); setConfirmed(false); };
  const explain = async () => {
    setBusy(true); setStarted(true); setRuns((n) => n + 1); setError(''); setResult(null);
    try {
      setResult(await request<AgentResult>('/api/ideas/104/explain', {
        method: 'POST', body: JSON.stringify({ country: countryName, horizon }),
      }));
    } catch {
      setError('The assistant could not be reached. You can still compare the synthetic summaries and explain terms below.');
    } finally { setBusy(false); }
  };
  const why = (text: string) => <details className="sdm-why"><summary>Why? · reasoning and source</summary>
    <p>{text}</p><p>{data.notice}</p><a href={country.url} target="_blank" rel="noreferrer">{country.source} ↗</a>
  </details>;
  const numeric = (value: number, label: string) => <><strong>{value} of 100</strong><span className="sdm-array" role="img" aria-label={`${value} of 100: ${label}; simulated`}>
    {Array.from({ length: 100 }, (_, i) => <i key={i} className={i < value ? 'filled' : ''} />)}
  </span></>;
  return <div className="sdm104" data-theme={theme}>
    <a className="sdm-skip" href="#sdm-task">Skip to consultation</a>
    <div className="sdm-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
    <HospitalShell module="Post-MDT shared decision making" active={step} onNav={setStep}
      nav={steps.map((s) => ({ id: s.id, label: s.title }))}
      patient={{ ...data.patient, ward: 'Colorectal consultation · Room 2' }}
      guide={<StoryGuide steps={steps} current={step} onGo={setStep} nextLabel={step === 'worklist' ? 'Open Eva’s consultation' : undefined} />}
      toolbar={<>
        <label>Country <select value={countryName} disabled={busy} onChange={(e) => { setCountry(e.target.value as Country); resetDraft(); }}>
          {data.countries.map((item) => <option key={item.name}>{item.name}</option>)}
        </select></label>
        <span className="hx-spacer" />
        {(['six-months', 'future'] as const).map((value) => <button key={value} className="hx-btn" disabled={busy}
          aria-pressed={horizon === value} onClick={() => { setHorizon(value); resetDraft(); }}>
          {value === 'future' ? 'The future' : 'In six months'}
        </button>)}
        {['light', 'dark'].map((value) => <button key={value} className="hx-btn" aria-pressed={theme === value}
          onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}
      </>}>
      <div id="sdm-task">
        <h1>Post-MDT shared decision making</h1>
        <div className="sdm-attention"><Pill tone="warn">Human review required</Pill> No single best option. Teaching estimates only — not a personal prognosis.</div>
      </div>
      {step === 'worklist' ? <>
        <Panel title="Post-MDT worklist · colorectal clinic">
          <table className="hx-table"><caption>Synthetic consultations today</caption><thead><tr><th>Time</th><th>Patient</th><th>MDT outcome</th><th>Next action</th></tr></thead>
            <tbody><tr><td>09:30</td><td><strong>Eva Sommer · 68</strong></td><td>Stage III · discuss treatment duration</td><td><button className="hx-btn primary" onClick={() => setStep('options')}>Open consultation</button></td></tr>
              <tr><td>10:00</td><td>Leon Fischer · 72</td><td>Stage II · pathology clarification</td><td><Pill>Awaiting pathology · demo context</Pill></td></tr>
              <tr><td>10:30</td><td>Marta Klein · 61</td><td>Stage III · toxicity review</td><td><Pill>Nurse review · demo context</Pill></td></tr></tbody>
          </table>
        </Panel>
        <Panel title="Eva’s MDT outcome"><p>{data.patient.mdt}</p><p>{future ? data.patient.details : data.patient.minimal}</p>
          {why('Source: the invented MDT note and patient record in sample-data/issue-104.json. This is not an EHR connection.')}
        </Panel>
      </> : <>
        <Panel title={`${countryName} · treatment discussion`}>
          <p>{country.summary}</p>{why('Changing country changes the teaching wording and source pointer only. We have not verified national differences or eligibility; check the original guideline with the clinician.')}
        </Panel>
        <div className="sdm-columns">
          <Panel title="Risk / benefit matrix">
            <p>{future ? 'Future demonstration · invented numbers for Eva. No validated personalisation model.' : 'Six-month view · qualitative teaching summaries. Personalised probabilities unavailable.'}</p>
            <div className="sdm-scroll"><table className="sdm-matrix">
              <caption>Lower burden / trade-off / higher burden · colour never means a treatment recommendation</caption>
              <thead><tr><th>What we compare</th>{data.options.map((option, i) => <th key={option.id}>{country.labels[i]}<small>{option.plain}</small>
                {why(`${option.benefit} ${option.burden} Synthetic option, to be checked against stage, fitness and guideline.`)}</th>)}</tr></thead>
              <tbody>
                <tr><th>Alive at five years</th>{data.options.map((o) => <td key={o.id} className="benefit">{future ? numeric(o.survival, 'alive at five years') : 'Possible benefit; discuss uncertainty'}
                  {why('Fixed invented teaching estimate. Not extracted from a guideline or calculated from age, genetics or labs. Sliders do not change it.')}</td>)}</tr>
                <tr><th>Cancer returns within five years</th>{data.options.map((o) => <td key={o.id} className="tradeoff">{future ? numeric(o.recurrence, 'recurrence within five years') : 'Risk reduction not quantified'}
                  {why(future ? 'Invented recurrence probability; 28 of 100 without additional treatment is the demo comparator, not a recommended third option. Illustrated reduction: ' + (28 - o.recurrence) + ' percentage points. No validated evidence for these numbers.' : 'Additional treatment is discussed to reduce the chance of cancer returning. The minimal MDT fields do not provide a validated personal recurrence probability or numerical risk reduction.')}</td>)}</tr>
                <tr><th>Lasting nerve symptoms</th>{data.options.map((o) => <td key={o.id} className={o.neuropathy > 20 ? 'burden' : 'tradeoff'}>{future ? numeric(o.neuropathy, 'lasting nerve symptoms') : o.id === 'short' ? 'Less time exposed · trade-off' : 'More time exposed · higher burden'}
                  {why('Invented side-effect estimate, not adjusted for Eva’s diabetic tingling. Clinical assessment and patient discussion are needed.')}</td>)}</tr>
                <tr><th>Daily life and visits</th>{data.options.map((o) => <td key={o.id} className={o.id === 'short' ? 'benefit' : 'tradeoff'}>{o.burden}<small>{o.visits} planned infusion visits · simulated schedule</small>
                  {why('Simplified synthetic schedule. Quality of life and walking scores are teaching assumptions, not measured outcomes.')}</td>)}</tr>
                <tr><th>Fit with your priorities</th>{data.options.map((o) => <td key={o.id} className={score(o) === null ? '' : score(o)! >= 70 ? 'benefit' : score(o)! >= 50 ? 'tradeoff' : 'burden'}>
                  <strong>{score(o) === null ? 'No priorities set' : `${score(o)} / 100 · preference fit`}</strong>
                  {why(`Weighted mean of synthetic scores × 10: quality of life ${o.quality}/10; survival benefit ${o.survivalFit}/10; avoiding walking limitations ${o.mobility}/10. Not a probability, clinical recommendation or validated decision aid.`)}</td>)}</tr>
              </tbody>
            </table></div>
          </Panel>
          <div className="sdm-rail">
            <Panel title="What matters to you?">
              {criteria.map((item) => <div className="sdm-priority" key={item.key}><label htmlFor={`sdm-${item.key}`}>{item.label} <strong>{weights[item.key]} / 10</strong></label>
                <input id={`sdm-${item.key}`} type="range" min="0" max="10" value={weights[item.key]}
                  onChange={(e) => { setWeights({ ...weights, [item.key]: Number(e.target.value) }); setReceipt(''); setConfirmed(false); }} />
                {why('Your own importance rating: 0 = not a priority, 10 = very important. Only the preference-fit row changes; medical outcomes stay fixed.')}
              </div>)}
              <label className="sdm-unavailable">Costs <input aria-label="Costs priority unavailable" type="range" disabled value="0" readOnly /></label>
              <small>Unavailable in both horizons — no local cost data. Never treated as zero cost.</small>{why('Cost comparison is deferred in the approved proposal. Hospitals would need local patient costs before enabling this slider.')}
            </Panel>
            <Panel title="Plain words, together">
              <label>Explain a term <select value={term} onChange={(e) => setTerm(e.target.value as keyof typeof data.terms)}>{Object.keys(data.terms).map((key) => <option key={key}>{key}</option>)}</select></label>
              <p aria-live="polite">{data.terms[term]}</p>{why('Plain-language teaching definition from sample-data/issue-104.json; clinician checks understanding.')}
              <button className="hx-btn primary" disabled={busy} onClick={explain}>{busy ? <><span className="hx-spinner" /> Working…</> : 'Ask assistant to explain options'}</button>
            </Panel>
          </div>
        </div>
        {started && <Panel title="Assistant explanation">
          <Backstage key={runs} stages={stages} running={started} holdLast release={!busy} note="Stages illustrate the work; no live EHR lookup or validated risk calculation." />
          {error && <p role="alert">{error}</p>}
          {result && <><Pill tone={result.mode === 'copilot' ? 'ok' : 'warn'}>{result.mode === 'copilot' ? 'Live Copilot SDK' : 'Demo fallback · no live AI'}</Pill>
            <p>{result.note}</p>{result.blocks.map((block, i) => <RenderBlock block={block} key={i} />)}
            {why('The assistant explains synthetic summaries only. Sources are pointers, not retrieved evidence. Review any generated explanation before using it in discussion.')}</>}
        </Panel>}
        <Panel title="Week-by-week recovery · future demonstration">
          {future ? <details><summary>Compare illustrative fatigue trajectories</summary>
            <table className="hx-table"><caption>Invented fatigue score: 0 none, 10 severe; not a prediction</caption><thead><tr><th>Option</th><th>Week 4</th><th>Week 12</th><th>Week 24</th></tr></thead>
              <tbody>{data.options.map((o, i) => <tr key={o.id}><th>{country.labels[i]}</th>{o.fatigue.map((f, j) => <td key={j}>{f} / 10</td>)}</tr>)}</tbody></table>
            {why('Synthetic trajectory placeholders. Repeated patient-reported symptoms and a validated longitudinal model are needed for personal projections.')}
          </details> : <p className="sdm-unavailable">Unavailable in six months — needs repeated symptom data and a validated trajectory model, not just MDT fields.</p>}
        </Panel>
        {step === 'decision' && <Panel title="Record the decision you reach together">
          <div className="sdm-decision">
            <label>Joint choice <select value={choice} onChange={(e) => { setChoice(e.target.value); setReceipt(''); setConfirmed(false); }}>
              <option value="undecided">Not decided — arrange another conversation</option>
              {data.options.map((o, i) => <option key={o.id} value={o.id}>{country.labels[i]}</option>)}
            </select></label>
            <label>Patient’s priorities and next steps <textarea rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setReceipt(''); setConfirmed(false); }} /></label>
            <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Patient and clinician reviewed the options, uncertainty and next steps together.</label>
            <button className="hx-btn primary" disabled={!confirmed || !notes.trim()} onClick={() => setReceipt(`Recorded locally for Eva · ${countryName} · ${future ? 'Future demo' : 'Six-month discussion'} · ${choice === 'undecided' ? 'Decision deferred' : country.labels[data.options.findIndex((o) => o.id === choice)]}. ${notes} Priorities: quality of life ${weights.quality}/10, survival benefit ${weights.survivalFit}/10, walking ${weights.mobility}/10.`)}>Record joint decision · demo</button>
            {receipt && <div className="sdm-attention" role="status"><strong>Conversation recorded ✓</strong><p>{receipt}</p><small>Local prototype only. No EHR write-back; not persisted after leaving.</small></div>}
            {why('Only the patient and clinician decide. Recording requires explicit human confirmation; the assistant cannot select or file treatment.')}
          </div>
        </Panel>}
      </>}
      {!future && <Panel title="What this needs from the minimal dataset">
        <p>7 of 7 record fields are listed; availability still depends on each hospital. Source categories are hackathon assumptions, not measured readiness.</p>
        <div className="sdm-scroll"><table className="hx-table"><caption>Coverage from /sample-data/minimal-mdt-dataset.json</caption><thead><tr><th>Group</th><th>Field</th><th>Likely source</th><th>Six-month readiness</th></tr></thead><tbody>
          {dataset.groups.flatMap((group) => group.elements.filter((element) => data.coverage.includes(element.name)).map((element) => <tr key={element.name}><td>{group.group}</td><td>{element.name}</td><td>{element.likely_source}</td>
            <td>{['structured', 'derived'].includes(element.likely_source) ? '✓ Map structured field' : '◐ Structure / confirm with clinician'}</td></tr>))}
          <tr><td>Beyond MDT data</td><td>Personalised probabilities; weekly symptoms; costs</td><td>Validated models / richer records</td><td>✕ Not available</td></tr>
        </tbody></table></div>
        <p><strong>Each hospital:</strong> map age; structure pathology stage, MSI, history and performance status; map renal labs; record the MDT options in a fixed form. Agree and clinically validate national summaries and ask the patient for priorities during the consultation.</p>
        {why('Coverage is derived from the minimal dataset working list, not patient-level completeness. Presence of a field does not make a personal risk model available.')}
      </Panel>}
    </HospitalShell>
  </div>;
}
