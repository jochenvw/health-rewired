import { useRef, useState } from 'react';
import { api, type AgentResult, type PatientsLikeMeCohort, type PatientsLikeMeHorizon, type PatientsLikeMeMetric } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type StoryStep } from '../../hospital/Story';
import './patients-like-me.css';

export const meta = {
  id: '92',
  issue: 92,
  title: 'Patients like me',
  tagline: 'Discuss what happened to similar patients, with uncertainty and patient questions in view.',
};

const steps: StoryStep[] = [
  { id: 'profile', title: 'Patient profile', explain: 'Start with Davide’s recorded diagnosis and fitness, not a prediction.' },
  { id: 'matching', title: 'Why these patients?', explain: 'Inspect who is included, who is different, and what a tighter match costs.' },
  { id: 'outcomes', title: 'Treatments & outcomes', explain: 'Compare observed outcomes with their known denominators; these are not treatment recommendations.' },
  { id: 'limitations', title: 'What we cannot infer', explain: 'Review missing follow-up, small groups and differences in fitness before discussing the numbers.' },
  { id: 'questions', title: 'Patient questions', explain: 'Review and edit the assistant’s explanation, then approve a take-home draft for this demo only.' },
];

const nextLabels = ['Find similar patients', 'Compare observed outcomes', 'Review the limitations', 'Prepare patient questions'];
const cohortStages = [
  { label: 'Read synthetic patient P-046', detail: 'Davide Rinaldi · stage III low rectal cancer', ms: 400 },
  { label: 'Apply recorded matching criteria', detail: 'Local synthetic file only — no hospitals queried', ms: 650 },
  { label: 'Check outcome denominators and missing fields', detail: 'Keep unavailable results withheld rather than inventing a percentage' },
];
const explanationStages = [
  { label: 'Review cohort evidence and limitations', detail: 'Public work summary; not private model reasoning', ms: 500 },
  { label: 'Prepare a patient-facing explanation', detail: 'Language and reading detail follow your selections', ms: 700 },
  { label: 'Draft questions for clinician review', detail: 'Waiting for the assistant; this may take up to a minute' },
];

function takeHome(result: AgentResult): string {
  return [result.headline, ...result.blocks.map((block) =>
    [block.title, block.body, ...block.items.map((item) =>
      [item.label, item.detail, item.source ? `Source: ${item.source}` : null].filter(Boolean).join(' — '),
    )].filter(Boolean).join('\n'),
  )].join('\n\n');
}

