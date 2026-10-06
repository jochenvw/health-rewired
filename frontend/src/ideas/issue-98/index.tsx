import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
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
type Choice = 'X' | 'Y';
type MinimalDataset = { groups: { group: string; elements: { name: string; likely_source: string }[] }[] };
type CoverageField = { name: string; group: string; source: string };

const steps: StoryStep[] = [
  { id: 'case-a', title: 'Patient A', explain: 'Start with a synthetic case where the available data and the treatment choice agree.' },
  { id: 'case-b', title: 'Patient B', explain: 'This patient looks much the same on paper, but the board chooses a gentler option.' },
  { id: 'compare', title: 'Spot the difference', explain: 'The assistant notices a difference the structured record cannot yet explain. That is a question, not a judgement.' },
  { id: 'capture', title: 'Ask what is missing', explain: 'The assistant suggests possible missing context. You explain what you saw; nothing is added without your confirmation.' },
  { id: 'pattern', title: 'Look for a pattern', explain: 'Earlier synthetic cases contain similar remarks. Repeated context may point to a missing data concept.' },
  { id: 'candidate', title: 'Review the concept', explain: 'You decide whether the proposed field is useful. The system never changes its data model on its own.' },
];

const backstageStages: Stage[] = [
  { label: 'Compare the two synthetic MDT cases', detail: 'Stage, ECOG, biomarkers and labs' },
  { label: 'Preserve the clinician’s explanation', detail: 'Source and confirmation stay attached' },
  { label: 'Structure the observation', detail: 'Copilot SDK, or deterministic demo mode' },
];

const priorObservations = [
  { id: 'MDT-238', remark: 'Daughter supported the patient while walking from the car.' },
  { id: 'MDT-231', remark: 'Noticeably slower than at the previous visit; used arms to stand.' },
  { id: 'MDT-219', remark: 'Appeared more frail than ECOG suggested; spouse described a recent decline.' },
  { id: 'MDT-204', remark: 'Needed help getting out of the chair after the consultation.' },
];

const coverageNames = ['Age', 'WHO performance status', 'Reason for deviating from guideline or MDT recommendation'];

function findCoverageFields(dataset: MinimalDataset | null): CoverageField[] {
  if (!dataset) return [];
  return dataset.groups.flatMap((group) =>
    group.elements
      .filter((element) => coverageNames.includes(element.name))
      .map((element) => ({ name: element.name, group: group.group, source: element.likely_source })),
  );
}

