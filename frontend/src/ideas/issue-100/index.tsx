import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult } from '../../api';
import type { IdeaMeta } from '../index';
import './trust.css';

export const meta: IdeaMeta = {
  id: '100',
  issue: 100,
  title: 'Can we trust these research numbers?',
  tagline: 'See where a hospital count came from, what disagrees, and how that changes a research result.',
};

type Horizon = 'future' | 'six-months';
type Theme = 'light' | 'dark';
type Step = 'question' | 'evidence' | 'rule' | 'analysis';
type RuleStatus = 'unreviewed' | 'approved' | 'dismissed';
type MinimalDataset = {
  groups: { elements: { name: string; likely_source: string }[] }[];
  not_in_minimal_dataset: string[];
};

const dimensions = [
  { label: 'Provenance', weight: 0.2, rating: 90, note: 'The reported value traces to an EMR coding chain.' },
  { label: 'Independent corroboration', weight: 0.18, rating: 35, note: 'Six records represent only three independent evidence chains.' },
  { label: 'Source reputation', weight: 0.14, rating: 85, note: 'The EMR is a strong source for coded counts.' },
  { label: 'Semantic consistency', weight: 0.18, rating: 75, note: 'Hospital A and B do not count the same procedure definition.' },
  { label: 'Incentive exposure', weight: 0.12, rating: 70, note: 'The threshold creates a reason to scrutinise the measure, not infer intent.' },
  { label: 'Threshold proximity', weight: 0.12, rating: 15, note: '30 is exactly the reporting threshold.' },
  { label: 'Evidence completeness', weight: 0.08, rating: 15, note: 'The OR log and pathology record disagree with the reported count.' },
];
const trustScore = Math.round(dimensions.reduce((total, item) => total + item.weight * item.rating, 0));
const hospitalACounts: [number, number][] = [[27, 0.1], [28, 0.35], [29, 0.35], [30, 0.2]];
const hospitalBCounts: [number, number][] = [[28, 0.12], [29, 0.64], [30, 0.24]];

