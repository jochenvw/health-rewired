import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type TacitAnalysis, type TacitCapture, type TacitFactor } from '../../api';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './tacit-knowledge.css';

export const meta: IdeaMeta = {
  id: '98',
  issue: 98,
  title: "When the data doesn't explain the decision",
  tagline: 'Capture the clinical context behind different treatment choices, then see what may be missing from the data.',
};

type StepId = 'case-a' | 'case-b' | 'compare' | 'capture' | 'pattern' | 'candidate';
type Horizon = 'six-months' | 'future';
type Theme = 'light' | 'dark';
type Choice = 'Immediate surgery' | 'Systemic therapy first';
type MinimalDataset = { groups: { group: string; elements: { name: string; likely_source: string }[] }[] };
type CoverageField = { name: string; group: string; source: string };

const steps: StoryStep[] = [
  { id: 'case-a', title: 'Usual pathway', explain: 'Review the synthetic case where the available information and the tumour-board decision align.' },
  { id: 'case-b', title: "Today's decision", explain: 'Choose a pathway for a similar patient. The normal clinical workflow continues; the system quietly checks comparable decisions.' },
  { id: 'compare', title: 'Compare cases', explain: 'Inspect the structured context behind similar decisions and see why the difference is still unexplained.' },
  { id: 'capture', title: 'Ask what is missing', explain: 'The clinician can explain the choice, skip the question, or correct the model’s tentative interpretation.' },
  { id: 'pattern', title: 'Review knowledge', explain: 'One explanation is a hypothesis. Repeated synthetic evidence and human review determine whether it matures.' },
  { id: 'candidate', title: 'Population explorer', explain: 'Step back to the synthetic historical cohort; counts and rates are computed in code and cases remain inspectable.' },
];

const backstageStages: Stage[] = [
  { label: 'Retrieve comparable synthetic decisions', detail: 'Weighted structured context; post-decision notes excluded' },
  { label: 'Preserve the clinician’s exact explanation', detail: 'Original words and model interpretation are shown separately' },
  { label: 'Suggest a possible missing factor', detail: 'A hypothesis for human review, not a clinical rule' },
];

const coverageNames = ['Age', 'WHO performance status', 'Reason for deviating from guideline or MDT recommendation'];
const maturityStates = ['Hypothesised', 'Observed once', 'Repeated', 'Corroborated', 'Clinician validated', 'Institutionally accepted', 'Structured / encoded'];
const representations = [
  'Existing structured field · likely insufficient',
  'Candidate new structured field',
  'Improve extraction from free text',
  'Explicit reviewed decision knowledge',
  'Temporary agent memory only',
];

function findCoverageFields(dataset: MinimalDataset | null): CoverageField[] {
  if (!dataset) return [];
  return dataset.groups.flatMap((group) =>
    group.elements
      .filter((element) => coverageNames.includes(element.name))
      .map((element) => ({ name: element.name, group: group.group, source: element.likely_source })),
  );
}

function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'info' {
  if (status === 'Clinician validated' || status === 'Institutionally accepted' || status === 'Structured / encoded') return 'ok';
  if (status === 'Hypothesised' || status === 'Observed once') return 'warn';
  if (status === 'Repeated' || status === 'Corroborated') return 'info';
  return 'neutral';
}