export default function TacitKnowledge() {
  const [step, setStep] = useState<StepId>('case-a');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('issue-98-theme') === 'dark' ? 'dark' : 'light'));
  const [decisionA, setDecisionA] = useState<Choice | null>(null);
  const [decisionB, setDecisionB] = useState<Choice | null>(null);
  const [explanation, setExplanation] = useState('He looks much frailer than three weeks ago. His wife had to help him walk and he struggled to get out of the chair.');
  const [observation, setObservation] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [fieldDecision, setFieldDecision] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dataset, setDataset] = useState<MinimalDataset | null>(null);

  useEffect(() => {
    localStorage.setItem('issue-98-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.sampleData<MinimalDataset>('minimal-mdt-dataset.json').then(setDataset).catch(() => setDataset(null));
  }, []);

  const coverage = useMemo(() => findCoverageFields(dataset), [dataset]);
  const currentIndex = steps.findIndex((item) => item.id === step);
  const hasDifference = decisionA !== null && decisionB !== null && decisionA !== decisionB;
  const focusPatient = step === 'case-a' ? 'Patient A' : 'Patient B';

  const goTo = (target: string) => {
    const targetIndex = steps.findIndex((item) => item.id === target);
    if (targetIndex > currentIndex) {
      if (currentIndex === 0 && !decisionA) {
        setMessage('Choose a treatment for Patient A before continuing.');
        return;
      }
      if (targetIndex >= 2 && !decisionB) {
        setMessage('Choose a treatment for Patient B before comparing the cases.');
        return;
      }
      if (targetIndex >= 3 && !hasDifference) {
        setMessage('Choose different treatments for the two similar cases before asking the assistant to explain the difference.');
        return;
      }
      if (targetIndex >= 4 && !observation) {
        setMessage('Capture and confirm the missing context before looking for a pattern.');
        return;
      }
    }
    setMessage(null);
    setStep(target as StepId);
  };

  const captureExplanation = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setAnalysisVisible(true);
    setMessage(null);
    try {
      setObservation(await api.captureTacitKnowledge(explanation.trim()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The assistant could not be reached. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCoverage = () => (
    <Panel title="What this needs from the minimal dataset">
      <p className="tacit-coverage-intro">
        {coverage.length ? `${coverage.length} relevant fields are listed in the synthetic dataset. Availability below reflects their likely source, not a measured hospital check.` : 'Loading the synthetic minimal dataset…'}
      </p>
      <ul className="tacit-coverage-list">
        {coverage.map((field) => {
          const available = field.source === 'structured' || field.source === 'derived';
          const partial = field.source === 'MDT form' || field.source === 'report text';
          return (
            <li key={field.name}>
              <Pill tone={available ? 'ok' : partial ? 'warn' : 'crit'}>{available ? 'Usually available' : partial ? 'May be free text' : 'Often missing'}</Pill>
              <span><strong>{field.name}</strong><small>{field.group} · likely source: {field.source}</small></span>
            </li>
          );
        })}
      </ul>
      <h4>What each hospital would need to do</h4>
      <ul className="tacit-hospital-asks">
        <li>Map age from the existing patient record.</li>
        <li>Make WHO performance status available from the patient or clinic note.</li>
        <li>Record the reason for a guideline deviation in a consistent MDT field.</li>
      </ul>
      <small className="tacit-data-note">Source: /sample-data/minimal-mdt-dataset.json. “Likely source” is a working assumption, not an agreed standard.</small>
    </Panel>
  );

  return (
    <div className="tacit-workspace" data-theme={theme}>
      <a className="tacit-skip" href="#tacit-main">Skip to current case</a>
      <HospitalShell
        module="Tumour board · tacit knowledge"
        guide={<StoryGuide steps={steps} current={step} onGo={goTo} nextLabel={step === 'case-a' ? 'Compare Patient B' : step === 'case-b' ? 'Compare decisions' : step === 'capture' ? 'Review repeated remarks' : undefined} />}
        nav={steps.map((item, index) => ({ id: item.id, label: item.title, badge: index === 2 && hasDifference ? '!' : undefined }))}
        active={step}
        onNav={goTo}
        patient={step === 'case-a' ? { id: 'MDT-241', name: 'Patient A', age: 68, sex: 'Female', diagnosis: 'Stage III colorectal cancer · ECOG 1', ward: 'Tumour board' } : { id: 'MDT-242', name: 'Patient B', age: 69, sex: 'Male', diagnosis: 'Stage III colorectal cancer · ECOG 1', ward: 'Tumour board' }}
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
                <p className="tacit-case-lede">A 68-year-old with stage III colorectal cancer. This is the first of two similar cases.</p>
                <dl className="tacit-facts">
                  <dt>Stage</dt><dd>III · T3N1M0</dd>
                  <dt>ECOG</dt><dd>1</dd>
                  <dt>Biomarkers</dt><dd>MMR proficient · KRAS wild type</dd>
                  <dt>CEA</dt><dd>4.2 µg/L</dd>
                  <dt>Comorbidity</dt><dd>Controlled hypertension</dd>
                </dl>
                <div className="tacit-guideline"><strong>Guideline suggests treatment X</strong><span>Structured data supports the usual option.</span></div>
                <ChoiceButtons value={decisionA} onChange={setDecisionA} />
              </Panel>
              <Panel title="The clinical question">
                <p>What would you recommend at this tumour board?</p>
                <p className="tacit-muted">Choose X to record the usual recommendation for this case. Nothing is sent or filed.</p>
                <Pill tone={decisionA ? 'ok' : 'warn'}>{decisionA ? `Board choice recorded: treatment ${decisionA}` : 'Waiting for your treatment choice'}</Pill>
              </Panel>
            </div>
          )}

          {step === 'case-b' && (
            <div className="tacit-columns">
              <Panel title="Patient B · MDT-242">
                <p className="tacit-case-lede">A 69-year-old with a very similar stage III colorectal cancer profile.</p>
                <dl className="tacit-facts">
                  <dt>Stage</dt><dd>III · T3N1M0</dd>
                  <dt>ECOG</dt><dd>1</dd>
                  <dt>Biomarkers</dt><dd>MMR proficient · KRAS wild type</dd>
                  <dt>CEA</dt><dd>4.4 µg/L</dd>
                  <dt>Comorbidity</dt><dd>Controlled hypertension</dd>
                </dl>
                <div className="tacit-guideline"><strong>Guideline again suggests treatment X</strong><span>Structured data looks much like Patient A.</span></div>
                <ChoiceButtons value={decisionB} onChange={setDecisionB} />
              </Panel>
              <Panel title="The clinical question">
                <p>The board chooses a gentler treatment Y for this patient.</p>
                <p className="tacit-muted">Record the difference you want the assistant to investigate.</p>
                <Pill tone={decisionB ? 'ok' : 'warn'}>{decisionB ? `Board choice recorded: treatment ${decisionB}` : 'Waiting for your treatment choice'}</Pill>
              </Panel>
            </div>
          )}

          {step === 'compare' && (
            <div className="tacit-columns">
              <Panel title={hasDifference ? 'Unexplained decision difference detected' : 'No decision difference to explain'} actions={<Pill tone={hasDifference ? 'warn' : 'neutral'}>{hasDifference ? 'Needs context · not a judgement' : 'Choices match'}</Pill>}>
                {hasDifference ? (
                  <>
                    <p className="tacit-alert-copy">Based on the structured information currently available, treatment X would be expected for both cases. The board chose X for Patient A and Y for Patient B.</p>
                    <p><strong>“I cannot explain this decision from the data currently available to me.”</strong></p>
                    <p className="tacit-muted">This is a signal to ask what the data is missing — not evidence that the clinician is wrong.</p>
                  </>
                ) : <p>Choose different options for the two patients to see why the assistant asks for more context.</p>}
              </Panel>
              <Panel title="What might be missing?">
                <ul className="tacit-hypotheses">
                  <li>Functional decline not reflected in ECOG</li>
                  <li>Frailty or treatment tolerance concerns</li>
                  <li>Patient preference or caregiver situation</li>
                  <li>Recent toxicity or other context not in structured data</li>
                </ul>
                <p className="tacit-muted">These are possibilities to check with the clinician, not conclusions.</p>
              </Panel>
            </div>
          )}

          {step === 'capture' && (
            <div className="tacit-columns">
              <Panel title="What did you notice?">
                <p>The assistant asks about missing context rather than simply asking “Why?” Edit the example or enter your own explanation.</p>
                <form className="tacit-form" onSubmit={captureExplanation}>
                  <label htmlFor="tacit-explanation">Clinician’s explanation</label>
                  <textarea id="tacit-explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} minLength={6} maxLength={1200} required />
                  <button type="submit" className="hx-btn primary" disabled={loading || explanation.trim().length < 6}>
                    {loading && <span className="hx-spinner" aria-hidden />}
                    {loading ? 'Structuring your explanation…' : observation ? 'Update captured observation' : 'Capture this explanation'}
                  </button>
                </form>
              </Panel>
              <Panel title={observation?.headline ?? 'Newly captured clinical observation'} actions={observation && <Pill tone={observation.mode === 'copilot' ? 'ok' : 'neutral'}>{observation.mode === 'copilot' ? 'Copilot SDK' : 'Demo mode'}</Pill>}>
                <Backstage
                  stages={backstageStages}
                  running={analysisVisible}
                  holdLast
                  release={!loading}
                  onFinished={() => setAnalysisVisible(false)}
                  note="The agent structures what you said; it does not judge or change the treatment choice."
                />
                {observation ? (
                  <div className="tacit-agent-result">
                    {observation.note && <p className="tacit-muted">{observation.note}</p>}
                    {observation.blocks.map((block, index) => <RenderBlock key={index} block={block} />)}
                    <Pill tone="ok">Clinician confirmed · provenance retained</Pill>
                  </div>
                ) : !loading && <p className="tacit-muted">The confirmed observation will appear here with its source and capture method.</p>}
              </Panel>
            </div>
          )}

          {step === 'pattern' && (
            <div className="tacit-columns">
              {horizon === 'future' ? (
                <>
                  <Panel title="Similar remarks in earlier synthetic cases" actions={<Pill tone="info">4 examples · 12-case set</Pill>}>
                    <DataTable
                      rows={priorObservations}
                      rowKey={(row) => row.id}
                      columns={[
                        { key: 'id', label: 'Synthetic MDT case' },
                        { key: 'remark', label: 'Earlier clinician observation' },
                      ]}
                    />
                    <p className="tacit-data-note">Simulated pattern search across the future federated platform. No real patient record is queried.</p>
                  </Panel>
                  <Panel title="A repeated idea is emerging">
                    <p>Several clinicians describe a decline that ECOG does not capture well.</p>
                    <p><strong>Possible concept: Observed functional deterioration</strong></p>
                    <p className="tacit-muted">Candidate definition: A clinician-observed change in mobility or ability to rise, compared with the patient’s recent baseline.</p>
                  </Panel>
                </>
              ) : (
                <>
                  <Panel title="Cross-hospital pattern search" actions={<Pill tone="neutral">Not in six months</Pill>}>
                    <p className="tacit-future-disabled">Finding recurring remarks across hospitals needs the full federated platform. This step stays visible, but it is not available in the six-month version.</p>
                    <ul className="tacit-hypotheses">
                      {priorObservations.slice(0, 2).map((item) => <li key={item.id}>{item.remark}</li>)}
                    </ul>
                  </Panel>
                  {renderCoverage()}
                </>
              )}
            </div>
          )}

          {step === 'candidate' && (
            <div className="tacit-columns">
              {horizon === 'future' ? (
                <Panel title="Candidate data field · review required" actions={<Pill tone={fieldDecision ? 'ok' : 'warn'}>{fieldDecision ?? 'Human decision required'}</Pill>}>
                  <dl className="tacit-facts tacit-candidate-facts">
                    <dt>Field name</dt><dd><strong>Observed functional deterioration</strong></dd>
                    <dt>Definition</dt><dd>Clinician-observed decline in mobility or ability to rise, compared with recent baseline.</dd>
                    <dt>Possible values</dt><dd>No change · mild decline · marked decline · needs assistance</dd>
                    <dt>Relationship</dt><dd>Complements, does not replace, ECOG performance status.</dd>
                    <dt>Evidence</dt><dd>Repeated in similar synthetic remarks; illustrative mapping only.</dd>
                  </dl>
                  <p className="tacit-muted">Nothing changes in the data model unless you choose what should happen next.</p>
                  <div className="tacit-actions">
                    {['Approve as candidate', 'Merge with existing concept', 'Reject · insufficient evidence'].map((action) => (
                      <button key={action} type="button" className={`hx-btn ${fieldDecision === action ? 'primary' : ''}`} aria-pressed={fieldDecision === action} onClick={() => setFieldDecision(action)}>{action}</button>
                    ))}
                  </div>
                  {fieldDecision && <div className="tacit-payoff" role="status"><strong>Tacit knowledge does not have to remain tacit.</strong><span>{fieldDecision}. The clinical observation remains attached to its source; no schema was changed.</span></div>}
                </Panel>
              ) : (
                <>
                  <Panel title="The six-month payoff" actions={<Pill tone="ok">Works with the minimal dataset</Pill>}>
                    <div className="tacit-payoff"><strong>The decision is now understandable.</strong><span>Patient B’s clinician-confirmed functional decline is visible beside the MDT decision, with its source and capture method.</span></div>
                    <p className="tacit-muted">No cross-hospital pattern search or new field is claimed yet. The observation is captured locally as a rationale note.</p>
                  </Panel>
                  <Panel title="Candidate data field" actions={<Pill tone="neutral">Needs the future platform</Pill>}>
                    <div className="tacit-disabled-concept" aria-disabled="true">
                      <strong>Observed functional deterioration</strong>
                      <span>Candidate field · review unavailable</span>
                    </div>
                    <p className="tacit-muted">Repeated cross-hospital evidence is needed before proposing a new field. This step is not available in six months.</p>
                  </Panel>
                </>
              )}
            </div>
          )}

          <div className="tacit-footline">
            <span>{horizon === 'future' ? 'Simulated future platform · synthetic cases' : 'In six months · minimal tumour-board dataset'}</span>
            <span>Viewing {focusPatient} · {currentIndex + 1} of {steps.length}</span>
          </div>
        </div>
      </HospitalShell>
    </div>
  );
}

function ChoiceButtons({ value, onChange }: { value: Choice | null; onChange: (value: Choice) => void }) {
  return (
    <div className="tacit-choice">
      <span>MDT treatment choice</span>
      {(['X', 'Y'] as const).map((choice) => (
        <button key={choice} type="button" className={`hx-btn ${value === choice ? 'primary' : ''}`} aria-pressed={value === choice} onClick={() => onChange(choice)}>
          Choose treatment {choice}{value === choice ? ' ✓' : ''}
        </button>
      ))}
    </div>
  );
}
