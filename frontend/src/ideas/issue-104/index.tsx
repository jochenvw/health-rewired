import { useRef, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type StoryStep } from '../../hospital/Story';
import { data } from './data';
import { avoidanceControls, criteria, initialPriorities, preferenceScores, rebalancePriorities, type Avoidance, type Priorities } from './priorities';
import type { IdeaMeta } from '../index';
import './decision.css';

export const meta: IdeaMeta = {
  id: '104', issue: 104, title: 'Post-MDT shared decision making',
  tagline: 'Compare treatment trade-offs with the patient, explain the evidence and decide together.',
};
const steps: StoryStep[] = [
  { id: 'worklist', title: 'Post-MDT worklist', explain: 'Select a synthetic patient and open their consultation: three choices after surgery.' },
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
type CaseId = typeof data.priorityCases[number]['id'];
const patients = [data.patient, ...data.otherPatients];
const outcomes = [
  { key: 'survival', label: 'Alive', max: 100, unit: 'of 100', times: ['1y', '3y', '5y'] },
  { key: 'recurrence', label: 'Cancer recurrence', max: 100, unit: 'of 100', times: ['1y', '3y', '5y'] },
  { key: 'fatigue', label: 'Fatigue', max: 10, unit: 'severity / 10', times: ['4w', '12w', '24w'] },
  { key: 'neuropathy', label: 'Chemotherapy-related neuropathy', max: 10, unit: 'severity / 10', times: ['4w', '12w', '24w'] },
  { key: 'hairLoss', label: 'Chemotherapy-related hair loss', max: 10, unit: 'severity / 10', times: ['4w', '12w', '24w'] },
  { key: 'nausea', label: 'Chemotherapy-related nausea / vomiting', max: 10, unit: 'severity / 10', times: ['4w', '12w', '24w'] },
  { key: 'handFoot', label: 'Chemotherapy-related hand–foot syndrome', max: 10, unit: 'severity / 10', times: ['4w', '12w', '24w'] },
] as const;
type Outcome = typeof outcomes[number]['key'];
type Snapshot = {
  id: number; name: string; caseTitle: string; context: string; country: string;
  labels: Record<keyof Priorities, string>; weights: Priorities; scores: number[]; optionLabels: string[];
  avoided: Avoidance[];
  patientId: string;
  personalPriorities: string;
};

export default function SharedDecision() {
  const [theme, setTheme] = useState('light');
  const [step, setStep] = useState('worklist');
  const [countryName, setCountry] = useState<Country>('Germany');
  const [caseId, setCaseId] = useState<CaseId>('neuropathy');
  const [weights, setWeights] = useState<Priorities>(initialPriorities);
  const [avoided, setAvoided] = useState<Avoidance[]>([]);
  const [personalPriorities, setPersonalPriorities] = useState('');
  const [outcomeKey, setOutcomeKey] = useState<Outcome>('fatigue');
  const [term, setTerm] = useState<keyof typeof data.terms>('Adjuvant therapy');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState('undecided');
  const [notes, setNotes] = useState<string>(data.priorityCases[0].note);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [consent, setConsent] = useState(false);
  const [contributed, setContributed] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotName, setSnapshotName] = useState('');
  const snapshotId = useRef(0);
  const country = data.countries.find((item) => item.name === countryName)!;
  const priorityCase = data.priorityCases.find((item) => item.id === caseId)!;
  const patient = patients.find((item) => item.id === priorityCase.patientId)!;
  const caseCriteria = criteria.map((item) => ({ ...item, label: priorityCase.labels[item.key] }));
  const scores = preferenceScores(weights, priorityCase.scores, avoided, data.options.map((option) => option.avoidanceFit));
  const outcome = outcomes.find((item) => item.key === outcomeKey)!;
  const avoidanceLabels = (keys: readonly Avoidance[]) => avoidanceControls.filter((item) => keys.includes(item.key)).map((item) => item.label).join(', ') || 'None';
  const bestFits = country.labels.filter((_, i) => scores[i] === Math.max(...scores));
  const topPriorities = caseCriteria.filter((item) => weights[item.key] === Math.max(...Object.values(weights)));
  const comparable = data.comparablePatients.filter((record) => caseId === 'neuropathy' && Math.abs(record.age - patient.age) <= 5 &&
    record.stage === 'III' && topPriorities.some((item) => item.key === record.priority));
  const invalidateDecision = () => { setReceipt(''); setConfirmed(false); setConsent(false); setContributed(false); };
  const resetDraft = () => { setResult(null); setError(''); setStarted(false); invalidateDecision(); };
  const changeWeights = (next: Priorities) => { setWeights(next); resetDraft(); };
  const changeCase = (next: CaseId) => {
    setCaseId(next); setWeights(initialPriorities); setAvoided([]); setChoice('undecided');
    setSnapshotName(''); setPersonalPriorities('');
    setNotes(data.priorityCases.find((item) => item.id === next)!.note); resetDraft();
  };
  const selectPatient = (id: string) => {
    const next = data.priorityCases.find((item) => item.patientId === id)!;
    if (next.id !== caseId) changeCase(next.id);
  };
  const saveSnapshot = () => {
    const id = ++snapshotId.current;
    setSnapshots((saved) => [...saved, {
      id, name: snapshotName.trim() || `Combination ${id}`, patientId: patient.id,
      caseTitle: `${patient.name} · ${priorityCase.title}`, context: `${patient.minimal} ${patient.details} ${priorityCase.context}`,
      country: countryName, labels: { ...priorityCase.labels }, weights: { ...weights }, scores: [...scores],
      optionLabels: [...country.labels], avoided: [...avoided], personalPriorities: personalPriorities.trim(),
    }]);
    setSnapshotName('');
  };
  const explain = async () => {
    setBusy(true); setStarted(true); setRuns((n) => n + 1); setError(''); setResult(null);
    try {
      setResult(await request<AgentResult>('/api/ideas/104/explain', {
        method: 'POST', body: JSON.stringify({ country: countryName, horizon: 'future', patient_id: patient.id, priorities: weights, avoided_effects: avoided, personal_priorities: personalPriorities.trim() }),
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
      patient={{ ...patient, ward: 'Colorectal consultation · Room 2' }}
      guide={<StoryGuide steps={steps} current={step} onGo={setStep} nextLabel={step === 'worklist' ? `Open ${patient.name}’s consultation` : undefined} />}
      toolbar={<><label>Country <select value={countryName} disabled={busy} onChange={(event) => { setCountry(event.target.value as Country); resetDraft(); }}>
        {data.countries.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
        <label>Patient <select aria-label="Patient" value={patient.id} disabled={busy} onChange={(event) => selectPatient(event.target.value)}>
          {patients.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.age} · {data.priorityCases.find((profile) => profile.patientId === item.id)!.title}</option>)}</select></label><span className="hx-spacer" />
        {['light', 'dark'].map((value) => <button key={value} className="hx-btn" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</>}>
      <div id="sdm-task" tabIndex={-1}><h1>{steps.find((item) => item.id === step)?.title}</h1>
        <div className="sdm-attention"><Pill tone="warn">Human review required</Pill> Synthetic estimates · no validated prediction model</div>
        <small>{patient.details} {priorityCase.context} Each patient has a fixed synthetic record. Shared teaching outcome figures are not personalised to these patients.</small>
      </div>
      {step === 'worklist' && <>
        <Panel title="Colorectal clinic · post-MDT"><div className="sdm-scroll"><table className="hx-table"><caption>Synthetic consultations</caption>
          <thead><tr><th>Time</th><th>Patient</th><th>MDT outcome</th><th>Action</th></tr></thead><tbody>
            {patients.map((item, i) => <tr key={item.id}><td>{['09:30', '10:00', '10:30'][i]}</td><td>{item.name} · {item.age}</td>
              <td>{item.diagnosis}<small>{data.priorityCases.find((profile) => profile.patientId === item.id)!.title}</small></td>
              <td><button className="hx-btn primary" disabled={busy} onClick={() => { selectPatient(item.id); setStep('options'); }}>Open {item.name}</button></td></tr>)}
          </tbody></table></div></Panel>
        <Panel title={`${patient.name} · MDT outcome`}><p>{patient.mdt}</p>{why(`${patient.minimal} ${priorityCase.context}`)}</Panel>
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
            <h4>Side effects at week 12 · invented severity</h4>
            <div className="sdm-side-effect-chips">{outcomes.filter((item) => item.max === 10).map((effect) => <div className="sdm-side-effect-chip" key={effect.key}>
              <span className="sdm-chip-marker" aria-hidden="true" /><strong>{effect.label.replace('Chemotherapy-related ', '')}</strong>
              <span className="sdm-severity-score">{option.trajectories[effect.key][1]} / 10</span>
            </div>)}</div>
            {why(`${option.benefit} ${option.burden} Fixed invented figures, not personal predictions. No additional chemotherapy avoids chemotherapy toxicity, not existing symptoms or cancer risk; follow-up continues.`)}
          </section>)}</div>
        </Panel>
        <Panel title="Outcomes over time · synthetic simulation">
          <label>Plot outcome <select aria-label="Plot outcome" value={outcomeKey} onChange={(event) => setOutcomeKey(event.target.value as Outcome)}>
            {outcomes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <small>{outcome.label} · {outcome.unit} · invented, not validated. {outcome.max === 10 ? '0 none, 10 severe; chemotherapy effects only except fatigue. Zero does not exclude other symptoms.' : 'Cumulative invented population figures, not personal predictions.'}</small>
          <div className="sdm-recovery">{data.options.map((option, i) => <figure key={option.id}><figcaption>{country.labels[i]}</figcaption>
            <svg viewBox="0 0 240 125" role="img" aria-label={`${country.labels[i]} ${outcome.label} at ${outcome.times.join(', ')}: ${option.trajectories[outcomeKey].join(', ')}; ${outcome.unit}; invented`}>
              <path d="M20 10V100H220" className="sdm-axis" />
              <polyline points={option.trajectories[outcomeKey].map((value, j) => `${30 + j * 90},${100 - value / outcome.max * 80}`).join(' ')} className="sdm-line" />
              {option.trajectories[outcomeKey].map((value, j) => <g key={j}><circle cx={30 + j * 90} cy={100 - value / outcome.max * 80} r="4" /><text x={30 + j * 90} y={90 - value / outcome.max * 80}>{value}</text><text x={30 + j * 90} y="118">{outcome.times[j]}</text></g>)}
            </svg></figure>)}</div>
          {why('Lines connect invented teaching samples only. Side-effect severity is not incidence, probability or a validated scale. Survival/recurrence use years 1, 3 and 5; symptoms use weeks 4, 12 and 24. Equal hair-loss, nausea and hand–foot curves do not establish equal regimen risks. No clinical model is connected.')}
          <details className="sdm-why"><summary>Side-effect definitions and reference</summary>
            {data.sideEffects.map((effect) => <p key={effect.name}><strong>{effect.name}:</strong> {effect.description}</p>)}
            <a href={data.sideEffectReference.url} target="_blank" rel="noreferrer">{data.sideEffectReference.title} ↗</a>
            <p>{data.sideEffectReference.limitation} This reference does not validate any plotted numbers.</p>
          </details>
        </Panel>
        <Panel title="Evidence · inspect before use"><div className="sdm-evidence-sources">
          <section><h4>Guidelines / trials</h4><Pill tone="warn">Unverified pointer</Pill>{why(country.summary + ' Full guideline texts and trial results have not been reviewed.')}</section>
          <section><h4>Prediction model</h4><Pill tone="warn">Not connected</Pill>{why('Inputs would include age, stage, molecular findings, fitness and renal function. Model version, calibration and uncertainty intervals are unavailable; local validation and clinician review are required.')}</section>
          <section><h4>Patients like me</h4><Pill>Simulated examples</Pill><button className="hx-btn" onClick={() => setStep('patients')}>Explore comparable cases</button></section>
        </div></Panel>
      </>}
      {step === 'priorities' && <><div className="sdm-columns"><Panel title="Share ten priority points">
        <p>Increase one slider; the others give up points. Outcomes do not change.</p>
        <div className="sdm-budget" role="img" aria-label={caseCriteria.map((item) => `${item.label} ${weights[item.key]} of 10`).join(', ')}>
          {caseCriteria.map((item, i) => <span key={item.key} className={`sdm-budget-${i}`} style={{ flexGrow: weights[item.key] }} />)}
        </div>
        {caseCriteria.map((item, i) => <div className={`sdm-priority sdm-criterion-${i}`} key={item.key}><label htmlFor={`sdm-${item.key}`}><span className="sdm-colour-key" />{item.label}<strong>{weights[item.key]} / 10</strong></label>
          <input id={`sdm-${item.key}`} type="range" min="0" max="10" step="1" value={weights[item.key]} disabled={busy}
            onChange={(event) => changeWeights(rebalancePriorities(weights, item.key, Number(event.target.value)))} /></div>)}
        <div className="sdm-presets"><button className="hx-btn" disabled={busy} onClick={() => changeWeights({ quality: 1, survivalFit: 8, mobility: 1 })}>Try: survival first</button>
          <button className="hx-btn" disabled={busy} onClick={() => changeWeights({ quality: 5, survivalFit: 0, mobility: 5 })}>Try: side effects first</button>
          <button className="hx-btn" disabled={busy} onClick={() => { setAvoided([]); setPersonalPriorities(''); changeWeights(initialPriorities); }}>Reset priorities</button></div>
        <label className="sdm-personal-priorities" htmlFor="sdm-personal-priorities">In your own words
          <textarea id="sdm-personal-priorities" rows={3} maxLength={1000} value={personalPriorities} disabled={busy}
            placeholder="e.g. I want enough energy to attend my daughter's graduation."
            onChange={(event) => { setPersonalPriorities(event.target.value); resetDraft(); }} />
        </label>
        <small>Use synthetic examples only. Saved for the conversation, snapshots and assistant explanation; not scored or used to change medical estimates.</small>
        <fieldset className="sdm-avoidance"><legend>Additional side-effect concerns</legend>
          <div className="sdm-concern-cards">{avoidanceControls.map((item) => <button key={item.key} type="button" className="sdm-concern-card"
            role="switch" aria-checked={avoided.includes(item.key)} disabled={busy}
            onClick={() => { setAvoided((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key]); resetDraft(); }}>
            <span className="sdm-switch-track" aria-hidden="true"><span /></span>
            <strong>{item.label}</strong><span className="sdm-concern-state">{avoided.includes(item.key) ? 'Included in my priorities' : 'Add to my priorities'}</span>
          </button>)}</div>
          <small>Select what matters to you. Each included concern adds one preference point beyond the ten slider points; medical outcomes stay fixed.</small>
        </fieldset>
        {why(`Additional fit assumptions (0–10): ${data.options.map((option, i) => `${country.labels[i]}: ${avoidanceControls.map((item) => `${item.label} ${option.avoidanceFit[item.key]}`).join(', ')}`).join('; ')}. Each selected concern adds one weighted point; divide the combined score by 10 plus the enabled switch count, then scale to 100. Scores are invented preferences, not toxicity predictions. Selected: ${avoidanceLabels(avoided)}.`)}
        {why(`Total = 10 points. Remaining points redistribute proportionally, rounded; an empty pair splits evenly. Case-specific invented scores in slider order: ${priorityCase.scores.map((option, i) => `${country.labels[i]}: ${caseCriteria.map((item) => option[item.key]).join('/')}`).join('; ')}. Fit = weighted sum of these scores; not clinical evidence or a model of side effects or recurrence. Equal hair-loss/nausea scores for the chemotherapy choices do not establish equal clinical risk. Regimen-specific likelihoods need clinician verification. Costs unavailable.`)}
      </Panel><Panel title="How the comparison changes">{fitPlot}
        {why('Higher survival weighting favours longer treatment in this invented scenario; side-effect weighting can favour no additional chemotherapy. This is patient-value fit, not evidence of a best treatment.')}
      </Panel></div>
        <Panel title="Compare saved combinations">
          <div className="sdm-assistant-controls"><label>Snapshot name <input value={snapshotName} maxLength={80} onChange={(event) => setSnapshotName(event.target.value)} placeholder="e.g. Side effects first" /></label>
            <button className="hx-btn primary" onClick={saveSnapshot}>Save current combination</button></div>
          <small>Saved snapshots stay unchanged as sliders move. Local to this visit; each is labelled with its patient. Different patients use different fit assumptions; cross-patient snapshots are not personal outcome comparisons.</small>
          <div className="sdm-snapshots">
            <section className="sdm-snapshot"><h4>Current combination</h4><small>{patient.name} · {priorityCase.title} · {countryName}</small>
              {caseCriteria.map((item) => <p key={item.key}>{item.label}: <strong>{weights[item.key]} / 10</strong></p>)}<p>Additional concerns: {avoidanceLabels(avoided)}</p>{fitPlot}
              {personalPriorities.trim() && <p className="sdm-personal-note"><strong>In your own words:</strong> {personalPriorities.trim()}</p>}
            </section>
            {snapshots.map((snapshot) => <section className="sdm-snapshot" key={snapshot.id} aria-label={`Snapshot ${snapshot.name}`}>
              <h4>{snapshot.name}</h4><small>{snapshot.caseTitle} · {snapshot.country}</small>
              {criteria.map((item) => <p key={item.key}>{snapshot.labels[item.key]}: <strong>{snapshot.weights[item.key]} / 10</strong></p>)}
              <p>Additional concerns: {avoidanceLabels(snapshot.avoided)}</p>
              {snapshot.personalPriorities && <p className="sdm-personal-note"><strong>In your own words:</strong> {snapshot.personalPriorities}</p>}
              <div className="sdm-live-fit"><strong>Saved fit · not a probability</strong>
                {snapshot.optionLabels.map((label, i) => <div className="sdm-fit" key={label}><span>{label}</span><strong>{snapshot.scores[i]} / 100</strong>
                  <progress max="100" value={snapshot.scores[i]} aria-label={`${snapshot.name}: ${label} saved preference fit`} /></div>)}
                <small>Closest fit: {snapshot.optionLabels.filter((_, i) => snapshot.scores[i] === Math.max(...snapshot.scores)).join(' / ')}</small>
              </div>
              <details className="sdm-why"><summary>Saved context</summary><p>Patient: {snapshot.patientId}</p><p>{snapshot.context}</p><p>Synthetic preference fit only. No treatment decision was recorded by saving this snapshot.</p></details>
              <button className="hx-btn" onClick={() => setSnapshots((saved) => saved.filter((item) => item.id !== snapshot.id))}>Remove {snapshot.name}</button>
            </section>)}
          </div>
          {!snapshots.length && <p>Save one combination, change the sliders, then save another to compare side by side.</p>}
        </Panel></>}
      {step === 'patients' && <Panel title="Patients like me · synthetic European examples">
        <p>{comparable.length} matches for {patient.name} · age {patient.age - 5}–{patient.age + 5} · stage III · {topPriorities.map((item) => item.label).join(' / ')}</p>
        {caseId !== 'neuropathy' && <p>No synthetic records capture hair-loss or nausea priorities. Neuropathy examples are not relabelled as matches.</p>}
        <small>Selection uses age within five years, stage III and top slider priorities only. Similarity also compares the six clinical characteristics below; it does not change selection. Equal-weight demo score, not treatment suitability or an outcome prediction.</small>
        <div className="sdm-option-cards">{data.options.map((option, i) => <section key={option.id}><h3>{country.labels[i]}</h3>
          <div className="sdm-match-count"><strong>{comparable.filter((patient) => patient.option === option.id).length}</strong> synthetic cases</div>
          {comparable.filter((record) => record.option === option.id).map((record) => {
            const characteristics = Object.entries(data.comparableCharacteristics[record.id]).map(([key, value]) => {
              const current: string = patient.characteristics[key as keyof typeof patient.characteristics];
              const status = value === 'Not recorded' || current === 'Not recorded' ? 'Unknown' : value === current ? 'Matches' : 'Differs';
              return { key, value, current, status };
            });
            const known = 3 + characteristics.filter((item) => item.status !== 'Unknown').length;
            const matched = 3 + characteristics.filter((item) => item.status === 'Matches').length;
            return <details className="sdm-case" key={record.id}><summary>
              <span>{record.age} years · {record.site.split(' · ')[0]}</span>
              <strong className="sdm-similarity">{Math.round(matched / known * 100)}% similarity</strong>
              <small>{matched} / {known} known characteristics match · {9 - known} unknown</small>
            </summary>
            <p>{record.outcome}</p><small>{record.id} · {caseCriteria.find((item) => item.key === record.priority)?.label}</small>
            <p><strong>Selection matches:</strong> Stage III; age {record.age} vs {patient.name} {patient.age} ({Math.abs(record.age - patient.age)} years apart); shared top slider priority.</p>
            <dl className="sdm-characteristics">{characteristics.map(({ key, value, current, status }) =>
              <div key={key}><dt>{key} · {status}</dt><dd>Case: {value} · {patient.name}: {current}</dd></div>)}</dl>
            <p><strong>Similarity calculation:</strong> {matched} matching ÷ {known} known checks × 100, rounded.
              Age within five years, stage III and any shared top slider priority each count once; diagnosis, sex, pTNM, MMR, ECOG and renal function require exact matches.
              All nine checks have equal weight; unknown values are excluded, not assumed to match.
              Avoidance switches and free text are not scored. This synthetic comparison is not a validated clinical measure.</p>
          </details>;
          })}
        </section>)}</div>
        <button className="hx-btn" onClick={() => setStep('priorities')}>Change priorities to explore other cases</button>
        {why('Local invented cases only: age within five years, stage III and any tied highest priority. Different follow-up, missing outcomes and selection bias prevent causal comparisons. No real hospital query or pooled outcome probability.')}
      </Panel>}
      {step === 'decision' && <Panel title="Your joint decision"><div className="sdm-decision">
        <label>Choice <select value={choice} onChange={(event) => { setChoice(event.target.value); invalidateDecision(); }}><option value="undecided">Defer — another conversation</option>
          {data.options.map((option, i) => <option key={option.id} value={option.id}>{country.labels[i]}</option>)}</select></label>
        <label>Priorities and next steps<textarea rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); invalidateDecision(); }} /></label>
        <label><input type="checkbox" checked={confirmed} onChange={(event) => { invalidateDecision(); setConfirmed(event.target.checked); }} /> Patient and clinician reviewed options and uncertainty together.</label>
        <p className="sdm-personal-note"><strong>In your own words:</strong> {personalPriorities.trim() || 'Not added'}</p>
        <button className="hx-btn primary" disabled={!confirmed || !notes.trim()} onClick={() => { setConsent(false); setContributed(false); setReceipt(`${choice === 'undecided' ? 'Decision deferred' : country.labels[data.options.findIndex((option) => option.id === choice)]} · ${countryName} · ${patient.name} (${patient.id}) · ${priorityCase.title}. ${notes} Priorities: ${caseCriteria.map((item) => `${item.label} ${weights[item.key]}/10`).join(', ')}. Additional concerns: ${avoidanceLabels(avoided)}. In your own words: ${personalPriorities.trim() || 'Not added'}. Unverified guidelines; no prediction model; synthetic examples only.`); }}>Record joint decision · demo</button>
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
