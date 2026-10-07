import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { Backstage, type Stage } from '../../hospital/Story';
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
type DatasetDefinition = 'strict' | 'inclusive' | 'local' | 'refined';
type MinimalDataset = {
  groups: { elements: { name: string; likely_source: string }[] }[];
  not_in_minimal_dataset: string[];
};
type DatasetSnapshot = {
  synthetic: boolean;
  seed: number;
  patient_count: number;
  hospital_count: number;
  procedure_event_count: number;
  other_event_count: number;
  other_event_types: Record<string, number>;
  cancer_types: Record<string, number>;
  patients_by_year: Record<string, number>;
  patient_age: { mean: number; median: number; minimum: number; maximum: number };
  modalities: { name: string; records: number; lineage: string }[];
  quality: {
    completeness_percent: number;
    expected_source_records: number;
    observed_source_records: number;
    missing_source_records: number;
    dependent_lineage_records: number;
    duplicate_records: number;
    independent_modalities: number;
  };
  definitions: { id: DatasetDefinition; version: string; name: string; text: string }[];
  definition_stats: Record<DatasetDefinition, {
    n: number;
    total: number;
    mean: number;
    median: number;
    standard_deviation: number;
    minimum: number;
    maximum: number;
    hospitals_at_threshold: number;
    reporting_threshold: number;
  }>;
  selected_definition: DatasetDefinition;
  refinement_approved: boolean;
  definition_history: { version: string; status: string; change: string; approved_by: string | null; date: string }[];
  hospitals: {
    id: string;
    name: string;
    synthetic: boolean;
    patients: number;
    strict: number;
    inclusive: number;
    local: number;
    difference: number;
    difference_percent: number;
    strict_rate_per_1000: number;
    inclusive_rate_per_1000: number;
    source_completeness_percent: number;
    missing_source_records: number;
    patterns: { name: string; cases: number }[];
    top_two_patterns_percent: number;
  }[];
  definition_sensitivity: {
    cases: number;
    percent: number;
    cross_hospital_agreement_before: number;
    cross_hospital_agreement_after: number;
    unexplained_before: number;
    unexplained_after: number;
    agreement_sample_size: number;
  };
  trust_assessment: {
    score: number;
    confidence: number;
    dimensions: { label: string; weight: number; rating: number; note: string }[];
  };
  uncertainty_analysis: {
    simulations: number;
    estimate: number;
    lower: number;
    upper: number;
    hospital_a_distribution: { count: number; probability_percent: number }[];
    hospital_b_distribution: { count: number; probability_percent: number }[];
    rule_approved: boolean;
  };
  patterns: { name: string; cases: number; percent_of_sensitive: number }[];
  representative_cases: {
    id: string;
    hospital: string;
    year: number;
    pattern: string;
    summary: string;
    evidence: { source: string; value: string; lineage: string }[];
  }[];
  histogram: { age_band: string; patients: number }[];
};

const sources = [
  { name: 'EMR coding', count: 30, parent: 'Independent source', chain: 'A' },
  { name: 'Cancer registry', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Department Excel', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Research extract', count: 30, parent: 'EMR coding', chain: 'A' },
  { name: 'Operating-room log', count: 29, parent: 'Independent source', chain: 'B' },
  { name: 'Pathology', count: 28, parent: 'Independent source', chain: 'C' },
];