function Metric({ metric, groupCount }: { metric: PatientsLikeMeMetric; groupCount: number }) {
  const known = metric.percent !== null && metric.events !== null && metric.n > 0;
  return (
    <div className={`plm-metric ${known ? '' : 'plm-withheld'}`}>
      <span className="plm-metric-label">{metric.label}</span>
      <strong>{known ? `${Math.round(metric.percent!)}%` : 'Withheld / not known'}</strong>
      {known && <div className="plm-proportion-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, metric.percent!))}%` }} /></div>}
      <span>{known ? `${metric.events} of ${metric.n} with known outcomes` : `${metric.n} known outcome records`}</span>
      {known && metric.low !== null && metric.high !== null && (
        <small>Illustrative 95% interval: {Math.round(metric.low)}–{Math.round(metric.high)}%</small>
      )}
      <small>{Math.max(0, groupCount - metric.n)} omitted: incomplete follow-up / unknown outcome</small>
      {metric.reason && <span className="plm-metric-reason">{metric.reason}</span>}
    </div>
  );
}

export default function PatientsLikeMe() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<PatientsLikeMeHorizon>('future');
  const [strict, setStrict] = useState(false);
  const [step, setStep] = useState('profile');
  const [cohort, setCohort] = useState<PatientsLikeMeCohort | null>(null);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [language, setLanguage] = useState<'English' | 'German'>('English');
  const [literacy, setLiteracy] = useState<'plain' | 'detailed'>('plain');
  const [busy, setBusy] = useState<'cohort' | 'explain' | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [review, setReview] = useState<'draft' | 'editing' | 'approved' | 'dismissed'>('draft');
  const editor = useRef<HTMLTextAreaElement>(null);
  const requestId = useRef(0);
  const requestRunning = useRef(false);
  const index = steps.findIndex((s) => s.id === step);
  const sixMonth = horizon === 'six-month';

  async function openStep(
    target: string,
    options: {
      horizon?: PatientsLikeMeHorizon;
      strict?: boolean;
      language?: 'English' | 'German';
      literacy?: 'plain' | 'detailed';
      refresh?: boolean;
    } = {},
  ) {
    if (requestRunning.current && !options.refresh) return;
    const id = ++requestId.current;
    const h = options.horizon ?? horizon;
    const tight = options.strict ?? strict;
    const lang = options.language ?? language;
    const detail = options.literacy ?? literacy;
    setStep(target);
    setError('');
    let data = options.refresh ? null : cohort;
    let explanation = options.refresh ? null : result;
    if (options.refresh) {
      setCohort(null);
      setResult(null);
      setDraft('');
      setReview('draft');
    }
    if (target === 'profile') {
      requestRunning.current = false;
      setBusy(null);
      return;
    }
    requestRunning.current = true;
    try {
      if (!data) {
        setBusy('cohort');
        data = await api.patientsLikeMe({ horizon: h, strict: tight });
        if (id !== requestId.current) return;
        setCohort(data);
      }
      if (target === 'questions' && !explanation) {
        setBusy('explain');
        explanation = await api.explainPatientsLikeMe({ horizon: h, strict: tight, language: lang, literacy: detail });
        if (id !== requestId.current) return;
        setResult(explanation);
        setDraft(takeHome(explanation));
        setReview('draft');
      }
    } catch (e) {
      if (id === requestId.current) setError(`Could not prepare this consultation. ${e instanceof Error ? e.message : 'Request failed.'} Your selections are preserved; retry below.`);
    } finally {
      if (id === requestId.current) {
        requestRunning.current = false;
        setBusy(null);
      }
    }
  }

  function changeHorizon(value: PatientsLikeMeHorizon) {
    setHorizon(value);
    void openStep(step, { horizon: value, refresh: true });
  }

  function changeStrict(value: boolean) {
    setStrict(value);
    void openStep(step, { strict: value, refresh: true });
  }

  function changeReading(lang: 'English' | 'German', detail: 'plain' | 'detailed') {
    setLanguage(lang);
    setLiteracy(detail);
    setResult(null);
    setDraft('');
    setReview('draft');
    if (step === 'questions') void openStep(step, { language: lang, literacy: detail, refresh: true });
  }

  const patient = cohort?.patient;
  return (
    <div className="plm92" data-theme={theme}>
      <a className="plm-skip" href="#plm-workspace" onClick={(event) => {
        event.preventDefault();
        const workspace = document.getElementById('plm-workspace');
        workspace?.focus({ preventScroll: true });
        workspace?.scrollIntoView({ block: 'start' });
      }}>Skip to consultation</a>
      <div className="plm-prototype">Hackathon prototype – synthetic data – not for clinical use</div>
      <HospitalShell
        module="Patients like me · consultation"
        patient={{
          id: 'P-046', name: patient?.name ?? 'Davide Rinaldi', age: 65, sex: 'male',
          diagnosis: 'Low rectal adenocarcinoma · stage III · MSS · KRAS mutated',
          allergies: 'Not reviewed in this demo', ward: 'Colorectal oncology · synthetic patient',
        }}
        nav={steps.map((s, i) => ({ id: s.id, label: s.title, badge: i + 1 }))}
        active={step}
        onNav={(id) => void openStep(id)}
        guide={
          <>
            <div className="plm-controls">
              <div><span className="plm-eyebrow">Consultation horizon</span><div className="plm-segment">
                <button className="hx-btn" aria-pressed={!sixMonth} disabled={!!busy} onClick={() => changeHorizon('future')}>{busy && !sixMonth && <span className="hx-spinner" />}The future</button>
                <button className="hx-btn" aria-pressed={sixMonth} disabled={!!busy} onClick={() => changeHorizon('six-month')}>{busy && sixMonth && <span className="hx-spinner" />}In six months</button>
              </div></div>
              <span className="plm-control-note">{sixMonth ? 'Minimal MDT dataset · approved aggregates' : 'Full-platform vision · simulated local cohort'}</span>
              <div className="plm-segment" aria-label="Workspace theme">
                <button className="hx-btn" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
                <button className="hx-btn" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
              </div>
            </div>
            <div className={busy ? 'plm-story-busy' : undefined} aria-busy={!!busy}>
              <StoryGuide steps={steps} current={step} onGo={(id) => void openStep(id)} nextLabel={busy ? 'Working…' : nextLabels[index]} />
            </div>
          </>
        }
        toolbar={
          <>
            <label className="plm-check"><input type="checkbox" checked={strict} disabled={!!busy} onChange={(e) => changeStrict(e.target.checked)} />Strict match · smaller cohort{busy === 'cohort' && <span className="hx-spinner" />}</label>
            <span className="plm-control-note">{strict ? 'Age 60–69' : 'Age 60–79'} · stage III · rectum · MSS · {sixMonth ? 'fitness unavailable' : strict ? 'ECOG 1' : 'ECOG within 1'}</span>
            <span className="hx-spacer" />
            <label htmlFor="plm-language">Explanation language
              <select id="plm-language" value={language} disabled={!!busy} onChange={(e) => changeReading(e.target.value as 'English' | 'German', literacy)}>
                <option>English</option><option>German</option>
              </select>
            </label>
            <label htmlFor="plm-literacy">Reading detail
              <select id="plm-literacy" value={literacy} disabled={!!busy} onChange={(e) => changeReading(language, e.target.value as 'plain' | 'detailed')}>
                <option value="plain">Plain language</option><option value="detailed">More detail</option>
              </select>
            </label>
          </>
        }
      >
        <div id="plm-workspace" tabIndex={-1}>
          <div className="plm-title-row">
            <div><span className="plm-eyebrow">Colorectal oncology / shared understanding</span><h1>Patients like me</h1><p>What happened to similar patients — and what should Davide ask next?</p></div>
            <Pill tone="info">Synthetic consultation · P-046</Pill>
          </div>
          <div className="plm-attention">
            <strong>Context, not an individual prognosis.</strong> Observational groups are not randomised comparisons. The clinician and patient remain in control.
          </div>
          {error && <div className="plm-error" role="alert">{error}<button className="hx-btn" disabled={!!busy} onClick={() => void openStep(step)}>Retry consultation step</button></div>}
          {busy && <Backstage key={busy} running holdLast stages={busy === 'cohort' ? cohortStages : explanationStages} title={busy === 'cohort' ? 'Preparing the simulated cohort' : 'Preparing the explanation'} note={busy === 'explain' ? 'Assistant answers can take up to a minute. The final stage stays active until the response arrives. No live hospital queries or chart write-back.' : 'No live hospital queries. No chart write-back. The final stage stays active until the response arrives.'} />}

          {step === 'profile' && <div className="plm-two-column">
            <Panel title="Davide’s recorded profile" actions={<Pill>Preselected patient</Pill>}>
              <div className="plm-profile-heading"><div className="plm-avatar" aria-hidden>DR</div><div><h2>Davide Rinaldi</h2><p>65 years · male · P-046 · synthetic record</p></div></div>
              <dl className="plm-facts">
                <dt>Primary diagnosis</dt><dd>Low rectal adenocarcinoma</dd>
                <dt>Stage</dt><dd>III · locally advanced</dd>
                <dt>Molecular profile</dt><dd>MSS · KRAS mutated</dd>
                <dt>Recorded fitness</dt><dd>ECOG 1 · ambulatory, limited strenuous activity</dd>
                <dt>Consultation aim</dt><dd>Understand options, uncertainty and questions to discuss</dd>
              </dl>
              <div className="plm-actions"><button className="hx-btn primary" disabled={!!busy} onClick={() => void openStep('matching')}>{busy && <span className="hx-spinner" />}Find similar patients →</button></div>
            </Panel>
            <Panel title="The consultation plan">
              <ol className="plm-plan">
                <li><strong>Explain the match.</strong><span>Same disease context; not an exact copy of Davide.</span></li>
                <li><strong>Inspect treatments and observed outcomes.</strong><span>See known denominators, withheld values and follow-up gaps.</span></li>
                <li><strong>Name what the numbers cannot answer.</strong><span>Fitness and treatment selection can distort comparisons.</span></li>
                <li><strong>Leave with better questions.</strong><span>Edit a patient-facing explanation before approving a local take-home draft.</span></li>
              </ol>
              <div className="plm-note">{sixMonth ? 'In six months: simple approved aggregate questions from the minimal MDT dataset; clinic-note fitness is not used to match.' : 'The future: a richer matched consultation. All multi-hospital counts here still come from a simulated local file, not live queries.'}</div>
            </Panel>
          </div>}

          {cohort && step !== 'profile' && <div className="plm-cohort-strip">
            <div><span className="plm-eyebrow">Matched synthetic records</span><strong>{cohort.count}</strong><span>of {cohort.screened} screened</span></div>
            <div><span className="plm-eyebrow">Match setting</span><strong className="plm-strip-text">{strict ? 'Strict' : 'Broad'}</strong><span>{sixMonth ? 'No fitness match' : 'Fitness considered'}</span></div>
            <div className="plm-source"><span className="plm-eyebrow">Inspectable provenance</span><span>{cohort.source}</span><small>Fictional historical records, distinct from Davide’s current chart · not live multi-hospital queries</small></div>
          </div>}

          {step === 'matching' && cohort && <div className="plm-two-column">
            <Panel title="Why these patients were included"><ul className="plm-reasons">{cohort.matches.map((text, i) => <li key={i}><span className="plm-reason-mark">✓</span>{text}</li>)}</ul>
              <div className="plm-note">Broad: age 60–79. Strict: age 60–69. Both: stage III rectal cancer and MSS. {sixMonth ? 'Fitness is not matched because patient / clinic notes are missing.' : 'Broad fitness: ECOG within 1 of Davide. Strict fitness: ECOG 1.'}</div>
            </Panel>
            <Panel title="Similar does not mean identical"><ul className="plm-reasons">{cohort.differences.map((text, i) => <li key={i}><span className="plm-reason-mark">≠</span>{text}</li>)}</ul>
              <p>KRAS mutation and low rectal location are part of Davide’s context, not a guarantee that every included record shares them.</p>
              <button className="hx-btn" disabled={!!busy} onClick={() => changeStrict(!strict)}>{busy && <span className="hx-spinner" />}{strict ? 'Broaden the match' : 'Try a strict match'}</button>
            </Panel>
          </div>}

          {step === 'outcomes' && cohort && <>
            <div className="plm-note"><strong>How to read these numbers:</strong> observed proportions among records with known outcomes. Time zero is the start of treatment. Recurrence means within five years; major side effects mean severe grade 3 or higher. These are not Kaplan–Meier survival estimates. Incomplete follow-up is omitted, not assumed to be an event-free result. Fewer than 10 known outcomes per treatment and measure means percentages are withheld. Wilson 95% intervals are illustrative; no individual prognosis or treatment ranking.</div>
            <div className="plm-attention"><strong>Fitness can confound the comparison.</strong> {cohort.warnings[0] ?? 'Groups offered more intensive options may be fitter; other groups may include sicker patients.'} Better observed outcomes do not prove the treatment caused them.</div>
            <details className="plm-inspection" open>
              <summary>Outcome definitions</summary>
              <dl className="plm-facts">
                <dt>Time zero</dt><dd>Start of treatment, not diagnosis or today’s consultation.</dd>
                <dt>Alive at 1 / 3 / 5 years</dt><dd>Recorded alive at the specified time after treatment started, among records with known outcomes.</dd>
                <dt>Recurrence</dt><dd>Recorded recurrence within five years after treatment started; unknown or incomplete follow-up is omitted.</dd>
                <dt>Major side effects</dt><dd>Recorded severe side effects, grade 3 or higher; missing toxicity records are not assumed to mean no toxicity.</dd>
                <dt>Illustrative evidence</dt><dd>All counts, proportions and Wilson 95% intervals describe fictional records only, not validated clinical evidence or Davide’s prognosis.</dd>
              </dl>
            </details>
            <div className="plm-outcomes">{cohort.groups.map((group) => <Panel key={group.treatment} title={group.treatment} actions={<Pill>{group.count} records</Pill>}>
              <p className="plm-group-fitness">{group.fit_count === null ? 'Fitness distribution not known in this horizon' : `${group.fit_count} recorded fit patients (ECOG 0–1) · inspect selection bias`}</p>
              <div className="plm-metrics">{group.metrics.map((metric) => <Metric key={metric.label} metric={metric} groupCount={group.count} />)}</div>
            </Panel>)}</div>
            <div className="plm-attention"><strong>Fitness can confound the comparison.</strong> Groups offered more intensive options may be fitter; other groups may include sicker patients. Better observed outcomes do not prove the treatment caused them.</div>
          </>}

          {step === 'limitations' && cohort && <div className="plm-two-column">
            <Panel title="What must stay in the conversation" actions={<Pill tone="warn">Review required</Pill>}>
              <ul className="plm-reasons">{cohort.warnings.map((text, i) => <li key={i}><span className="plm-reason-mark">!</span>{text}</li>)}</ul>
              <div className="plm-attention"><strong>Fitter option groups versus sicker groups.</strong> Treatment selection, comorbidities and unmeasured factors confound observed differences. This display cannot identify which option is best for Davide.</div>
              <p>Known outcomes <strong>n</strong> differ by measure and time point. Small groups can produce unstable proportions; longer-term results may be withheld. Missing toxicity or recurrence is not “no side effect” or “no recurrence”.</p>
            </Panel>
            <Panel title="What is not connected">
              <button className="hx-btn plm-unavailable" disabled>Pool live hospital records</button>
              <p><strong>Needs live querying.</strong> {sixMonth ? 'Not in the six-month minimal dataset.' : 'Part of the future vision, not connected in this prototype.'} This consultation uses a local synthetic file only.</p>
              <button className="hx-btn plm-unavailable" disabled>Write approved explanation to the chart</button>
              <p>No write-back integration in this prototype. {sixMonth && 'Hospital-system write-back is outside the six-month dataset.'} Approval only changes local screen state.</p>
              <div className="plm-note">Patient questions support a clinician-led conversation. They do not replace assessment, guideline review or informed consent.</div>
            </Panel>
          </div>}

          {step === 'questions' && <div className="plm-two-column plm-draft-grid">
            <Panel title="Assistant’s explanation" actions={result ? <Pill tone={result.mode === 'fallback' ? 'warn' : 'info'}>{result.mode === 'fallback' ? 'Deterministic demo fallback' : 'Copilot SDK'}</Pill> : undefined}>
              {result ? <>
                <h2>{result.headline}</h2>
                <p className="plm-note">{result.note ?? (result.mode === 'fallback' ? 'Copilot is unavailable; this is a deterministic synthetic demonstration.' : 'Prepared through the Copilot SDK. Clinician review required.')}</p>
                <div className="plm-blocks">{result.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}</div>
                <details><summary>Inspect public tool activity</summary><ul>{result.trace.map((item, i) => <li key={i}>{item.tool}{item.arguments && <pre>{item.arguments}</pre>}</li>)}</ul></details>
              </> : <p>{busy ? 'Preparing a reviewable explanation and patient questions…' : 'Use the retry action to prepare the explanation.'}</p>}
            </Panel>
            <Panel title="Patient’s take-home draft" actions={<Pill tone={review === 'approved' ? 'ok' : 'warn'}>{review === 'approved' ? 'Approved locally' : review === 'dismissed' ? 'Dismissed' : 'Human review required'}</Pill>}>
              <p>Built from the explanation blocks. Edit the wording and questions with Davide before approving. Selected output: {language} · {literacy === 'plain' ? 'plain language' : 'more detail'}.</p>
              <label htmlFor="plm-draft">Editable explanation and questions</label>
              <textarea id="plm-draft" ref={editor} value={draft} disabled={!result || review === 'dismissed'} onChange={(e) => { setDraft(e.target.value); setReview('editing'); }} rows={17} />
              <div className="plm-actions">
                <button className="hx-btn" disabled={!result} onClick={() => { setReview('editing'); window.setTimeout(() => editor.current?.focus(), 0); }}>Edit draft</button>
                <button className="hx-btn plm-dismiss" disabled={!result || review === 'dismissed'} onClick={() => setReview('dismissed')}>Dismiss draft</button>
                <button className="hx-btn primary" disabled={!result || !draft.trim() || review === 'dismissed' || review === 'approved'} onClick={() => setReview('approved')}>Approve take-home draft</button>
              </div>
              {review === 'approved' && <div className="plm-payoff" role="status"><strong>Ready for Davide’s next conversation.</strong><p>{sixMonth ? 'A reviewed explanation from approved synthetic aggregates, with missing fitness and outcomes kept visible.' : 'A reviewed explanation of similar patients, with uncertainty and editable questions.'}</p><span>Approved in this demo only. Not saved, sent or filed to the chart.</span></div>}
              {review === 'dismissed' && <div className="plm-note" role="status">Draft dismissed. Nothing was sent or filed. Use Edit draft to return to review.</div>}
              <small className="plm-local-notice">Local draft only · refreshing the page clears approval · no chart write-back</small>
            </Panel>
          </div>}

          {cohort && step !== 'profile' && <>
            <details className="plm-inspection">
              <summary>Inspect the synthetic cohort records ({cohort.records.length})</summary>
              <div className="plm-table-wrap"><table className="hx-table"><caption>Synthetic source records · no real patients · {sixMonth ? 'local inspection, not a live patient-level hospital query' : 'simulated multi-hospital records'}</caption>
                <thead><tr><th>Record / site</th><th>Age / stage / MSS</th><th>Fitness</th><th>Treatment</th><th>Follow-up</th><th>Death</th><th>Recurrence</th><th>Major side effects</th></tr></thead>
                <tbody>{cohort.records.map((record) => <tr key={record.id}>
                  <td>{record.id}<small>{record.site}</small></td><td>{record.age} · {record.stage} · {record.msi}</td><td>{sixMonth || record.ecog === null ? 'Not available' : `ECOG ${record.ecog}`}</td><td>{record.treatment}</td><td>{record.follow_up_months} months</td><td>{record.death_month === null ? 'Not recorded' : `Month ${record.death_month}`}</td><td>{record.recurrence === null ? 'Not known' : record.recurrence ? 'Recorded' : 'No recorded event'}</td><td>{record.major_side_effect === null ? 'Not known' : record.major_side_effect ? 'Recorded' : 'No recorded event'}</td>
                </tr>)}</tbody>
              </table></div>
            </details>
            <details className="plm-inspection" open={sixMonth}>
              <summary>What this needs from the minimal dataset</summary>
              <p>Coverage derived from the minimal MDT dataset. {cohort.coverage.filter((entry) => entry.status !== 'missing').length} of {cohort.coverage.length} elements are in the dataset. Across all displayed elements: {cohort.coverage.filter((entry) => entry.status === 'available').length} available from structured / derived fields, {cohort.coverage.filter((entry) => entry.status === 'partial').length} only partially available, and {cohort.coverage.filter((entry) => entry.status === 'missing').length} missing. Inclusion is not the same as reliable availability. Source categories and availability are hackathon assumptions, not measured hospital readiness.</p>
              <div className="plm-table-wrap"><table className="hx-table"><caption>Dataset coverage and likely source</caption><thead><tr><th>Group</th><th>Element</th><th>Likely source</th><th>Status</th></tr></thead><tbody>{cohort.coverage.map((entry, i) => <tr key={i}><td>{entry.group}</td><td>{entry.name}</td><td>{entry.likely_source}</td><td><Pill tone={entry.status === 'available' ? 'ok' : entry.status === 'partial' ? 'warn' : 'neutral'}>{entry.status === 'available' ? '✓ Available' : entry.status === 'partial' ? '◐ Partial' : '× Missing'}</Pill></td></tr>)}</tbody></table></div>
              <h3>What each hospital must do</h3>
              <ul>
                <li>Map age, diagnosis, stage, molecular status, treatment dates and follow-up to agreed fields; agree aggregate definitions and minimum group sizes.</li>
                {cohort.coverage.some((entry) => entry.likely_source === 'report text') && <li>Start structuring pathology and molecular report text; mark unavailable values rather than guessing.</li>}
                {cohort.coverage.some((entry) => entry.likely_source === 'MDT form') && <li>Record tumour-board decisions in a fixed MDT form and check completeness.</li>}
                <li>Record fitness and toxicity consistently in clinic notes before richer matching is possible. Validate follow-up completeness for each outcome and time point.</li>
                <li>Keep records on site. In six months, share approved counts and aggregates only; live consultation queries and chart write-back remain unavailable.</li>
              </ul>
              <button className="hx-btn plm-unavailable" disabled>Pool live hospital records</button><span className="plm-control-note">Needs live querying — not connected; not in six months.</span>
            </details>
          </>}
        </div>
      </HospitalShell>
    </div>
  );
}
