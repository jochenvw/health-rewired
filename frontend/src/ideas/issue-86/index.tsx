import { useEffect, useState } from 'react';
import type { AgentResult } from '../../api';
import { api } from '../../api';
import { DataTable, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import episode from '../../../../sample-data/issue-86-audit-events.json';
import './audit.css';

export const meta: IdeaMeta = {
  id: '86',
  issue: 86,
  title: 'One audit trail for human and AI actions',
  tagline: 'Investigate a cancer-care incident by seeing what happened, who knew what, and when.',
};

type StepId = 'worklist' | 'timeline' | 'decision' | 'findings' | 'integrity' | 'conclusion';
type Horizon = 'six-months' | 'future';
type Theme = 'light' | 'dark';

const steps: StoryStep[] = [
  { id: 'worklist', title: 'Investigations', explain: 'Open a synthetic case where a chemotherapy dose was not adjusted after a kidney-function result.' },
  { id: 'timeline', title: 'Follow the timeline', explain: 'Human, system and AI actions appear together in the order they happened.' },
  { id: 'decision', title: 'Inspect the decision', explain: 'Compare the evidence available to the tumour board with information recorded later.' },
  { id: 'findings', title: 'Review the findings', explain: 'The assistant highlights a possible handoff gap and similar synthetic patterns; it does not decide why it happened.' },
  { id: 'integrity', title: 'Check the record', explain: 'A simulated chain check illustrates how an investigation could show whether records were changed.' },
  { id: 'conclusion', title: 'Your conclusion', explain: 'You decide what matters, record the root-cause conclusion and choose any corrective action.' },
];

const reviewStages: Stage[] = [
  { label: 'Reading the episode audit records', detail: 'Lab, tumour board, pharmacy, infusion and agent events', ms: 700 },
  { label: 'Comparing evidence at the decision time', detail: 'Available then versus recorded later', ms: 800 },
  { label: 'Preparing neutral findings for review', detail: 'Possible protocol gap · synthetic patterns', ms: 800 },
];

const navItems: { id: StepId; label: string }[] = [
  { id: 'worklist', label: 'Investigations' },
  { id: 'timeline', label: 'Episode timeline' },
  { id: 'decision', label: 'Decision evidence' },
  { id: 'findings', label: 'Assistant findings' },
  { id: 'integrity', label: 'Record integrity' },
  { id: 'conclusion', label: 'Inspector conclusion' },
];

export default function AuditTrail() {
  const [step, setStep] = useState<StepId>('worklist');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('issue-86-theme') as Theme) || 'light');
  const [selectedEvent, setSelectedEvent] = useState('mdt-recommendation');
  const [analysis, setAnalysis] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conclusion, setConclusion] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem('issue-86-theme', theme);
  }, [theme]);

  const selected = episode.events.find((event) => event.id === selectedEvent) ?? episode.events[2];

  const review = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await api.auditReview('Review what was known at the tumour board decision and identify any possible handoff gap.'));
    } catch {
      setError('The review service could not be reached. The synthetic timeline and decision evidence are still available.');
    } finally {
      setLoading(false);
    }
  };

  const go = (id: string) => {
    setStep(id as StepId);
  };

  const nextLabels: Partial<Record<StepId, string>> = {
    worklist: 'Open investigation',
    timeline: 'Inspect decision',
    decision: 'Open assistant findings',
    findings: 'Check record integrity',
    integrity: 'Write your conclusion',
  };

  return (
    <div className="hx audit86" data-theme={theme}>
      <a className="audit86-skip" href="#audit-main">Skip to main content</a>
      <div className="audit86-prototype">
        HACKATHON PROTOTYPE · SYNTHETIC DATA · NOT FOR CLINICAL USE
        <span className="audit86-prototype-right">Investigation workspace · Demo records only</span>
      </div>
      <header className="audit86-header">
        <div className="audit86-brand">
          <span className="audit86-mark">HR</span>
          <div>
            <strong>Health Rewired</strong>
            <span>Oncology safety review · Munich</span>
          </div>
        </div>
        <div className="audit86-header-controls">
          <div className="audit86-control" aria-label="Timeline horizon">
            <span>View</span>
            <button type="button" aria-pressed={horizon === 'six-months'} onClick={() => setHorizon('six-months')}>
              In six months
            </button>
            <button type="button" aria-pressed={horizon === 'future'} onClick={() => setHorizon('future')}>
              The future
            </button>
          </div>
          <div className="audit86-control" aria-label="Colour theme">
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>
      </header>

      <section className="audit86-context" aria-label="Current investigation">
        <div>
          <span className="audit86-eyebrow">OPEN INVESTIGATION · {episode.case_id}</span>
          <h1>{episode.title}</h1>
          <p>{episode.episode} · Synthetic patient {episode.patient.id} · {episode.patient.diagnosis}</p>
        </div>
        <div className="audit86-context-status">
          <Pill tone="warn">Review in progress</Pill>
          <span>7 records · 3 actor types</span>
        </div>
      </section>

      <div className="audit86-layout">
        <nav className="audit86-nav" aria-label="Investigation sections">
          <span className="audit86-eyebrow">CASE REVIEW</span>
          {navItems.map((item, index) => (
            <button key={item.id} type="button" className={step === item.id ? 'active' : ''} onClick={() => go(item.id)}>
              <span className="audit86-nav-number">{index + 1}</span>
              {item.label}
            </button>
          ))}
          <div className="audit86-human-note">
            <strong>Inspector-led review</strong>
            <span>The assistant organises evidence. You decide what it means.</span>
          </div>
        </nav>

        <main className="audit86-main" id="audit-main">
          <StoryGuide steps={steps} current={step} onGo={go} nextLabel={nextLabels[step]} />
          <div className="audit86-toolbar">
            <span><strong>Case {episode.case_id}</strong> · {episode.patient.id}</span>
            <span className="audit86-horizon-note">
              {horizon === 'future' ? 'Full future view · cross-system records shown' : 'Six-month view · minimal tumour-board dataset'}
            </span>
          </div>

          {step === 'worklist' && (
            <div className="audit86-two-col">
              <Panel title="Investigations · Open">
                <div className="audit86-case-row">
                  <span className="audit86-case-priority">REVIEW</span>
                  <div>
                    <strong>{episode.title}</strong>
                    <span>{episode.case_id} · {episode.episode} · 7 synthetic records</span>
                  </div>
                  <Pill tone="warn">Needs review</Pill>
                  <button type="button" className="hx-btn primary" onClick={() => go('timeline')}>Open case</button>
                </div>
                <DataTable
                  rowKey={(row) => row.id}
                  rows={[
                    { id: 'AE-2026-038', issue: 'Treatment start delayed after pathology addendum', department: 'Tumour board', status: 'Evidence gathering' },
                    { id: 'AE-2026-032', issue: 'AI draft used an outdated medication list', department: 'Medical oncology', status: 'Inspector review' },
                    { id: 'AE-2026-021', issue: 'Infusion handoff missing from episode record', department: 'Day unit', status: 'Awaiting records' },
                  ]}
                  columns={[
                    { key: 'id', label: 'Case' },
                    { key: 'issue', label: 'Incident' },
                    { key: 'department', label: 'Department' },
                    { key: 'status', label: 'Status' },
                  ]}
                />
                <p className="audit86-synthetic-note">Other worklist entries are synthetic examples for this prototype.</p>
              </Panel>
              <Panel title="What this review brings together">
                <ul className="audit86-source-list">
                  <li><span>01</span> Laboratory result and availability time</li>
                  <li><span>02</span> Tumour-board action and recommendation</li>
                  <li><span>03</span> AI preparation, pharmacy order and infusion record</li>
                  <li><span>04</span> Later pathology addendum and record check</li>
                </ul>
                <div className="audit86-caution">The records support an investigation; they do not establish cause or responsibility.</div>
              </Panel>
            </div>
          )}

          {step === 'timeline' && (
            <div className="audit86-two-col audit86-timeline-layout">
              <Panel title="Episode timeline · chronological">
                <ol className="audit86-timeline">
                  {episode.events.map((event) => {
                    const unavailable = horizon === 'six-months' && !event.minimalDataset;
                    return (
                      <li key={event.id} className={`${selectedEvent === event.id ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`}>
                        <button type="button" disabled={unavailable} onClick={() => setSelectedEvent(event.id)}>
                          <span className="audit86-event-time">{event.time}<small>{event.date}</small></span>
                          <span className={`audit86-actor-dot ${event.kind}`} aria-hidden />
                          <span className="audit86-event-copy">
                            <strong>{event.summary}</strong>
                            <span>{event.source} · {event.actor}</span>
                            {unavailable && <em>Needs cross-system records · not in six months</em>}
                          </span>
                          {unavailable ? <Pill>Future only</Pill> : <Pill tone={event.kind === 'agent' ? 'info' : event.kind === 'human' ? 'ok' : 'neutral'}>{event.kind}</Pill>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="audit86-legend"><span>Human</span><span>System</span><span>AI agent</span></div>
              </Panel>
              <Panel title="Selected record">
                <span className="audit86-eyebrow">{selected.source} · {selected.time}</span>
                <h2 className="audit86-detail-title">{selected.summary}</h2>
                <p>{selected.detail}</p>
                <dl className="audit86-facts">
                  <dt>Actor</dt><dd>{selected.actor}</dd>
                  <dt>Available in record</dt><dd>{selected.date} · {selected.availableAt}</dd>
                  <dt>Source record</dt><dd>{selected.record}</dd>
                </dl>
              </Panel>
            </div>
          )}

          {step === 'decision' && (
            <div className="audit86-two-col">
              <Panel title={episode.decision.title}>
                <p className="audit86-lead">{episode.decision.decision}</p>
                <span className="audit86-eyebrow">AVAILABLE WHEN THE BOARD DECIDED</span>
                <div className="audit86-evidence-list">
                  {episode.decision.available_then.map((item) => (
                    <article key={item.label}>
                      <Pill tone="ok">Available</Pill>
                      <div><strong>{item.label}: {item.value}</strong><span>{item.source} · available {item.available_at}</span></div>
                    </article>
                  ))}
                </div>
                <span className="audit86-eyebrow">RECORDED AFTER THE DECISION</span>
                <div className="audit86-evidence-list later">
                  {episode.decision.arrived_later.map((item) => (
                    <article key={item.label}>
                      <Pill tone="warn">Later</Pill>
                      <div><strong>{item.label}: {item.value}</strong><span>{item.source} · available {item.available_at}</span></div>
                    </article>
                  ))}
                </div>
                <dl className="audit86-facts">
                  <dt>Guideline shown</dt><dd>{episode.decision.guideline}</dd>
                  <dt>Agent model shown</dt><dd>{episode.decision.model}</dd>
                </dl>
              </Panel>
              <div className="audit86-side-stack">
                <Panel title="What this comparison tells you">
                  <p>The eGFR result was already in the record before the board decision. The pathology addendum arrived later and was not available then.</p>
                  <div className="audit86-caution">Availability is not proof that a person saw or considered a record.</div>
                </Panel>
                {horizon === 'six-months' ? <CoveragePanel /> : (
                  <Panel title="Future view adds">
                    <ul className="audit86-plain-list">
                      <li>Pharmacy and infusion handoffs in the same timeline</li>
                      <li>Agent actions, model version and cited records</li>
                      <li>Cross-department synthetic patterns</li>
                    </ul>
                  </Panel>
                )}
              </div>
            </div>
          )}

          {step === 'findings' && (
            <div className="audit86-two-col">
              <Panel title={analysis?.headline ?? 'Assistant review'} actions={<Pill tone={analysis?.mode === 'copilot' ? 'ok' : 'neutral'}>{analysis?.mode === 'copilot' ? 'Copilot SDK' : 'Synthetic demo'}</Pill>}>
                {!analysis && !error && (
                  <button type="button" className="hx-btn primary" disabled={loading} onClick={() => void review()}>
                    {loading ? <><span className="hx-spinner" aria-hidden /> Reviewing the episode…</> : 'Assemble and review timeline'}
                  </button>
                )}
                {(loading || analysis) && (
                  <Backstage
                    title="Behind the scenes · audit review"
                    stages={reviewStages}
                    running={loading || Boolean(analysis)}
                    holdLast
                    release={!loading}
                    note="The assistant reads only this synthetic episode. It does not decide the root cause."
                  />
                )}
                {error && <p className="audit86-error" role="alert">{error}</p>}
                {analysis?.note && <p className="audit86-synthetic-note">{analysis.note}</p>}
                {analysis && (
                  <div className="audit86-agent-blocks" aria-live="polite">
                    {analysis.blocks
                      .filter((block) => horizon === 'future' || !/similar|protocol deviation/i.test(block.title))
                      .map((block) => (
                        <section key={block.title} className={`audit86-agent-block ${block.severity ?? 'info'}`}>
                          <h3>{block.title}</h3>
                          {block.body && <p>{block.body}</p>}
                          {block.items?.map((item) => (
                            <div className="audit86-agent-item" key={`${block.title}-${item.label}`}>
                              <strong>{item.label}</strong>
                              {item.detail && <span>{item.detail}</span>}
                              {item.source && <small>Source: {item.source}</small>}
                            </div>
                          ))}
                        </section>
                      ))}
                    {horizon === 'six-months' && (
                      <div className="audit86-unavailable">
                        <strong>Cross-system protocol checks and similar-case comparisons are not available in six months.</strong>
                        <span>They need pharmacy, infusion and other hospital records beyond the minimal tumour-board dataset.</span>
                      </div>
                    )}
                  </div>
                )}
                {!analysis && !loading && !error && <p>The assistant will assemble this episode's records into a neutral review.</p>}
                {error && <button type="button" className="hx-btn" onClick={() => void review()}>Try the review again</button>}
              </Panel>
              <Panel title="Human review stays in control">
                <p>The assistant can point to records and possible gaps. It cannot decide why the event happened, assign responsibility or choose corrective action.</p>
                <div className="audit86-review-state"><span className="audit86-status-dot" /> Inspector judgment required</div>
                <p className="audit86-synthetic-note">Similar-case records shown in The future are synthetic examples, not measured hospital data.</p>
              </Panel>
            </div>
          )}

          {step === 'integrity' && (
            <div className="audit86-integrity-grid">
              <Panel title="Audit record chain">
                <div className="audit86-integrity-status"><span>✓</span><div><strong>{episode.integrity.status}</strong><small>Simulated chain check · {episode.integrity.checked_at}</small></div><Pill tone="ok">Illustrative</Pill></div>
                <div className="audit86-chain">
                  {episode.events.map((event, index) => (
                    <div key={event.id} className="audit86-chain-item"><span>{String(index + 1).padStart(2, '0')}</span><strong>{event.source}</strong><code>{index === episode.events.length - 1 ? episode.integrity.digest : `SIM-${(index + 1).toString(16)}a${(index + 4).toString(16)}…`}</code></div>
                  ))}
                </div>
                <p className="audit86-caution">{episode.integrity.note}</p>
              </Panel>
              <Panel title="What this does and does not show">
                <p>This screen demonstrates how linked records could be checked during an investigation.</p>
                <ul className="audit86-plain-list">
                  <li>It shows a simulated sequence and illustrative identifiers.</li>
                  <li>It does not use cryptographic proofs or protected storage.</li>
                  <li>Inspectors still need to assess source completeness and context.</li>
                </ul>
              </Panel>
            </div>
          )}

          {step === 'conclusion' && (
            <div className="audit86-two-col">
              <Panel title="Inspector's conclusion">
                <label className="audit86-conclusion-label" htmlFor="audit-conclusion">What do you conclude from the available records?</label>
                <textarea id="audit-conclusion" rows={6} value={conclusion} onChange={(event) => { setConclusion(event.target.value); setSaved(false); }} placeholder="Write your assessment, the remaining questions and any corrective action to consider." />
                <button type="button" className="hx-btn primary" disabled={!conclusion.trim()} onClick={() => setSaved(true)}>
                  {saved ? 'Conclusion saved in this demo ✓' : 'Save my conclusion'}
                </button>
                <p className="audit86-synthetic-note">Your conclusion is local to this prototype and is not filed to a real record.</p>
              </Panel>
              <Panel title="Investigation summary">
                <div className="audit86-payoff">
                  <span className="audit86-eyebrow">WHAT THE RECORDS SHOW</span>
                  <h2>One timeline. One decision point. Your judgment.</h2>
                  <p>At 08:30, the eGFR result had been available for 48 minutes. The later pathology addendum was not available to the board. The order and infusion records show a possible handoff gap for you to assess.</p>
                  <Pill tone="warn">Possible deviation · not a root-cause finding</Pill>
                </div>
                {saved && <div className="audit86-review-state"><span className="audit86-status-dot" /> Your conclusion is recorded in the demo.</div>}
              </Panel>
            </div>
          )}
        </main>
      </div>
      <footer className="audit86-footer">
        <span>HACKATHON PROTOTYPE · SYNTHETIC DATA · NOT FOR CLINICAL USE</span>
        <span className="audit86-footer-spacer" />
        <span>Health Rewired · Investigation review</span>
      </footer>
    </div>
  );
}

function CoveragePanel() {
  return (
    <Panel title="What this needs from the minimal dataset">
      <p>5 of 5 example fields are listed; hospitals still need to record when each became available.</p>
      <ul className="audit86-coverage">
        <li><Pill tone="ok">Listed</Pill><span>Renal function <small>Lab · structured</small></span></li>
        <li><Pill tone="ok">Listed</Pill><span>MDT treatment recommendation <small>Tumour board · MDT form</small></span></li>
        <li><Pill tone="ok">Listed</Pill><span>Systemic therapy regimen <small>Treatment · structured</small></span></li>
        <li><Pill tone="ok">Listed</Pill><span>Dose reduction during treatment <small>Systemic therapy · structured</small></span></li>
        <li><Pill tone="ok">Listed</Pill><span>Full pathology report <small>Pathology · report text</small></span></li>
      </ul>
      <p className="audit86-synthetic-note">Source labels are working assumptions in the minimal dataset, not measured hospital coverage.</p>
      <div className="audit86-caution">Each hospital needs to map these fields and provide timestamps showing when data became available.</div>
    </Panel>
  );
}