const story = [
  { id: 'question' as const, title: 'Compare definitions', description: 'Start with 24,000 synthetic patients across 12 hospitals. See how the same question changes with its definition.', nextPrompt: 'Switch between inclusive, strict and hospital-reported counts; select Hospital C to inspect its 21% change.' },
  { id: 'evidence' as const, title: 'Inspect case evidence', description: 'Open a representative synthetic case and trace its classifications back to their source records.', nextPrompt: 'Review the source lineage and the separate claim-level trust assessment.' },
  { id: 'rule' as const, title: 'Refine the shared rule', description: 'Ask why hospitals classify the same case differently, then decide whether to clarify the common definition.', nextPrompt: 'Approve the proposed v2 wording and rerun the dataset to compare agreement and unresolved cases.' },
  { id: 'analysis' as const, title: 'Carry uncertainty through', description: 'Compare the result from raw values with 500 plausible datasets.', nextPrompt: 'Run both analyses below: compare the apparent 18% reduction with the uncertainty-aware estimate and interval.' },
];

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
  const [datasetRuleApproved, setDatasetRuleApproved] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<DatasetDefinition>('inclusive');
  const [dataset, setDataset] = useState<DatasetSnapshot | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [datasetError, setDatasetError] = useState('');
  const [selectedHospital, setSelectedHospital] = useState('C');
  const [datasetExplanation, setDatasetExplanation] = useState<AgentResult | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('SYN-C-2024-00817');
  const [datasetRerunning, setDatasetRerunning] = useState(false);
  const [editingRule, setEditingRule] = useState(false);
  const [ruleText, setRuleText] = useState('Procedure Y + additional bowel resection → counted locally as X');
  const [sharedRuleText, setSharedRuleText] = useState('Count only completed primary colorectal resections. Exclude secondary bowel resections performed during another primary oncological operation.');
  const [naiveResult, setNaiveResult] = useState(false);
  const [uncertaintyResult, setUncertaintyResult] = useState<DatasetSnapshot['uncertainty_analysis'] | null>(null);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [analysisRuns, setAnalysisRuns] = useState(0);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [minimalDataset, setMinimalDataset] = useState<MinimalDataset | null>(null);
  const trustDimensions = dataset?.trust_assessment.dimensions ?? [];
  const claimTrustScore = dataset?.trust_assessment.score ?? 0;

  const currentIndex = story.findIndex((item) => item.id === step);
  useEffect(() => {
    api.sampleData<MinimalDataset>('minimal-mdt-dataset.json').then(setMinimalDataset).catch(() => setMinimalDataset(null));
    api.issue100Dataset<DatasetSnapshot>()
      .then((result) => {
        setDataset(result);
        setSelectedDefinition(result.selected_definition);
      })
      .catch(() => setDatasetError('The synthetic research dataset could not be loaded.'))
      .finally(() => setDatasetLoading(false));
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

  const runPopulationAnalysis = async (definition: DatasetDefinition, refined = definition === 'refined') => {
    setSelectedDefinition(definition);
    setDatasetLoading(true);
    setDatasetError('');
    try {
      const result = await api.analyzeIssue100Dataset<DatasetSnapshot>({
        definition_id: definition === 'refined' ? 'strict' : definition,
        refined: definition === 'refined' || refined,
      });
      setDataset(result);
      return true;
    } catch {
      setDatasetError('The synthetic definition comparison could not be recalculated.');
      return false;
    } finally {
      setDatasetLoading(false);
    }
  };

  const approveDefinitionRefinement = async () => {
    setDatasetRerunning(true);
    if (await runPopulationAnalysis('refined', true)) setDatasetRuleApproved(true);
    setDatasetRerunning(false);
  };

  const explainPopulationDifference = async () => {
    setExplanationLoading(true);
    setExplanationError('');
    try {
      setDatasetExplanation(await api.explainIssue100Dataset({
        task: `Explain the synthetic definition-sensitive patterns at Hospital ${selectedHospital}.`,
      }));
    } catch {
      setExplanationError('The assistant is unavailable. The deterministic pattern and case evidence remain available.');
    } finally {
      setExplanationLoading(false);
    }
  };

  const selectedSite = dataset?.hospitals.find((hospital) => hospital.id === selectedHospital);
  const selectedCase = dataset?.representative_cases.find((caseRecord) => caseRecord.id === selectedCaseId)
    ?? dataset?.representative_cases[0];
  const currentDefinitionStats = dataset?.definition_stats[selectedDefinition];
  const currentDefinition = dataset?.definitions.find((item) => item.id === selectedDefinition);
  const definitionAgentText = datasetExplanation?.blocks
    .map((block) => [block.title, block.body, ...block.items.map((item) => `${item.label}: ${item.detail ?? ''}`)].filter(Boolean).join('\n'))
    .join('\n\n');

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
    setAnalysisStarted(true);
    setAnalysisRuns((runs) => runs + 1);
    setAnalysisLoading(true);
    void api.analyzeIssue100Dataset<DatasetSnapshot>({
      definition_id: selectedDefinition === 'refined' ? 'strict' : selectedDefinition,
      refined: selectedDefinition === 'refined',
    }).then((result) => {
      setDataset(result);
      setUncertaintyResult(result.uncertainty_analysis);
    }).catch(() => {
      setDatasetError('The Python analysis could not be completed.');
    }).finally(() => setAnalysisLoading(false));
  };

  const managerNarrative = managerResult?.mode === 'copilot' ? agentText(managerResult) : '';
  const managerToolCalled = managerResult?.trace.some((item) => item.tool === 'ask_local_data_manager') ?? false;
  const managerResponseAvailable = Boolean(managerResult || managerError);
  const managerStages: Stage[] = [
    {
      label: 'Call ask_local_data_manager',
      detail: managerResponseAvailable
        ? managerToolCalled
          ? 'Copilot SDK trace confirms the simulated manager tool call.'
          : managerResult?.mode === 'copilot'
            ? 'The SDK response did not include this tool in its trace; the fixed synthetic manager answer is shown.'
            : 'No SDK tool call was available; the fixed synthetic demo response is shown.'
        : 'Waiting for the SDK response or deterministic demo fallback.',
      ms: 650,
    },
    {
      label: 'Read the manager’s reply',
      detail: managerResponseAvailable
        ? '“We count procedure Y as X when an additional bowel resection is performed.”'
        : 'Waiting for the synthetic manager’s answer.',
      ms: 650,
    },
    {
      label: 'Extract a candidate local rule',
      detail: managerResponseAvailable ? `${ruleText} · two reported cases affected · awaiting your approval` : 'The candidate is not applied until you approve it.',
    },
  ];
  const scoreRules = trustDimensions.map((item) => `${item.label} ${item.weight * 100}% × ${item.rating}`).join(' · ');
  const analysisStages: Stage[] = [
    {
      label: 'Apply the fixed, deterministic trust-score rules',
      detail: `${scoreRules} → ${claimTrustScore}/100. The score does not change during analysis.`,
      ms: 650,
    },
    {
      label: 'Keep assessment confidence separate',
      detail: `Confidence ${dataset?.trust_assessment.confidence ?? 92}/100 describes assessment completeness; it is not included in the trust score.`,
      ms: 650,
    },
    {
      label: 'Sample discrete procedure counts',
      detail: `Draw from Hospital A and B count distributions for 500 synthetic iterations. ${ruleStatus === 'approved' ? 'Hospital A’s approved shared definition is applied.' : 'No candidate rule is applied.'}`,
      ms: 650,
    },
    {
      label: 'Re-run the comparison and calculate the interval',
      detail: uncertaintyResult
        ? `${uncertaintyResult.estimate}% estimated reduction · 95% interval ${uncertaintyResult.lower}% to ${uncertaintyResult.upper}%.`
        : 'Recalculate the outcome estimate across all 500 plausible datasets.',
    },
  ];
  const refinementStages: Stage[] = [
    { label: 'Inspect the recurring semantic discrepancy', detail: 'Synthetic case evidence shows secondary resections during other primary operations are classified differently.', ms: 650 },
    { label: 'Apply your approved ONCO-CRC-PROC-v2 wording', detail: datasetRuleApproved ? sharedRuleText : 'No shared rule or dataset changes before your approval.', ms: 650 },
    {
      label: 'Rerun classifications across the synthetic cohort',
      detail: datasetRuleApproved && dataset
        ? `Agreement ${dataset.definition_sensitivity.cross_hospital_agreement_before}% → ${dataset.definition_sensitivity.cross_hospital_agreement_after}%; unexplained cases ${dataset.definition_sensitivity.unexplained_before} → ${dataset.definition_sensitivity.unexplained_after}.`
        : 'Waiting for a researcher to approve the candidate definition.',
    },
  ];

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
            <h1>How do I trust data from another hospital?</h1>
            <p>The same oncology question can produce different answers under different definitions.</p>
          </div>
          <div className="dt-context-meta"><span>12 synthetic hospitals</span><span>24,000 synthetic patients</span><span>Colorectal research</span></div>
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
            <div className="dt-next-prompt"><span className="dt-eyebrow">WHAT TO DO NEXT</span><span>{story[currentIndex].nextPrompt}</span></div>
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
          <>
          <section className="dt-panel dt-population">
            <div className="dt-panel-heading">
              <div><p className="dt-eyebrow">FEDERATED ONCOLOGY DATA · REPRODUCIBLE SYNTHETIC COHORT</p><h2>How do I trust data from another hospital?</h2></div>
              <span className="dt-status dt-neutral">Seeded · 2023–2026</span>
            </div>
            {datasetLoading && <div className="dt-working" role="status"><span className="dt-spinner" /> Generating and calculating the synthetic cohort in Python…</div>}
            {datasetError && <p className="dt-status dt-warning">{datasetError}</p>}
            {dataset && (
              <>
                <div className="dt-population-metrics">
                  <div><strong>{dataset.hospital_count}</strong><span>synthetic hospitals</span></div>
                  <div><strong>{dataset.patient_count.toLocaleString()}</strong><span>synthetic oncology patients</span></div>
                  <div><strong>{dataset.procedure_event_count.toLocaleString()}</strong><span>procedure and care events</span></div>
                  <div><strong>{dataset.modalities.length}</strong><span>source modalities</span></div>
                </div>
                <div className="dt-definition-lab">
                  <div className="dt-panel-heading">
                    <div><p className="dt-eyebrow">DEFINITION LAB · SAME QUESTION, DIFFERENT COHORT</p><h3>How many qualifying colorectal procedures were performed?</h3></div>
                    <label className="dt-version-select">Definition version
                      <select value={selectedDefinition === 'refined' ? 'v2' : 'v1'} onChange={(event) => {
                        const next = event.target.value === 'v2' ? 'refined' : 'inclusive';
                        void runPopulationAnalysis(next);
                      }}>
                        <option value="v1">ONCO-CRC-PROC-v1</option>
                        {datasetRuleApproved && <option value="v2">ONCO-CRC-PROC-v2</option>}
                      </select>
                    </label>
                  </div>
                  <div className="dt-definition-options">
                    {dataset.definitions.filter((definition) => definition.id !== 'refined' || datasetRuleApproved).map((definition) => (
                      <button
                        type="button"
                        className={`dt-definition-option ${selectedDefinition === definition.id ? 'is-selected' : ''}`}
                        aria-pressed={selectedDefinition === definition.id}
                        key={definition.id}
                        onClick={() => void runPopulationAnalysis(definition.id)}
                      >
                        <span className="dt-eyebrow">{definition.version}</span>
                        <strong>{definition.name}</strong>
                        <small>{definition.text}</small>
                        <b>{dataset.definition_stats[definition.id].total.toLocaleString()} procedures</b>
                      </button>
                    ))}
                  </div>
                  {currentDefinitionStats && currentDefinition && (
                    <div className="dt-selected-definition">
                      <p><strong>Selected: {currentDefinition.name} · {currentDefinition.version}</strong> — {currentDefinition.text}</p>
                      <div className="dt-statline">
                        <span>Total <strong>{currentDefinitionStats.total.toLocaleString()}</strong></span>
                        <span>Mean / hospital <strong>{currentDefinitionStats.mean}</strong></span>
                        <span>Median <strong>{currentDefinitionStats.median}</strong></span>
                        <span>SD <strong>{currentDefinitionStats.standard_deviation}</strong></span>
                        <span>Range <strong>{currentDefinitionStats.minimum}–{currentDefinitionStats.maximum}</strong></span>
                        <span>Hospitals ≥{currentDefinitionStats.reporting_threshold} <strong>{currentDefinitionStats.hospitals_at_threshold}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="dt-population-insights">
                  <div className="dt-insight-stat"><span className="dt-eyebrow">DEFINITION-SENSITIVE</span><strong>{dataset.definition_sensitivity.cases} <small>cases · {dataset.definition_sensitivity.percent}%</small></strong><span>Change classification under the inclusive definition.</span></div>
                  <div className="dt-insight-stat"><span className="dt-eyebrow">SEMANTIC AGREEMENT</span><strong>{dataset.definition_sensitivity.cross_hospital_agreement_before}% <small>before refinement</small></strong><span>{dataset.definition_sensitivity.cross_hospital_agreement_after}% after the proposed clarification.</span></div>
                  <div className="dt-insight-stat"><span className="dt-eyebrow">UNRESOLVED CASES</span><strong>{dataset.definition_sensitivity.unexplained_before} <small>→ {dataset.definition_sensitivity.unexplained_after}</small></strong><span>Illustrative synthetic comparison before and after review.</span></div>
                  <div className="dt-insight-stat"><span className="dt-eyebrow">DATASET COMPLETENESS</span><strong>{dataset.quality.completeness_percent}%</strong><span>{dataset.quality.missing_source_records} missing source records · {dataset.quality.duplicate_records} duplicate records.</span></div>
                </div>
                <div className="dt-population-lower">
                  <div className="dt-table-wrap dt-hospital-table">
                    <table>
                      <caption>Counts are calculated from the same seeded synthetic hospital cohort. Select a row to inspect it.</caption>
                      <thead><tr><th>Hospital</th><th>Patients</th><th>Strict</th><th>Inclusive</th><th>Local registry</th><th>Definition-sensitive</th><th>Rate / 1,000</th><th>Source completeness</th></tr></thead>
                      <tbody>{dataset.hospitals.map((hospital) => (
                        <tr key={hospital.id} className={selectedHospital === hospital.id ? 'is-selected' : ''}>
                          <td><button type="button" className="dt-table-select" onClick={() => { setSelectedHospital(hospital.id); setDatasetExplanation(null); }}>{hospital.id} · {hospital.name}</button></td>
                          <td>{hospital.patients.toLocaleString()}</td><td>{hospital.strict}</td><td>{hospital.inclusive}</td><td>{hospital.local}</td>
                          <td><strong>+{hospital.difference}</strong> · {hospital.difference_percent}%</td><td>{hospital.inclusive_rate_per_1000}</td>
                          <td>{hospital.source_completeness_percent}% <small>· {hospital.missing_source_records} missing</small></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <aside className="dt-panel dt-dataset-side">
                    {selectedSite && <>
                      <p className="dt-eyebrow">SELECTED SITE · SYNTHETIC</p>
                      <h3>{selectedSite.id} · {selectedSite.name}</h3>
                      <strong className="dt-site-sensitivity">+{selectedSite.difference} <small>({selectedSite.difference_percent}%) under inclusive definition</small></strong>
                      <p>{selectedSite.top_two_patterns_percent}% of this site's definition-sensitive difference is concentrated in its two most common interpretation patterns.</p>
                      <ul className="dt-pattern-list">{selectedSite.patterns.map((pattern) => <li key={pattern.name}><span>{pattern.name}</span><strong>{pattern.cases}</strong></li>)}</ul>
                      <div className="dt-review-actions">
                        <button type="button" className="dt-button" onClick={() => { setSelectedCaseId(dataset.representative_cases.find((caseRecord) => caseRecord.hospital.includes(selectedSite.name))?.id ?? dataset.representative_cases[0].id); setStep('evidence'); }}>Open representative case</button>
                        <button type="button" className="dt-button dt-primary" disabled={explanationLoading} onClick={explainPopulationDifference}>{explanationLoading ? <><span className="dt-spinner" /> Explaining patterns…</> : 'Explain the difference'}</button>
                      </div>
                      {explanationLoading && <div className="dt-working" role="status"><span className="dt-spinner" /> The Copilot SDK is retrieving grounded population findings…</div>}
                      {explanationError && <p className="dt-status dt-warning">{explanationError}</p>}
                      {datasetExplanation?.mode === 'fallback' && <p className="dt-status dt-neutral">Demo mode · SDK unavailable. Python-calculated counts and the seeded explanation remain visible.</p>}
                      {definitionAgentText && <div className="dt-agent-note"><span className="dt-eyebrow">COPILOT SDK · GROUNDED EXPLANATION</span><p>{definitionAgentText}</p>{datasetExplanation?.trace.map((item, index) => <small key={`${item.tool}-${index}`}>Tool: {item.tool}</small>)}</div>}
                    </>}
                  </aside>
                </div>
                <div className="dt-population-foot">
                  <p><strong>Sources:</strong> {dataset.modalities.map((source) => `${source.name} (${source.records.toLocaleString()})`).join(' · ')}</p>
                  <p><strong>Lineage matters:</strong> {dataset.quality.independent_modalities} source systems are independent; copied extracts remain one evidence chain. Age: mean {dataset.patient_age.mean}, median {dataset.patient_age.median}, range {dataset.patient_age.minimum}–{dataset.patient_age.maximum} years. All metrics are Python-calculated from fixed seed {dataset.seed}.</p>
                  <div className="dt-population-distributions">
                    <div><span className="dt-eyebrow">PATIENT AGE DISTRIBUTION</span>{dataset.histogram.map((band) => <div className="dt-probability" key={band.age_band}><span>{band.age_band}</span><div><i style={{ width: `${band.patients / dataset.patient_count * 100}%` }} /></div><strong>{band.patients.toLocaleString()}</strong></div>)}</div>
                    <div><span className="dt-eyebrow">CANCER TYPE MIX</span>{Object.entries(dataset.cancer_types).map(([type, count]) => <div className="dt-probability" key={type}><span>{type}</span><div><i style={{ width: `${count / dataset.patient_count * 100}%` }} /></div><strong>{(count / dataset.patient_count * 100).toFixed(1)}%</strong></div>)}</div>
                    <div><span className="dt-eyebrow">PATIENTS BY YEAR</span>{Object.entries(dataset.patients_by_year).map(([year, count]) => <div className="dt-probability" key={year}><span>{year}</span><div><i style={{ width: `${count / dataset.patient_count * 100}%` }} /></div><strong>{count.toLocaleString()}</strong></div>)}</div>
                  </div>
                </div>
              </>
            )}
          </section>
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
              <button type="button" className="dt-claim-card" title="Trust is a fixed, visible rule-of-thumb assessment of evidence for this claim." aria-label={`Inspect the claim with trust ${claimTrustScore} out of 100 and assessment confidence ${dataset?.trust_assessment.confidence ?? 92} out of 100`} onClick={() => { setStep('evidence'); setShowEvidence(true); }}>
                <span className="dt-eyebrow">CLAIM-LEVEL ASSESSMENT · HOSPITAL A</span>
                <span className="dt-claim-scores"><span><strong>{claimTrustScore}</strong><small>Trust / 100</small></span><span><strong>{dataset?.trust_assessment.confidence ?? 92}</strong><small>Confidence / 100</small></span></span>
                <span className="dt-claim-hint">Select to inspect why the evidence supports the claim only partly.</span>
              </button>
            </div>
            <div className="dt-callout"><strong>Trust belongs to this claim, for this research question.</strong> It is not a rating of a hospital or its people.</div>
          </section>
          </>
        )}

        {step === 'evidence' && (
          <section className="dt-evidence-layout">
            <article className="dt-panel dt-case-evidence">
              <div className="dt-panel-heading">
                <div><p className="dt-eyebrow">REPRESENTATIVE CASE · SYNTHETIC</p><h2>{selectedCase?.id ?? 'Loading synthetic case'}</h2></div>
                {selectedCase && <span className="dt-status dt-neutral">{selectedCase.hospital} · {selectedCase.year}</span>}
              </div>
              {selectedCase && <>
                <p>{selectedCase.summary}</p>
                <p className="dt-eyebrow">INTERPRETATION PATTERN · {selectedCase.pattern}</p>
                <div className="dt-table-wrap"><table>
                  <caption>Source classifications for this synthetic record</caption>
                  <thead><tr><th>Source record</th><th>Classification / value</th><th>Lineage</th></tr></thead>
                  <tbody>{selectedCase.evidence.map((record) => <tr key={`${record.source}-${record.value}`}><td>{record.source}</td><td>{record.value}</td><td>{record.lineage}</td></tr>)}</tbody>
                </table></div>
                <label className="dt-version-select">Choose an example case
                  <select value={selectedCase.id} onChange={(event) => setSelectedCaseId(event.target.value)}>
                    {dataset?.representative_cases.map((record) => <option key={record.id} value={record.id}>{record.id} · {record.pattern}</option>)}
                  </select>
                </label>
              </>}
              <button type="button" className="dt-button" onClick={() => setStep('question')}>← Back to hospital comparison</button>
            </article>
            <article className="dt-panel">
              <div className="dt-panel-heading">
                <div><p className="dt-eyebrow">CLAIM-LEVEL ASSESSMENT</p><h2>Hospital A · 30 qualifying procedures</h2></div>
                <span className="dt-status dt-warning">Worth a closer look</span>
              </div>
              <div className="dt-score-row">
                <div className="dt-score"><strong>{claimTrustScore}</strong><span>Trust / 100</span></div>
                <div className="dt-score"><strong>{dataset?.trust_assessment.confidence ?? 92}</strong><span>Confidence / 100</span></div>
                <p>Trust measures how strongly evidence supports this claim. Confidence measures how complete the assessment is. They answer different questions.</p>
              </div>
              <h3>What makes up the trust score</h3>
              <div className="dt-dimensions">
                {trustDimensions.map((item) => (
                  <div className="dt-dimension" key={item.label} title={item.note}>
                    <span>{item.label}<small>{item.note}</small></span>
                    <span>{item.weight * 100}%</span>
                    <div className="dt-meter"><i style={{ width: `${item.rating}%` }} /></div>
                    <strong>{item.rating}</strong>
                  </div>
                ))}
              </div>
              <p className="dt-method-note">Python calculates each rating × visible weight, rounded to a whole number. These starting weights are a rule of thumb, not calibrated clinical evidence.</p>
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
                {managerAsked && <Backstage
                  title="Behind the scenes · manager interview"
                  stages={managerStages}
                  running
                  holdLast
                  release={!managerLoading}
                  note={managerError
                    ? 'The assistant did not return a usable answer. The fixed synthetic manager reply is shown; nothing is applied without your approval.'
                    : managerResult?.mode === 'fallback'
                    ? 'Demo mode: the Copilot SDK is not configured. This uses the fixed synthetic manager reply; nothing is applied without your approval.'
                    : 'The Copilot SDK retrieves and extracts evidence; it cannot approve the proposed rule.'}
                />}
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
            <div className="dt-definition-refinement">
              <div className="dt-panel-heading">
                <div><p className="dt-eyebrow">DEFINITION REFINEMENT · HUMAN APPROVAL REQUIRED</p><h3>Make tomorrow’s dataset easier to compare</h3></div>
                <span className={`dt-status ${datasetRuleApproved ? 'dt-success' : 'dt-warning'}`}>{datasetRuleApproved ? 'ONCO-CRC-PROC-v2 approved' : 'Candidate · ONCO-CRC-PROC-v2'}</span>
              </div>
              <p>The discrepancy review finds an ambiguity: should a secondary bowel resection during another primary cancer operation count as a primary colorectal procedure?</p>
              <label className="dt-rule-edit">Proposed shared definition
                <textarea rows={3} value={sharedRuleText} disabled={datasetRuleApproved || datasetRerunning} onChange={(event) => setSharedRuleText(event.target.value)} />
              </label>
              <div className="dt-callout">Suggested clarification: “No — only primary colorectal resections.” Counts, agreement and case totals are Python-calculated; the assistant cannot apply this wording.</div>
              {!datasetRuleApproved && <div className="dt-review-actions">
                <button type="button" className="dt-button dt-primary" disabled={datasetRerunning || datasetLoading || !sharedRuleText.trim()} onClick={() => void approveDefinitionRefinement()}>
                  {datasetRerunning ? <><span className="dt-spinner" /> Rerunning the synthetic dataset…</> : 'Approve v2 & rerun all hospitals'}
                </button>
                <button type="button" className="dt-button" onClick={() => setSharedRuleText('Count completed primary colorectal resections only. Do not count secondary resections performed during another primary operation.')}>Use suggested clarification</button>
              </div>}
              {datasetRerunning && <div className="dt-working" role="status"><span className="dt-spinner" /> Reclassifying synthetic records under the approved definition…</div>}
              {datasetRuleApproved && dataset && <div className="dt-refinement-results">
                <div><span className="dt-eyebrow">CROSS-HOSPITAL CLASSIFICATION AGREEMENT</span><strong>{dataset.definition_sensitivity.cross_hospital_agreement_before}% <span>→</span> {dataset.definition_sensitivity.cross_hospital_agreement_after}%</strong><small>500 synthetic classification checks</small></div>
                <div><span className="dt-eyebrow">UNEXPLAINED CASES</span><strong>{dataset.definition_sensitivity.unexplained_before} <span>→</span> {dataset.definition_sensitivity.unexplained_after}</strong><small>after the definition is clarified</small></div>
              </div>}
              {(datasetRerunning || datasetRuleApproved) && <Backstage
                key={datasetRuleApproved ? 'approved-v2' : 'rerun-v1'}
                title="Behind the scenes · definition refinement"
                stages={refinementStages}
                running
                holdLast
                release={!datasetRerunning}
                note="Only your approval advances the common definition. Version 1 remains available for reproducibility."
              />}
              {dataset && <div className="dt-version-history">
                <span className="dt-eyebrow">DEFINITION HISTORY · REPRODUCIBLE ANALYSIS</span>
                {dataset.definition_history.map((version) => <p key={version.version}><strong>{version.version}</strong> · {version.status} · {version.change} · {version.approved_by ?? 'Awaiting researcher approval'} · {version.date}</p>)}
                {datasetRuleApproved && <button type="button" className="dt-button" onClick={() => void runPopulationAnalysis('inclusive', false)}>Rerun using ONCO-CRC-PROC-v1</button>}
              </div>}
            </div>
          </section>
        )}

        {step === 'analysis' && (
          <section className="dt-panel">
            <div className="dt-panel-heading">
              <div><p className="dt-eyebrow">RESEARCH IMPACT · SIMULATED AGGREGATES</p><h2>What changes when the evidence is uncertain?</h2></div>
              <span className="dt-status dt-neutral">{dataset?.uncertainty_analysis.simulations ?? 500} synthetic runs</span>
            </div>
            <p className="dt-panel-intro">A clean result can look convincing when every recorded number is treated as exact. This demo carries the source and definition uncertainty into the estimate instead of dropping the data.</p>
            <div className="dt-analysis-controls">
              <button type="button" className="dt-button" onClick={() => setNaiveResult(true)}>Run naive analysis <span>Use counts as recorded</span></button>
              <button type="button" className="dt-button dt-primary" disabled={analysisLoading} onClick={runUncertaintyAnalysis}>{analysisLoading ? <><span className="dt-spinner" /> Running 500 plausible datasets…</> : 'Run uncertainty-aware analysis'}</button>
            </div>
            <div className="dt-distributions">
              <div><p className="dt-eyebrow">HOSPITAL A · {ruleStatus === 'approved' ? 'SHARED RULE APPROVED' : 'RULE NOT APPLIED'}</p>{(dataset?.uncertainty_analysis.hospital_a_distribution ?? []).map((point) => <div className="dt-probability" key={point.count}><span>{point.count} procedures</span><div><i style={{ width: `${point.probability_percent}%` }} /></div><strong>{point.probability_percent}%</strong></div>)}</div>
              <div><p className="dt-eyebrow">HOSPITAL B · DISCRETE COUNT</p>{(dataset?.uncertainty_analysis.hospital_b_distribution ?? []).map((point) => <div className="dt-probability" key={point.count}><span>{point.count} procedures</span><div><i style={{ width: `${point.probability_percent}%` }} /></div><strong>{point.probability_percent}%</strong></div>)}</div>
              <p>Discrete synthetic counts, not a normal distribution. A's proposed definition changes the count distribution only after you approve it.</p>
            </div>
            {analysisStarted && <Backstage
              key={analysisRuns}
              title="Behind the scenes · uncertainty-aware analysis"
              stages={analysisStages}
              running
              holdLast
              release={!analysisLoading}
              note="The trust score uses fixed code and visible weights. The analysis samples data uncertainty; the assistant does not change either."
            />}
            {(naiveResult || uncertaintyResult) ? <div className="dt-results-grid">
              {naiveResult && <article className="dt-result-card">
                <p className="dt-eyebrow">NAIVE · RECORDED VALUES TREATED AS EXACT</p><strong>18% lower mortality</strong>
                <p>Hospital A 30 vs Hospital B 29. The estimate looks clear because disagreements and shared source lineage are ignored.</p><span className="dt-status dt-warning">Overstates certainty</span>
              </article>}
              {uncertaintyResult && <article className="dt-result-card dt-result-aware">
                <p className="dt-eyebrow">UNCERTAINTY-AWARE · 500 MONTE CARLO RUNS</p><strong>{uncertaintyResult.estimate}% lower mortality</strong>
                <p>95% uncertainty interval: {uncertaintyResult.lower}% to {uncertaintyResult.upper}%. The interval includes no effect. {ruleStatus === 'approved' ? 'Your approved definition is applied.' : 'No local rule was applied; semantic uncertainty remains.'}</p><span className="dt-status dt-success">Uncertainty carried into result</span>
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