export default function TacitKnowledge() {
  const [step, setStep] = useState<StepId>('case-a');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('issue-98-theme') === 'dark' ? 'dark' : 'light'));
  const [decisionA, setDecisionA] = useState<Choice | null>(null);
  const [decisionB, setDecisionB] = useState<Choice | null>(null);
  const [explanation, setExplanation] = useState('The patient has very poor cardiopulmonary reserve and is unlikely to tolerate major surgery.');
  const [capture, setCapture] = useState<TacitCapture | null>(null);
  const [analysis, setAnalysis] = useState<TacitAnalysis | null>(null);
  const [analysisLoadedKey, setAnalysisLoadedKey] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [datasetSize, setDatasetSize] = useState(1200);
  const [dataset, setDataset] = useState<MinimalDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [alertChoice, setAlertChoice] = useState<string | null>(null);
  const [reviewChoice, setReviewChoice] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [refinedConcept, setRefinedConcept] = useState('');
  const [candidateConcept, setCandidateConcept] = useState<string | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState('Hypothesised');
  const [knowledgeVersion, setKnowledgeVersion] = useState(1);
  const [reviewHistory, setReviewHistory] = useState<string[]>([]);
  const [representationChoice, setRepresentationChoice] = useState(representations[0]);
  const [validatedConcepts, setValidatedConcepts] = useState<string[]>([]);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);
  const [prospectiveCase, setProspectiveCase] = useState(false);
  const [prospectiveAssessment, setProspectiveAssessment] = useState<string | null>(null);
  const analysisQueryDecision = decisionB ?? 'Systemic therapy first';
  const analysisQueryKey = `${analysisQueryDecision}:${datasetSize}:${validatedConcepts.join('|')}`;

  useEffect(() => {
    localStorage.setItem('issue-98-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.sampleData<MinimalDataset>('minimal-mdt-dataset.json').then(setDataset).catch(() => setDataset(null));
  }, []);

  useEffect(() => {
    let active = true;
    setAnalysisError(null);
    api.tacitAnalysis(validatedConcepts, analysisQueryDecision, datasetSize).then((value) => {
      if (active) {
        setAnalysis(value);
        setAnalysisLoadedKey(analysisQueryKey);
      }
    }).catch(() => {
      if (active) {
        setAnalysisError('Population analysis is unavailable. You can still use the synthetic case walkthrough.');
        setMessage('Population analysis is unavailable. You can still use the synthetic case walkthrough.');
      }
    });
    return () => {
      active = false;
    };
  }, [validatedConcepts, analysisQueryDecision, analysisQueryKey, datasetSize]);

  const coverage = useMemo(() => findCoverageFields(dataset), [dataset]);
  const currentIndex = steps.findIndex((item) => item.id === step);
  const hasDifference = decisionA !== null && decisionB !== null && decisionA !== decisionB;
  const focusPatient = step === 'case-a' ? 'Patient A' : prospectiveCase && step === 'case-b' ? 'Patient C' : 'Patient B';
  const activeConcept = candidateConcept ?? capture?.concept ?? 'Operative physiological reserve';
  const matchingFactor = analysis?.factors.find((factor) => factor.concept === activeConcept);
  const analysisReady = analysis !== null && analysisLoadedKey === analysisQueryKey;
  const allowedToValidate = horizon === 'future' && knowledgeStatus === 'Observed once' &&
    (matchingFactor?.status === 'Repeated' || matchingFactor?.status === 'Corroborated');

  const goTo = (target: string) => {
    const targetIndex = steps.findIndex((item) => item.id === target);
    if (targetIndex > currentIndex && target === 'case-b' && !decisionA) {
      setMessage('Choose the usual pathway for Patient A before continuing.');
      return;
    }
    if (targetIndex > currentIndex && target === 'compare' && !decisionB) {
      setMessage('Record the current patient’s treatment pathway before comparing cases.');
      return;
    }
    if (targetIndex > currentIndex && target === 'capture' && !hasDifference) {
      setMessage('Record different pathways for the similar cases before asking about missing context.');
      return;
    }
    if (targetIndex > currentIndex && target === 'pattern' && !capture) {
      setMessage('Capture a clinician explanation before adding it to the knowledge review.');
      return;
    }
    setMessage(null);
    setStep(target as StepId);
  };

  const captureExplanation = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setAnalysisVisible(true);
    setMessage(null);
    setReviewChoice(null);
    try {
      const result = await api.captureTacitKnowledge(explanation.trim(), decisionB ?? 'Systemic therapy first');
      setCapture(result);
      setCandidateConcept(result.concept);
      setRefinedConcept(result.concept);
      setKnowledgeStatus('Hypothesised');
      setKnowledgeVersion(1);
      setReviewHistory(result.review_history);
      setRepresentationChoice(result.concept.includes('preference') || result.concept.includes('Caregiving')
        ? representations[1]
        : result.concept.includes('reserve') ? representations[0] : representations[2]);
    } catch (error) {
      setAnalysisVisible(false);
      setMessage(error instanceof Error ? error.message : 'The assistant could not be reached. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCoverage = () => (
    <Panel title="What this needs from the minimal dataset">
      <p className="tacit-coverage-intro">
        {coverage.length ? `${coverage.length} relevant fields are listed in the synthetic dataset. Availability reflects likely source, not a measured hospital check.` : 'Loading the synthetic minimal dataset…'}
      </p>
      <ul className="tacit-coverage-list">
        {coverage.map((field) => {
          const available = field.source === 'structured' || field.source === 'derived';
          const partial = field.source === 'MDT form' || field.source === 'report text';
          return (
            <li key={field.name}>
              <Pill tone={available ? 'ok' : partial ? 'warn' : 'neutral'}>{available ? 'Usually available' : partial ? 'May be free text' : 'Often missing'}</Pill>
              <span><strong>{field.name}</strong><small>{field.group} · likely source: {field.source}</small></span>
            </li>
          );
        })}
      </ul>
      <h4>What each hospital would need to do</h4>
      <ul className="tacit-hospital-asks">
        <li>Map age from the existing patient record.</li>
        <li>Make performance status available from the patient or clinic note.</li>
        <li>Record the reason for a different pathway in a consistent MDT field.</li>
      </ul>
      <small className="tacit-data-note">Source: /sample-data/minimal-mdt-dataset.json. “Likely source” is a working assumption, not an agreed standard.</small>
    </Panel>
  );

  const validateFactor = (concept: string) => {
    if (!validatedConcepts.includes(concept)) setValidatedConcepts((previous) => [...previous, concept]);
    if (concept === activeConcept) setKnowledgeStatus('Clinician validated');
  };

  const renderCaseComparison = () => {
    const comparable = analysisReady ? analysis?.comparison.cases ?? [] : [];
    const comparedDecision = analysis?.comparison.current_episode.decision ?? analysisQueryDecision;
    const cases = horizon === 'six-months' ? comparable.filter((item) => item.hospital === 'Munich Central') : comparable;
    return (
      <div className="tacit-columns">
        <Panel title="Current case · MDT-242" actions={<Pill tone="warn">{comparedDecision}</Pill>}>
          <dl className="tacit-facts">
            <dt>Diagnosis</dt><dd>Colorectal adenocarcinoma · stage III</dd>
            <dt>Location</dt><dd>Sigmoid</dd>
            <dt>Age</dt><dd>69</dd>
            <dt>Histology / marker</dt><dd>Adenocarcinoma · MMR proficient</dd>
            <dt>Performance status</dt><dd>ECOG 1</dd>
            <dt>Known at decision</dt><dd>Comorbidity, performance status, previous treatment</dd>
          </dl>
          <p className="tacit-muted">{analysis?.comparison.similarity_method ?? 'Comparing weighted structured context; waiting for the synthetic analysis.'}</p>
        </Panel>
        <Panel title={`${analysisReady ? cases.length : 'Finding'} comparable synthetic cases · ${comparedDecision === 'Immediate surgery' ? 'systemic therapy first' : 'direct surgery'}`} actions={<Pill tone="info">Weighted retrieval</Pill>}>
          {cases.length > 0 ? (
            <DataTable
              rows={cases}
              rowKey={(item) => item.episode_id}
              selected={expandedConcept ?? undefined}
              onSelect={(item) => setExpandedConcept(item.episode_id)}
              columns={[
                { key: 'episode_id', label: 'Episode' },
                { key: 'similarity', label: 'Context match', render: (item) => `${item.similarity}%` },
                { key: 'hospital', label: 'Hospital' },
                { key: 'timestamp', label: 'Date' },
              ]}
            />
          ) : !analysisReady
            ? analysisError ? <p role="alert">{analysisError}</p> : <Working label="Loading comparable synthetic decisions" />
            : <p className="tacit-muted">No sufficiently similar cases were found for this pathway.</p>}
          {cases.find((item) => item.episode_id === expandedConcept) && (
            <div className="tacit-inspection">
              <strong>Why this case matched</strong>
              <p>Matched strongly on: {cases.find((item) => item.episode_id === expandedConcept)?.matched_factors.join(', ')}.</p>
              <p>Potentially unrecorded context: {cases.find((item) => item.episode_id === expandedConcept)?.missing_context.join(', ')}.</p>
              <p className="tacit-data-note">Comparison only uses evidence available at the time of that decision.</p>
            </div>
          )}
          <div className="tacit-actions">
            <button type="button" className="hx-btn primary" onClick={() => goTo('capture')}>Explain this difference</button>
            <button type="button" className="hx-btn" aria-pressed={alertChoice === 'Not comparable'} onClick={() => setAlertChoice('Not comparable')}>Not comparable</button>
            <button type="button" className="hx-btn" aria-pressed={alertChoice === 'Expected variation'} onClick={() => setAlertChoice('Expected variation')}>Expected variation</button>
            <button type="button" className="hx-btn" aria-pressed={alertChoice === 'Ignore'} onClick={() => setAlertChoice('Ignore')}>Ignore</button>
          </div>
          {alertChoice && <p className="tacit-muted" role="status">Marked “{alertChoice}” for this synthetic walkthrough. No response is required.</p>}
        </Panel>
        {horizon === 'six-months' && renderCoverage()}
      </div>
    );
  };

  const renderKnowledgeReview = () => {
    const related = matchingFactor;
    return (
      <div className="tacit-columns">
        <Panel title="Possible hidden decision factor" actions={<Pill tone={statusTone(knowledgeStatus)}>{knowledgeStatus} · confidence low</Pill>}>
          {capture ? (
            <>
              <p><strong>{activeConcept}</strong></p>
              <p className="tacit-muted">One explanation is a hypothesis, not an accepted clinical fact.</p>
              <div className="tacit-maturity" aria-label={`Knowledge maturity, current status ${knowledgeStatus}`}>
                {maturityStates.map((status) => <span key={status} className={status === knowledgeStatus ? 'current' : maturityStates.indexOf(status) < maturityStates.indexOf(knowledgeStatus) ? 'done' : ''}>{status}</span>)}
              </div>
              <div className="tacit-actions">
                <button type="button" className="hx-btn primary" onClick={() => {
                  setReviewChoice('Accepted interpretation');
                  setKnowledgeStatus('Observed once');
                  setReviewHistory((history) => [...history, 'Clinician accepted this interpretation as one observation; no rule approved.']);
                }}>Accept interpretation</button>
                <button type="button" className="hx-btn" onClick={() => { setReviewChoice('Refine interpretation'); setRefining(true); }}>Refine</button>
                <button type="button" className="hx-btn" onClick={() => {
                  setReviewChoice('Rejected');
                  setKnowledgeStatus('Rejected');
                  setReviewHistory((history) => [...history, 'Clinician rejected this candidate interpretation.']);
                }}>Reject</button>
              </div>
              {refining && (
                <form className="tacit-form" onSubmit={(event) => {
                  event.preventDefault();
                  const revised = refinedConcept.trim() || activeConcept;
                  setCandidateConcept(revised);
                  setKnowledgeVersion((version) => version + 1);
                  setKnowledgeStatus('Observed once');
                  setReviewChoice('Refined by clinician');
                  setReviewHistory((history) => [...history, `Version ${knowledgeVersion + 1}: clinician refined the concept to “${revised}”.`]);
                  setRefining(false);
                }}>
                  <label htmlFor="tacit-refinement">Edit the candidate concept</label>
                  <input id="tacit-refinement" value={refinedConcept} onChange={(event) => setRefinedConcept(event.target.value)} />
                  <button type="submit" className="hx-btn">Save refinement</button>
                </form>
              )}
              {knowledgeStatus === 'Observed once' && <div className="tacit-payoff"><strong>Candidate knowledge item · TK-CRC-242-v{knowledgeVersion}</strong><span>1 decision episode · {capture.decision_type} · {capture.confidence} confidence</span></div>}
              {knowledgeStatus === 'Observed once' && (
                <label className="tacit-representation">
                  Where might this knowledge belong?
                  <select value={representationChoice} onChange={(event) => setRepresentationChoice(event.target.value)}>
                    {representations.map((representation) => <option key={representation}>{representation}</option>)}
                  </select>
                </label>
              )}
              {allowedToValidate && (
                <button type="button" className="hx-btn primary" onClick={() => {
                  validateFactor(activeConcept);
                  setReviewHistory((history) => [...history, 'Clinician validated this concept for the walkthrough; no institutional rule created.']);
                }}>Validate for this synthetic walkthrough</button>
              )}
              {reviewChoice && <p className="tacit-muted" role="status">{reviewChoice}. Review state is local to this demo and does not alter a clinical data model.</p>}
              {reviewHistory.length > 0 && <ol className="tacit-review-history" aria-label="This item’s review history">{reviewHistory.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ol>}
            </>
          ) : <p>Capture an explanation to create a candidate knowledge item. You can inspect the population view at any time.</p>}
        </Panel>

        <Panel title="Claim → source → scrutiny">
          {capture ? (
            <div className="tacit-provenance">
              <div><span>Clinician’s exact words</span><blockquote>{capture.original_explanation}</blockquote></div>
              <div><span>Model interpretation · tentative</span><p>{capture.interpretation}</p></div>
              <dl className="tacit-facts">
                <dt>Knowledge item</dt><dd>{capture.knowledge_item_id}</dd>
                <dt>Case / hospital</dt><dd>{capture.case_id} · {capture.hospital}</dd>
                <dt>Captured</dt><dd>{new Date(capture.timestamp).toLocaleString()}</dd>
                <dt>Created by</dt><dd>{capture.created_by}</dd>
                <dt>Evidence timing</dt><dd>{capture.evidence_timing}</dd>
              </dl>
              <p className="tacit-data-note">{capture.review_history.join(' ')}</p>
            </div>
          ) : <p className="tacit-muted">The clinician’s wording and the model’s interpretation will remain separate and inspectable here.</p>}
        </Panel>

        <Panel title={horizon === 'future' ? 'Similar post-decision notes in the synthetic cohort' : 'Cross-hospital knowledge review'} actions={<Pill tone="info">{horizon === 'future' ? `${related?.observation_count ?? 0} observations` : 'Not in six months'}</Pill>}>
          {horizon === 'future' && related?.examples.length ? related.examples.map((item) => (
            <blockquote className="tacit-example" key={item.episode_id}>
              <p>“{item.clinician_explanation}”</p>
              <small>{item.episode_id} · {item.hospital} · note not available at decision time</small>
            </blockquote>
          )) : horizon === 'future'
            ? <p className="tacit-muted">The retrospective synthetic analysis has not loaded yet.</p>
            : <p className="tacit-future-disabled">Repeated cross-hospital notes need the future platform. This six-month view keeps only the clinician-confirmed local observation.</p>}
          {related && horizon === 'future' && (
            <p><strong>Representation to consider:</strong> {related.representation}. ECOG may be related, but may not describe operative reserve.</p>
          )}
        </Panel>

        {horizon === 'six-months' && renderCoverage()}

        {validatedConcepts.length > 0 && (
          <Panel title="Prospective check · next similar patient" actions={<Pill tone="ok">Human-validated for demo</Pill>}>
            <p>{validatedConcepts[0]} has influenced reviewed synthetic treatment decisions, but this context is not available for the next patient.</p>
            <p><strong>Decision context incomplete.</strong> Has this factor been assessed?</p>
            <div className="tacit-actions">
              <button type="button" className="hx-btn primary" onClick={() => { setProspectiveCase(true); setProspectiveAssessment(null); setAlertChoice(null); setDecisionB(null); setStep('case-b'); }}>Open next synthetic case</button>
              <button type="button" className="hx-btn" onClick={() => setProspectiveAssessment('Not assessed')}>Not assessed</button>
            </div>
            {prospectiveAssessment && <p className="tacit-muted" role="status">{prospectiveAssessment}; the treatment decision remains with the clinician.</p>}
          </Panel>
        )}
      </div>
    );
  };

  const renderExplorer = () => (
    <div className="tacit-explorer">
      {horizon === 'future' ? (
        <>
          <Panel
            title="Which treatment decisions cannot be explained by the information we routinely capture?"
            actions={(
              <label className="tacit-size-control">
                Synthetic cases
                <select value={datasetSize} onChange={(event) => setDatasetSize(Number(event.target.value))}>
                  {[400, 1200, 4000].map((size) => <option key={size} value={size}>{size.toLocaleString()}</option>)}
                </select>
              </label>
            )}
          >
            {!analysis || !analysisReady
              ? analysisError ? <p role="alert">{analysisError}</p> : <Working label="Generating synthetic decision-episode analysis" hint="calculating aggregate counts" />
              : (
              <>
                <div className="tacit-metrics">
                  <Metric label="Decision episodes analysed" value={analysis.metrics.episodes_analysed.toLocaleString()} detail="Generated deterministically in code" />
                  <Metric label="Comparable historical cases" value={analysis.metrics.comparable_episodes.toLocaleString()} detail="Retrieved with weighted context" />
                  <Metric label="Potentially missing context" value={analysis.metrics.potentially_missing_context.toLocaleString()} detail={`${analysis.metrics.unexplained_rate}% of generated cohort`} />
                  <Metric label="Notes recorded after decisions" value={analysis.metrics.decisions_with_post_decision_context.toLocaleString()} detail="Not used in original comparison" />
                  <Metric label="After validated factors" value={`${analysis.metrics.unexplained_rate_after_validated_factors}%`} detail={`${analysis.metrics.unexplained_after_validated_factors.toLocaleString()} remain unresolved`} />
                  <Metric label="Recurring candidate factors" value={analysis.metrics.recurring_candidate_factors.toLocaleString()} detail="Based on synthetic post-decision notes" />
                  <Metric label="Clinician-validated factors" value={analysis.metrics.validated_factors.toLocaleString()} detail="Only those reviewed in this session" />
                </div>
                <div className="tacit-rate-compare">
                  <strong>Unexplained pathway variation</strong>
                  <span>Before reviewed factors: {analysis.metrics.unexplained_rate}%</span>
                  <span>After reviewed factors: {analysis.metrics.unexplained_rate_after_validated_factors}%</span>
                  <small>The change only considers factors a clinician explicitly validated in this demo. It does not mean one treatment is correct.</small>
                </div>
                <p className="tacit-data-note">{analysis.analysis_note} These counts are synthetic, not clinical performance measures.</p>
              </>
            )}
          </Panel>
          {analysis && analysisReady && (
            <Panel title="Candidate hidden factors · select a row to inspect evidence">
              <DataTable
                rows={analysis.factors}
                rowKey={(factor) => factor.concept}
                selected={expandedConcept}
                onSelect={(factor) => setExpandedConcept(expandedConcept === factor.concept ? null : factor.concept)}
                columns={[
                  { key: 'concept', label: 'Candidate factor' },
                  { key: 'observation_count', label: 'Notes', render: (factor) => factor.observation_count.toLocaleString() },
                  { key: 'confidence', label: 'Evidence signal · synthetic' },
                  { key: 'status', label: 'Knowledge status', render: (factor) => <Pill tone={statusTone(factor.status)}>{factor.status}</Pill> },
                ]}
              />
              {analysis.factors.filter((factor) => factor.concept === expandedConcept).map((factor) => (
                <FactorDetails key={factor.concept} factor={factor} onValidate={() => validateFactor(factor.concept)} validated={validatedConcepts.includes(factor.concept)} />
              ))}
            </Panel>
          )}
        </>
      ) : (
        <>
          <Panel title="Population analysis · not in six months" actions={<Pill tone="neutral">Needs the future platform</Pill>}>
            <p className="tacit-future-disabled">A cross-hospital retrospective analysis needs the future federated platform. The six-month version can capture a local, provenance-tagged rationale but cannot retrieve or compare the full synthetic history.</p>
          </Panel>
          {renderCoverage()}
        </>
      )}
    </div>
  );

  return (
    <div className="tacit-workspace" data-theme={theme}>
      <a className="tacit-skip" href="#tacit-main">Skip to current case</a>
      <HospitalShell
        module="Tumour board · tacit knowledge"
        guide={<StoryGuide steps={steps} current={step} onGo={goTo} nextLabel={step === 'case-a' ? 'Review today’s decision' : step === 'case-b' ? 'Compare historical cases' : step === 'capture' ? 'Review knowledge' : undefined} />}
        nav={steps.map((item, index) => ({ id: item.id, label: item.title, badge: index === 2 && hasDifference ? '!' : undefined }))}
        active={step}
        onNav={goTo}
        patient={step === 'case-a'
          ? { id: 'MDT-241', name: 'Patient A', age: 68, sex: 'Female', diagnosis: 'Stage III colorectal cancer · ECOG 1', ward: 'Tumour board' }
          : { id: prospectiveCase && step === 'case-b' ? 'MDT-243' : 'MDT-242', name: focusPatient, age: prospectiveCase && step === 'case-b' ? 70 : 69, sex: 'Male', diagnosis: 'Stage III colorectal cancer · ECOG 1', ward: 'Tumour board' }}
        toolbar={
          <>
            <span className="tacit-control-label">Horizon</span>
            <button type="button" className={`hx-btn ${horizon === 'six-months' ? 'primary' : ''}`} aria-pressed={horizon === 'six-months'} onClick={() => setHorizon('six-months')}>In six months</button>
            <button type="button" className={`hx-btn ${horizon === 'future' ? 'primary' : ''}`} aria-pressed={horizon === 'future'} onClick={() => setHorizon('future')}>The future</button>
            <span className="hx-spacer" />
            <span className="tacit-control-label">Theme</span>
            <button type="button" className={`hx-btn ${theme === 'light' ? 'primary' : ''}`} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
            <button type="button" className={`hx-btn ${theme === 'dark' ? 'primary' : ''}`} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
          </>
        }
      >
        <div id="tacit-main" className="tacit-main">
          <div className="tacit-notice">
            <Pill tone="info">Synthetic MDT walkthrough</Pill>
            <span>Hackathon prototype – synthetic data – not for clinical use. Treatment choices remain with the clinician.</span>
          </div>
          {message && <div className="tacit-message" role="status">{message}</div>}

          {step === 'case-a' && (
            <div className="tacit-columns">
              <Panel title="Patient A · MDT-241">
                <p className="tacit-case-lede">A 68-year-old with stage III colorectal cancer. The usual pathway in this example is immediate surgery.</p>
                <dl className="tacit-facts">
                  <dt>Stage / site</dt><dd>III · sigmoid</dd><dt>Histology</dt><dd>Adenocarcinoma</dd>
                  <dt>Performance status</dt><dd>ECOG 1</dd><dt>Biomarkers</dt><dd>MMR proficient</dd>
                  <dt>Comorbidity</dt><dd>None recorded</dd><dt>Previous treatment</dt><dd>None</dd>
                </dl>
                <div className="tacit-guideline"><strong>Usual pathway: immediate surgery</strong><span>Clinical decision remains with the tumour board.</span></div>
                <ChoiceButtons value={decisionA} onChange={(choice) => { setDecisionA(choice); setAlertChoice(null); }} />
              </Panel>
              <Panel title="No assistant interruption">
                <p>Choose a treatment pathway as you normally would. The system only raises a quiet question if a meaningful difference appears among comparable synthetic cases.</p>
                <Pill tone={decisionA ? 'ok' : 'neutral'}>{decisionA ? `Recorded: ${decisionA}` : 'No decision recorded yet'}</Pill>
              </Panel>
            </div>
          )}

          {step === 'case-b' && (
            <div className="tacit-columns">
              <Panel title={`${focusPatient} · ${prospectiveCase ? 'MDT-243' : 'MDT-242'}`}>
                <p className="tacit-case-lede">A similar stage III sigmoid colorectal cancer case. The tumour-board workflow is unchanged; the available structured context does not include every factor that may matter.</p>
                <dl className="tacit-facts">
                  <dt>Stage / site</dt><dd>III · sigmoid</dd><dt>Histology</dt><dd>Adenocarcinoma</dd>
                  <dt>Age</dt><dd>{prospectiveCase ? '70' : '69'}</dd><dt>Performance status</dt><dd>ECOG 1</dd>
                  <dt>Biomarkers</dt><dd>MMR proficient</dd><dt>Comorbidity</dt><dd>None recorded</dd>
                  <dt>Previous treatment</dt><dd>None</dd>
                </dl>
                <div className="tacit-guideline"><strong>Available pathway: immediate surgery</strong><span>Comparable decisions are retrieved using structured context, not exact-row equality.</span></div>
                {prospectiveCase && validatedConcepts.length > 0 && !prospectiveAssessment && (
                  <div className="tacit-prospective">
                    <strong>Decision context incomplete</strong>
                    <span>{validatedConcepts[0]} has influenced reviewed decisions, but I cannot determine it for this patient. Has it been assessed?</span>
                    <div className="tacit-actions">
                      <button type="button" className="hx-btn" onClick={() => setProspectiveAssessment('Assessed')}>Mark assessed</button>
                      <button type="button" className="hx-btn" onClick={() => setProspectiveAssessment('Not available')}>Not available</button>
                    </div>
                  </div>
                )}
                {prospectiveAssessment && <p className="tacit-muted" role="status">{prospectiveAssessment}. The system does not select or block a treatment.</p>}
                <ChoiceButtons value={decisionB} onChange={(choice) => { setDecisionB(choice); setAlertChoice(null); }} />
              </Panel>
              <Panel title="Quiet background check">
                <p>Once you record a pathway, the system retrieves similar historical decisions and checks whether the structured context explains the difference.</p>
                {decisionB && decisionA && decisionB !== decisionA && !alertChoice && !analysisReady && (
                  analysisError ? <p role="alert">{analysisError}</p> : <Working label="Checking similar synthetic cases" hint="structured context only" />
                )}
                  {decisionB && decisionA && decisionB !== decisionA && !alertChoice && analysisReady && analysis?.comparison.cases.length === 0 && (
                  <Pill tone="neutral">No sufficiently comparable synthetic cases were found.</Pill>
                )}
                {decisionB && decisionA && decisionB !== decisionA && !alertChoice && analysisReady && Boolean(analysis?.comparison.cases.length) && (
                  <div className="tacit-subtle-alert" role="status">
                    <strong>I may be missing some context</strong>
                    <p>This pathway differs from several comparable cases. I cannot explain the difference from the recorded information.</p>
                    <div className="tacit-actions">
                      <button type="button" className="hx-btn primary" onClick={() => goTo('capture')}>Explain</button>
                      <button type="button" className="hx-btn" onClick={() => goTo('compare')}>Show comparison</button>
                      <button type="button" className="hx-btn" onClick={() => setAlertChoice('Dismissed')}>Dismiss</button>
                    </div>
                  </div>
                )}
                {decisionB && decisionA && decisionB === decisionA && <Pill tone="ok">No unexplained difference found in this walkthrough.</Pill>}
                {!decisionB && <Pill tone="neutral">Waiting for the clinician’s choice</Pill>}
              </Panel>
            </div>
          )}

          {step === 'compare' && hasDifference && renderCaseComparison()}
          {step === 'compare' && !hasDifference && <Panel title="No unexplained difference"><p>Choose different pathways for Patient A and Patient B to inspect the comparison.</p></Panel>}

          {step === 'capture' && (
            <div className="tacit-columns">
              <Panel title="Explain the difference">
                <p>The clinician is never required to answer. Try the seeded synthetic rationale or enter your own words.</p>
                <form className="tacit-form" onSubmit={captureExplanation}>
                  <label htmlFor="tacit-explanation">Clinician’s explanation</label>
                  <textarea id="tacit-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} minLength={6} maxLength={1200} required />
                  <button type="submit" className="hx-btn primary" disabled={loading || explanation.trim().length < 6}>
                    {loading && <span className="hx-spinner" aria-hidden />}
                    {loading ? 'Examining this explanation…' : capture ? 'Update candidate interpretation' : 'Capture explanation'}
                  </button>
                </form>
              </Panel>
              <Panel title="Agent’s public summary">
                <Backstage stages={backstageStages} running={analysisVisible} holdLast release={!loading} onFinished={() => setAnalysisVisible(false)} note="Only this short explanation is sent to the Copilot SDK. The historical cohort is filtered and summarized in code." />
                {capture ? (
                  <div className="tacit-provenance">
                    <div><span>Clinician’s exact words</span><blockquote>{capture.original_explanation}</blockquote></div>
                    <div><span>Possible interpretation · not a rule</span><p>{capture.interpretation}</p></div>
                    <Pill tone="warn">{capture.concept} · Hypothesised · Low confidence</Pill>
                    <p className="tacit-data-note">One synthetic decision episode. The model’s interpretation does not rewrite the clinician’s words.</p>
                    <button type="button" className="hx-btn" onClick={() => setStep('pattern')}>Review this knowledge item</button>
                  </div>
                ) : !loading && <p className="tacit-muted">The agent will preserve the exact statement, identify a possible factor, and explain its uncertainty.</p>}
              </Panel>
            </div>
          )}

          {step === 'pattern' && renderKnowledgeReview()}
          {step === 'candidate' && renderExplorer()}

          <div className="tacit-footline">
            <span>{horizon === 'future' ? 'Simulated federated future · synthetic cases' : 'In six months · minimal tumour-board dataset'}</span>
            <span>Viewing {focusPatient} · step {currentIndex + 1} of {steps.length} · {analysis?.size.toLocaleString() ?? '…'} generated episodes</span>
          </div>
        </div>
      </HospitalShell>
    </div>
  );
}

function ChoiceButtons({ value, onChange }: { value: Choice | null; onChange: (value: Choice) => void }) {
  const choices: Choice[] = ['Immediate surgery', 'Systemic therapy first'];
  return (
    <div className="tacit-choice">
      <span>MDT treatment pathway</span>
      {choices.map((choice) => (
        <button key={choice} type="button" className={`hx-btn ${value === choice ? 'primary' : ''}`} aria-pressed={value === choice} onClick={() => onChange(choice)}>
          Choose {choice}{value === choice ? ' ✓' : ''}
        </button>
      ))}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="tacit-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function FactorDetails({ factor, onValidate, validated }: { factor: TacitFactor; onValidate: () => void; validated: boolean }) {
  return (
    <div className="tacit-inspection">
      <div className="tacit-factor-heading">
        <div><strong>{factor.concept}</strong><p>{factor.decision_type} · {factor.representation}</p></div>
        <Pill tone={statusTone(factor.status)}>{validated ? 'Clinician validated · this session' : factor.status}</Pill>
      </div>
      <div className="tacit-factor-counts">
        <span>{factor.supporting_count} supporting notes</span><span>{factor.counterexample_count} counterexamples</span><span>{factor.confidence} confidence</span>
      </div>
      <div className="tacit-columns tacit-evidence-columns">
        <section><h4>Supporting observations</h4>{factor.examples.map((item) => <blockquote className="tacit-example" key={item.episode_id}><p>“{item.clinician_explanation}”</p><small>{item.episode_id} · {item.hospital} · available at decision: {item.available_at_decision ? 'yes' : 'no'}</small></blockquote>)}</section>
        <section><h4>Counterexamples · not a universal rule</h4>{factor.counterexamples.map((item) => <blockquote className="tacit-example" key={item.episode_id}><p>{item.note}</p><small>{item.episode_id} · {item.hospital} · {item.decision}</small></blockquote>)}</section>
      </div>
      <ol className="tacit-review-history" aria-label="Knowledge review history">{factor.review_history.map((item, index) => (
        <li key={`${item.status}-${index}`}>
          <strong>{item.status}</strong> · {item.status === 'Clinician validated' && validated
            ? 'Validated in this walkthrough only; not persisted.'
            : item.detail}
        </li>
      ))}</ol>
      {!validated && factor.supporting_count > 1 && <button type="button" className="hx-btn" onClick={onValidate}>Validate for this synthetic walkthrough</button>}
      {!validated && factor.supporting_count <= 1 && <p className="tacit-muted">One observation is not enough to validate this concept.</p>}
      {validated && <p className="tacit-muted">Validation is local to this walkthrough. It creates no shared rule or clinical model change.</p>}
    </div>
  );
}