const sources = [
  { name: 'EMR coding', count: 30, parent: 'Independent source', chain: 'A' },
  { name: 'Cancer registry', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Department Excel', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Research extract', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Operating-room log', count: 29, parent: 'Independent source', chain: 'B' },
  { name: 'Pathology', count: 28, parent: 'Independent source', chain: 'C' },
];

const story = [
  { id: 'question' as const, title: 'Compare two hospitals', description: 'A researcher asks whether procedure volume relates to patient outcome.' },
  { id: 'evidence' as const, title: 'Inspect the count', description: 'Six records show 30, but several copies come from the same source.' },
  { id: 'rule' as const, title: 'Review the local rule', description: 'A simulated data manager explains why two procedures were included.' },
  { id: 'analysis' as const, title: 'Carry uncertainty through', description: 'Compare the result from raw values with 500 plausible datasets.' },
];

function randomGenerator(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function sampleCount(random: () => number, options: [number, number][]) {
  const draw = random();
  let cumulative = 0;
  for (const [count, probability] of options) {
    cumulative += probability;
    if (draw <= cumulative) return count;
  }
  return options[options.length - 1][0];
}

function simulateAnalysis(): { estimate: number; lower: number; upper: number } {
  const random = randomGenerator(20261006);
  const estimates = Array.from({ length: 500 }, () => {
    const countA = sampleCount(random, hospitalACounts);
    const countB = sampleCount(random, hospitalBCounts);
    const normal = Math.sqrt(-2 * Math.log(Math.max(random(), 0.0001))) * Math.cos(2 * Math.PI * random());
    return 10 + (countA - 28.65) * 3 + (countB - 29.12) * -2 + normal * 5.8;
  }).sort((a, b) => a - b);
  const average = estimates.reduce((sum, estimate) => sum + estimate, 0) / estimates.length;
  return {
    estimate: Math.round(average),
    lower: Math.round(estimates[Math.floor(estimates.length * 0.025)]),
    upper: Math.round(estimates[Math.floor(estimates.length * 0.975)]),
  };
}

function agentText(result: AgentResult) {
  return result.blocks
    .map((block) => [block.title, block.body, ...block.items.map((item) => `${item.label}: ${item.detail ?? ''}`)].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

export default function DataTrust() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('issue-100-theme') === 'dark' ? 'dark' : 'light'));
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [step, setStep] = useState<Step>('question');
  const [showEvidence, setShowEvidence] = useState(false);
  const [managerAsked, setManagerAsked] = useState(false);
  const [managerResult, setManagerResult] = useState<AgentResult | null>(null);
  const [managerLoading, setManagerLoading] = useState(false);
  const [managerError, setManagerError] = useState('');
  const [ruleStatus, setRuleStatus] = useState<RuleStatus>('unreviewed');
  const [editingRule, setEditingRule] = useState(false);
  const [ruleText, setRuleText] = useState('Procedure Y + additional bowel resection → counted locally as X');
  const [naiveResult, setNaiveResult] = useState(false);
  const [uncertaintyResult, setUncertaintyResult] = useState<ReturnType<typeof simulateAnalysis> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [minimalDataset, setMinimalDataset] = useState<MinimalDataset | null>(null);

  const currentIndex = story.findIndex((item) => item.id === step);
  useEffect(() => {
    api.sampleData<MinimalDataset>('minimal-mdt-dataset.json').then(setMinimalDataset).catch(() => setMinimalDataset(null));
  }, []);
  const coverage = useMemo(() => {
    const elements = new Map(minimalDataset?.groups.flatMap((group) => group.elements.map((element) => [element.name, element.likely_source] as const)));
    const liveQuery = minimalDataset?.not_in_minimal_dataset.find((item) => item.startsWith('Live queries across hospitals'));
    return [
      { label: 'Treating hospital', source: elements.get('Treating hospital') ?? (minimalDataset ? 'Not listed' : 'Could not load dataset'), state: minimalDataset ? (elements.has('Treating hospital') ? 'Available' : 'Missing') : 'Dataset unavailable' },
      { label: 'Surgery yes/no', source: elements.get('Surgery yes/no') ?? (minimalDataset ? 'Not listed' : 'Could not load dataset'), state: minimalDataset ? (elements.has('Surgery yes/no') ? 'Available' : 'Missing') : 'Dataset unavailable' },
      { label: 'Qualifying procedure count', source: elements.get('Qualifying procedure count') ?? (minimalDataset ? 'Not listed' : 'Could not load dataset'), state: minimalDataset ? (elements.has('Qualifying procedure count') ? 'Available' : 'Hospital must add') : 'Dataset unavailable' },
      { label: 'Source and counting definition', source: 'Hospital-reported', state: 'Hospital must record' },
      { label: 'Live cross-hospital query', source: liveQuery ?? (minimalDataset ? 'Not in minimal dataset' : 'Could not load dataset'), state: minimalDataset ? 'Future only' : 'Dataset unavailable' },
    ];
  }, [minimalDataset]);

  const changeTheme = (next: Theme) => {
    localStorage.setItem('issue-100-theme', next);
    setTheme(next);
  };

  const askManager = async () => {
    setManagerAsked(true);
    setManagerLoading(true);
    setManagerError('');
    try {
      setManagerResult(await api.askIssue100({ task: 'Ask the local data manager why Hospital A includes procedure Y cases.' }));
    } catch {
      setManagerError('The assistant could not be reached. The synthetic manager response is still available below.');
    } finally {
      setManagerLoading(false);
    }
  };

  const runUncertaintyAnalysis = () => {
    setAnalysisLoading(true);
    window.setTimeout(() => {
      setUncertaintyResult(simulateAnalysis());
      setAnalysisLoading(false);
    }, 350);
  };

  const managerNarrative = managerResult?.mode === 'copilot' ? agentText(managerResult) : '';

  return (
    <div className="dt-workspace" data-theme={theme}>
      <a className="dt-skip" href="#dt-main">Skip to research workspace</a>
      <div className="dt-prototype-strip">
        <span>HACKATHON PROTOTYPE · SYNTHETIC DATA · NOT FOR CLINICAL USE</span>
        <span>Research evidence workspace · Munich</span>
      </div>
      <header className="dt-header">
        <div className="dt-brand">
          <span className="dt-brand-mark">HR</span>
          <div><strong>Health Rewired</strong><span>Federated oncology research</span></div>
        </div>
        <div className="dt-header-controls">
          <div className="dt-toggle-group" aria-label="Time horizon">
            <button type="button" aria-pressed={horizon === 'six-months'} onClick={() => setHorizon('six-months')}>In six months</button>
            <button type="button" aria-pressed={horizon === 'future'} onClick={() => setHorizon('future')}>The future</button>
          </div>
          <div className="dt-toggle-group" aria-label="Workspace theme">
            <button type="button" aria-pressed={theme === 'light'} onClick={() => changeTheme('light')}>Light</button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => changeTheme('dark')}>Dark</button>
          </div>
        </div>
      </header>
      <main id="dt-main" className="dt-main">
        <section className="dt-context">
          <div>
            <p className="dt-eyebrow">MULTI-HOSPITAL STUDY · SYNTHETIC EXAMPLE</p>
            <h1>Does procedure volume relate to patient outcome?</h1>
            <p>Before comparing results, check how much evidence supports each hospital's count.</p>
          </div>
          <div className="dt-context-meta"><span>2 hospitals</span><span>Colorectal oncology</span><span>Research question R-204</span></div>
        </section>

        <section className="dt-story" aria-label="Guided walkthrough">
          <div className="dt-story-steps">
            {story.map((item, index) => (
              <button type="button" key={item.id} className={step === item.id ? 'is-current' : index < currentIndex ? 'is-done' : ''} onClick={() => setStep(item.id)}>
                <span>{index < currentIndex ? '✓' : index + 1}</span>{item.title}
              </button>
            ))}
          </div>
          <div className="dt-story-current">
            <span className="dt-eyebrow">GUIDED REVIEW · STEP {currentIndex + 1} OF {story.length}</span>
            <p>{story[currentIndex].description}</p>
            <div className="dt-story-actions">
              {currentIndex > 0 && <button type="button" className="dt-button" onClick={() => setStep(story[currentIndex - 1].id)}>← Back</button>}
              {currentIndex < story.length - 1 && <button type="button" className="dt-button dt-primary" onClick={() => setStep(story[currentIndex + 1].id)}>Next: {story[currentIndex + 1].title} →</button>}
            </div>
          </div>
        </section>

        {horizon === 'six-months' && (
          <section className="dt-horizon-panel">
            <div>
              <p className="dt-eyebrow">WHAT WORKS WITH THE MINIMAL MDT DATASET</p>
              <strong>Counts can be compared if each hospital supplies the number, source and counting definition.</strong>
              <p>The dataset includes treating hospital and surgery yes/no, but not this qualifying-procedure count.</p>
            </div>
            <ul>
              {coverage.map((item) => (
                <li key={item.label}><span className={item.state === 'Available' ? 'dt-state-ok' : 'dt-state-warn'}>{item.state}</span><span>{item.label}</span><small>{item.source}</small></li>
              ))}
            </ul>
            <p className="dt-hospital-ask"><strong>What hospitals need to do:</strong> map the procedure codes, send the aggregate count, and state which procedures it includes. Live OR/pathology cross-checks and a live manager interview come later.</p>
          </section>
        )}

        {step === 'question' && (
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div><p className="dt-eyebrow">THE CLAIM UNDER REVIEW</p><h2>Qualifying oncology procedures</h2></div>
              <span className="dt-status dt-warning">Threshold needs scrutiny</span>
            </div>
            <p className="dt-panel-intro">Hospital A reports exactly the regulatory minimum. The number is not an accusation; it is a reason to inspect the evidence and definition.</p>
            <div className="dt-site-grid">
              <article className="dt-site-card">
                <div><span className="dt-eyebrow">HOSPITAL A · SYNTHETIC</span><span className="dt-status dt-warning">At reporting threshold</span></div>
                <strong>{ruleStatus === 'approved' ? '28' : '30'} <small>procedures</small></strong>
                <p>{ruleStatus === 'approved' ? 'Shared definition applied · was reported as 30' : 'Reported count · regulatory minimum'}</p>
                <button type="button" className="dt-text-button" onClick={() => { setStep('evidence'); setShowEvidence(true); }}>Inspect evidence →</button>
              </article>
              <article className="dt-site-card">
                <div><span className="dt-eyebrow">HOSPITAL B · SYNTHETIC</span><span className="dt-status dt-neutral">Comparison site</span></div>
                <strong>29 <small>procedures</small></strong>
                <p>Uses the shared procedure definition</p>
                <button type="button" className="dt-text-button" onClick={() => { setStep('evidence'); setShowEvidence(true); }}>Compare sources →</button>
              </article>
              <button type="button" className="dt-claim-card" title="Trust is a fixed, visible rule-of-thumb assessment of evidence for this claim." aria-label={`Inspect the claim with trust ${trustScore} out of 100 and assessment confidence 92 out of 100`} onClick={() => { setStep('evidence'); setShowEvidence(true); }}>
                <span className="dt-eyebrow">CLAIM-LEVEL ASSESSMENT · HOSPITAL A</span>
                <span className="dt-claim-scores"><span><strong>{trustScore}</strong><small>Trust / 100</small></span><span><strong>92</strong><small>Confidence / 100</small></span></span>
                <span className="dt-claim-hint">Select to inspect why the evidence supports the claim only partly.</span>
              </button>
            </div>
            <div className="dt-callout"><strong>Trust belongs to this claim, for this research question.</strong> It is not a rating of a hospital or its people.</div>
          </section>
        )}

        {step === 'evidence' && (
          <section className="dt-evidence-layout">
            <article className="dt-panel">
              <div className="dt-panel-heading">
                <div><p className="dt-eyebrow">CLAIM-LEVEL ASSESSMENT</p><h2>Hospital A · 30 qualifying procedures</h2></div>
                <span className="dt-status dt-warning">Worth a closer look</span>
              </div>
              <div className="dt-score-row">
                <div className="dt-score"><strong>{trustScore}</strong><span>Trust / 100</span></div>
                <div className="dt-score"><strong>92</strong><span>Confidence / 100</span></div>
                <p>Trust measures how strongly evidence supports this claim. Confidence measures how complete the assessment is. They answer different questions.</p>
              </div>
              <h3>What makes up the trust score</h3>
              <div className="dt-dimensions">
                {dimensions.map((item) => (
                  <div className="dt-dimension" key={item.label} title={item.note}>
                    <span>{item.label}<small>{item.note}</small></span>
                    <span>{item.weight * 100}%</span>
                    <div className="dt-meter"><i style={{ width: `${item.rating}%` }} /></div>
                    <strong>{item.rating}</strong>
                  </div>
                ))}
              </div>
              <p className="dt-method-note">Fixed demo rule: each rating × visible weight, rounded to a whole number. These starting weights are a rule of thumb, not calibrated clinical evidence.</p>
              <button type="button" className="dt-button" onClick={() => setShowEvidence((shown) => !shown)}>{showEvidence ? 'Hide source records' : 'Open source records and lineage'}</button>
            </article>
            <aside className="dt-panel dt-lineage">
              <p className="dt-eyebrow">EVIDENCE · SAME NUMBER, DIFFERENT SOURCES</p>
              <h2>Only three independent chains</h2>
              <p>Registry, Excel and research extract all trace back to the same EMR coding.</p>
              <div className="dt-lineage-roots">
                <div className="dt-lineage-root"><strong>EMR coding</strong><span>30 · independent chain A</span>
                  <div className="dt-lineage-children"><span>Cancer registry · 30</span><span>Department Excel · 30</span><span>Research extract · 30</span></div>
                </div>
                <div className="dt-lineage-root"><strong>Operating-room log</strong><span>29 · chain B</span></div>
                <div className="dt-lineage-root"><strong>Pathology</strong><span>28 · chain C</span></div>
              </div>
              <p className="dt-caution">Six records agreeing does not mean six independent confirmations.</p>
            </aside>
            {showEvidence && (
              <div className="dt-panel dt-source-table">
                <p className="dt-eyebrow">SOURCE RECORDS · ALL SYNTHETIC</p>
                <h2>What each system reported</h2>
                <div className="dt-table-wrap"><table>
                  <caption>Reported qualifying procedure counts and their shared source lineage</caption>
                  <thead><tr><th>Source</th><th>Count</th><th>Evidence chain</th><th>Relationship</th></tr></thead>
                  <tbody>{sources.map((source) => <tr key={source.name}><td>{source.name}</td><td><strong>{source.count}</strong></td><td>Chain {source.chain}</td><td>{source.parent}</td></tr>)}</tbody>
                </table></div>
                <p className="dt-threshold-note">The reported 30 matches the threshold. The operating-room log reports 29 and pathology reports 28. Differences are signals to reconcile, not evidence of intent.</p>
              </div>
            )}
          </section>
        )}

        {step === 'rule' && (
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div><p className="dt-eyebrow">LOCAL MEANING · HUMAN REVIEW REQUIRED</p><h2>Why does Hospital A include those cases?</h2></div>
              <span className={`dt-status ${ruleStatus === 'approved' ? 'dt-success' : ruleStatus === 'dismissed' ? 'dt-neutral' : 'dt-warning'}`}>{ruleStatus === 'approved' ? 'Approved by you' : ruleStatus === 'dismissed' ? 'Dismissed by you' : 'Candidate · not approved'}</span>
            </div>
            {horizon === 'six-months' ? (
              <div className="dt-six-months-blocked">
                <strong>Live manager interviews are not part of the minimal dataset.</strong>
                <p>This step is shown but unavailable in six months. Hospitals can still record the counting definition alongside the aggregate they send.</p>
              </div>
            ) : (
              <>
                {!managerAsked && <div className="dt-manager-prompt"><p>Ask the simulated Hospital A data manager why procedure Y is included in the qualifying count.</p><button type="button" className="dt-button dt-primary" disabled={managerLoading} onClick={askManager}>{managerLoading ? <><span className="dt-spinner" /> Asking the simulated manager…</> : 'Ask the local data manager'}</button></div>}
                {managerLoading && <div className="dt-working" role="status"><span className="dt-spinner" /> Asking the synthetic data manager and preparing a candidate rule. Copilot answers can take up to a minute.</div>}
                {managerAsked && !managerLoading && (
                  <div className="dt-manager-result">
                    <div className="dt-manager-quote"><span className="dt-eyebrow">SIMULATED DATA MANAGER · HOSPITAL A</span><blockquote>“We count procedure Y as X when an additional bowel resection is performed.”</blockquote><small>Interview record · synthetic · 06 Oct 2026</small></div>
                    {managerError && <p className="dt-status dt-warning">{managerError}</p>}
                    {managerResult?.mode === 'fallback' && <p className="dt-status dt-neutral">Demo mode · the Copilot SDK is not configured. The proposed rule below uses the fixed synthetic manager response.</p>}
                    {managerNarrative && <div className="dt-agent-note"><span className="dt-eyebrow">COPILOT SDK · GROUNDED IN THE MANAGER'S ANSWER</span><p>{managerNarrative}</p></div>}
                    <div className="dt-rule-card">
                      <span className="dt-eyebrow">CANDIDATE LOCAL RULE · NEEDS YOUR APPROVAL</span>
                      {editingRule ? <label className="dt-rule-edit">Edit the shared definition<input value={ruleText} onChange={(event) => setRuleText(event.target.value)} /></label> : <strong>{ruleText}</strong>}
                      <p>Source: simulated Hospital A data manager · affects two of the 30 reported cases · local rule, not a shared standard yet.</p>
                    </div>
                    {ruleStatus === 'unreviewed' && <div className="dt-review-actions">
                      {editingRule ? <button type="button" className="dt-button dt-primary" onClick={() => { setEditingRule(false); setRuleStatus('approved'); }}>Save & approve rule</button> : <button type="button" className="dt-button dt-primary" onClick={() => setRuleStatus('approved')}>Approve shared definition</button>}
                      <button type="button" className="dt-button" onClick={() => setEditingRule((editing) => !editing)}>{editingRule ? 'Cancel edit' : 'Edit rule'}</button>
                      <button type="button" className="dt-button" onClick={() => setRuleStatus('dismissed')}>Dismiss proposal</button>
                    </div>}
                    {ruleStatus === 'approved' && <div className="dt-callout dt-success-callout">Your definition is applied in this demo. Hospital A changes from 30 to 28; Hospital B stays at 29.</div>}
                    {ruleStatus === 'dismissed' && <div className="dt-callout">The proposal is dismissed; the reported counts remain unchanged.</div>}
                  </div>
                )}
              </>
            )}
            <div className="dt-human-note">The assistant can surface and explain a local convention. You decide whether it should become the shared research definition.</div>
          </section>
        )}

        {step === 'analysis' && (
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div><p className="dt-eyebrow">RESEARCH IMPACT · SIMULATED AGGREGATES</p><h2>What changes when the evidence is uncertain?</h2></div>
              <span className="dt-status dt-neutral">500 synthetic runs</span>
            </div>
            <p className="dt-panel-intro">A clean result can look convincing when every recorded number is treated as exact. This demo carries the source and definition uncertainty into the estimate instead of dropping the data.</p>
            <div className="dt-analysis-controls">
              <button type="button" className="dt-button" onClick={() => setNaiveResult(true)}>Run naive analysis <span>Use counts as recorded</span></button>
              <button type="button" className="dt-button dt-primary" disabled={analysisLoading} onClick={runUncertaintyAnalysis}>{analysisLoading ? <><span className="dt-spinner" /> Running 500 plausible datasets…</> : 'Run uncertainty-aware analysis'}</button>
            </div>
            <div className="dt-distributions">
              <div><p className="dt-eyebrow">HOSPITAL A · DISCRETE COUNT</p>{hospitalACounts.map(([count, probability]) => <div className="dt-probability" key={count}><span>{count} procedures</span><div><i style={{ width: `${probability * 100}%` }} /></div><strong>{probability * 100}%</strong></div>)}</div>
              <div><p className="dt-eyebrow">HOSPITAL B · DISCRETE COUNT</p>{hospitalBCounts.map(([count, probability]) => <div className="dt-probability" key={count}><span>{count} procedures</span><div><i style={{ width: `${probability * 100}%` }} /></div><strong>{probability * 100}%</strong></div>)}</div>
              <p>These plausible counts are sampled as discrete values, not assumed to follow a normal distribution. They are synthetic demonstration weights.</p>
            </div>
            {analysisLoading && <div className="dt-working" role="status"><span className="dt-spinner" /> Sampling plausible procedure counts and rerunning the comparison across 500 synthetic datasets.</div>}
            {(naiveResult || uncertaintyResult) ? <div className="dt-results-grid">
              {naiveResult && <article className="dt-result-card">
                <p className="dt-eyebrow">NAIVE · RECORDED VALUES TREATED AS EXACT</p><strong>18% lower mortality</strong>
                <p>Hospital A 30 vs Hospital B 29. The estimate looks clear because disagreements and shared source lineage are ignored.</p><span className="dt-status dt-warning">Overstates certainty</span>
              </article>}
              {uncertaintyResult && <article className="dt-result-card dt-result-aware">
                <p className="dt-eyebrow">UNCERTAINTY-AWARE · 500 MONTE CARLO RUNS</p><strong>{uncertaintyResult.estimate}% lower mortality</strong>
                <p>95% uncertainty interval: {uncertaintyResult.lower}% to {uncertaintyResult.upper}%. The interval includes no effect.</p><span className="dt-status dt-success">Uncertainty carried into result</span>
              </article>}
            </div> : <div className="dt-empty-result">Run both analyses to see how a data-quality assumption changes the research conclusion.</div>}
            <div className="dt-payoff"><strong>What this changes:</strong> a result that looked decisive becomes uncertain once the source and definition behind the counts are included.</div>
            {horizon === 'six-months' && <p className="dt-six-months-note">Six-month version: analysis uses hospital-supplied aggregates plus source and definition notes. Live source-system checks are not available yet.</p>}
          </section>
        )}

        <footer className="dt-footer"><span>Prototype for discussion · every value and hospital is synthetic.</span><span>Trust score: visible heuristic · not calibrated for decisions.</span></footer>
      </main>
    </div>
  );
}
