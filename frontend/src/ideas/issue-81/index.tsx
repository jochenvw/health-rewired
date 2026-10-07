import { useEffect, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill, type BannerPatient } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import PatientDiscussion, { dimensions, initialPriorities, type Discussion } from './PatientDiscussion';
import './style.css';

export const meta: IdeaMeta = {
  id: '81',
  issue: 81,
  title: 'Guideline recommendations for the MDT',
  tagline: 'Review the facts, compare colon cancer recommendations and bring the open questions to the MDT.',
};

type Fact = { key: string; label: string; value: string; source: string; status: 'available' | 'pending' | 'missing' };
type Finding = { label: string; detail: string };
type Recommendation = { id: string; source: string; title: string; detail: string; used: string[]; reference: string; limitation: string };
type Case = {
  patient: BannerPatient;
  facts: Fact[];
  sources: { name: string; format: string; content: string }[];
  coverage: { label: string; likely_source: string; status: string }[];
};
type Preparation = {
  facts: Fact[];
  recommendations: Recommendation[];
  missing: Finding[];
  conflicts: Finding[];
  agent: AgentResult;
};
type Horizon = 'future' | 'six-months';
type Step = 'worklist' | 'review' | 'compare' | 'discussion' | 'summary' | 'filed';

const story: StoryStep[] = [
  { id: 'worklist', title: 'Open the patient', explain: 'Elena is awaiting her first colon cancer MDT. Ask the assistant to read her synthetic record.' },
  { id: 'review', title: 'Review the facts', explain: 'Check the extracted facts and their sources. Correct them before matching any recommendations.' },
  { id: 'compare', title: 'Compare guidelines', explain: 'Compare three illustrative pathways. Pending results and patient preferences stay visible.' },
  { id: 'discussion', title: 'Discuss patient priorities', explain: 'Explore the visual trade-offs together. Only the patient and clinician can decide what matters and which options are acceptable.' },
  { id: 'summary', title: 'Approve the summary', explain: 'Choose what to bring to the MDT. Uncertainty travels with the recommendations.' },
  { id: 'filed', title: 'Ready for the MDT', explain: 'Your approved preparation is saved in this demo only. The MDT still makes the treatment decision.' },
];
const stages = [
  { label: 'Read the patient record', detail: 'CSV lab export, FHIR-style staging and a Word-letter text export', ms: 400 },
  { label: 'Separate known facts from pending results', detail: 'No assumption of a negative CT or normal MMR result', ms: 500 },
  { label: 'Prepare a source-linked draft', detail: 'Illustrative guideline examples only; physician review required', ms: 500 },
];
const discussionStages = [
  { label: 'Read the confirmed patient context', detail: 'Reviewed facts only; missing results are never invented', ms: 400 },
  { label: 'Build the illustrative option grid', detail: 'Fictional visual-aid numbers, not a validated personal risk model', ms: 500 },
  { label: 'Explain the choices in plain language', detail: 'Sources, limitations and uncertainty remain inspectable', ms: 500 },
];
const options: Record<string, { value: string; label: string }[]> = {
  stage: [{ value: 'pending', label: 'CT staging pending' }, { value: 'localized', label: 'Localized / no distant metastases confirmed' }, { value: 'metastatic', label: 'Distant metastases confirmed' }],
  mmr: [{ value: 'pending', label: 'MMR/MSI pending' }, { value: 'pMMR', label: 'pMMR / MSS confirmed' }, { value: 'dMMR', label: 'dMMR / MSI-high confirmed' }],
  ecog: [{ value: '', label: 'Not recorded' }, ...['0', '1', '2', '3', '4'].map((value) => ({ value, label: `ECOG ${value}` }))],
};

export default function ColonPreparation() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [step, setStep] = useState<Step>('worklist');
  const [record, setRecord] = useState<Case | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [result, setResult] = useState<Preparation | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [discussion, setDiscussion] = useState<Discussion | null>(null);
  const [priorities, setPriorities] = useState(initialPriorities);
  const [preference, setPreference] = useState('');
  const [discussionNote, setDiscussionNote] = useState('');
  const [discussionConfirmed, setDiscussionConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    setError('');
    api.colonCase<Case>().then((data) => {
      if (active) setRecord(data);
    }).catch(() => {
      if (active) setError('The synthetic record could not be loaded. Check the API connection and try again.');
    });
    return () => { active = false; };
  }, [loadAttempt]);

  function reset(nextHorizon = horizon) {
    setHorizon(nextHorizon);
    setStep('worklist');
    setFacts([]);
    setResult(null);
    setSelected([]);
    setNote('');
    setError('');
    setRun(0);
    clearDiscussion();
  }

  function clearDiscussion() {
    setDiscussion(null);
    setPriorities(initialPriorities());
    setPreference('');
    setDiscussionNote('');
    setDiscussionConfirmed(false);
  }

  async function prepare(confirm: boolean) {
    if (busy || !record) return;
    const cea = facts.find((fact) => fact.key === 'cea');
    if (confirm && cea?.value && !/^\d+(?:\.\d+)? ng\/mL$/.test(cea.value)) {
      setError('Enter CEA as a number followed by ng/mL (for example 6.2 ng/mL), or clear it if not recorded.');
      return;
    }
    setBusy(true);
    setError('');
    setRun((n) => n + 1);
    try {
      const data = await api.prepareColon<Preparation>({ horizon, ...(confirm ? { facts } : {}) });
      setFacts(data.facts);
      setResult(data);
      if (confirm) {
        clearDiscussion();
        setSelected(data.recommendations.map((item) => item.id));
        setStep('compare');
      } else {
        setStep('review');
      }
    } catch {
      setError('The assistant could not be reached. Your changes are preserved; please try the action again.');
    } finally {
      setBusy(false);
    }
  }

  async function openDiscussion() {
    if (busy || !result || !selected.length || step === 'review') return;
    setError('');
    setStep('discussion');
    if (discussion) return;
    setBusy(true);
    setRun((n) => n + 1);
    try {
      setDiscussion(await api.discussColon<Discussion>({ horizon, facts }));
    } catch {
      setError('The discussion visual aid could not be loaded. Your reviewed facts are preserved; try again.');
    } finally {
      setBusy(false);
    }
  }

  function go(id: string) {
    if (busy) return;
    if (id === 'worklist') { reset(); return; }
    if (id === 'review') {
      if (!facts.length) void prepare(false);
      else { setStep('review'); setSelected([]); clearDiscussion(); }
      return;
    }
    if (id === 'compare') {
      if (step === 'review') void prepare(true);
      else if (result && ['compare', 'discussion', 'summary', 'filed'].includes(step)) setStep('compare');
      else setError('Prepare and confirm the patient facts first.');
      return;
    }
    if (id === 'discussion') {
      if (result && step !== 'review' && selected.length) void openDiscussion();
      else setError('Confirm the facts and select at least one guideline point before discussing patient priorities.');
      return;
    }
    if (id === 'summary' && result && step !== 'review' && selected.length && discussionConfirmed) setStep('summary');
    else if (id === 'filed' && step === 'summary' && selected.length && discussionConfirmed) setStep('filed');
    else setError('Review the facts, select guideline points and confirm the patient discussion before approving the summary.');
  }

  function editFact(key: string, value: string) {
    setFacts((current) => current.map((fact) => fact.key === key ? {
      ...fact, value, status: value === 'pending' ? 'pending' : value.trim() ? 'available' : 'missing',
      source: fact.source.includes('Physician correction') ? fact.source : `${fact.source} · Physician correction`,
    } : fact));
  }

  const chosen = result?.recommendations.filter((item) => selected.includes(item.id)) ?? [];
  const nextLabel = step === 'worklist' ? 'Prepare guideline recommendations' : step === 'review' ? 'Confirm facts & compare' :
    step === 'compare' ? 'Discuss patient priorities' : step === 'discussion' ? 'Review MDT summary' : 'Approve for MDT';
  const allergy = facts.find((fact) => fact.key === 'allergy');
  const patient = record ? {
    ...record.patient,
    allergies: allergy ? allergy.value || 'Not recorded' :
      horizon === 'six-months' ? 'Not available in this dataset' : record.patient.allergies,
  } : null;

  return (
    <div className="colon81" data-theme={theme}>
      <a className="c81-skip" href="#c81-task">Skip to current task</a>
      <div className="c81-controls">
        <strong>Hackathon prototype – synthetic data – not for clinical use</strong>
        <div role="group" aria-label="Data horizon">
          <button className="hx-btn" disabled={busy} aria-pressed={horizon === 'six-months'} onClick={() => reset('six-months')}>In six months</button>
          <button className="hx-btn" disabled={busy} aria-pressed={horizon === 'future'} onClick={() => reset('future')}>The future</button>
        </div>
        <div role="group" aria-label="Theme">
          <button className="hx-btn" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button className="hx-btn" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
      <HospitalShell
        module="Colon cancer · MDT preparation"
        patient={patient}
        guide={<StoryGuide steps={story} current={step} onGo={go} nextLabel={busy ? 'Working…' : nextLabel} />}
        nav={[
          { id: 'worklist', label: 'MDT preparation list', badge: 4 },
          { id: 'review', label: 'Extracted patient facts', badge: facts.length || undefined },
          { id: 'compare', label: 'Guideline comparison' },
          { id: 'discussion', label: 'Patient priorities & options' },
          { id: 'summary', label: 'MDT summary' },
        ]}
        active={step === 'filed' ? 'summary' : step}
        onNav={go}
        toolbar={<>
          <span className="c81-eyebrow">PRIMARY TREATMENT · COLON CANCER</span>
          <span className="hx-spacer" />
          {result && <Pill tone={result.agent.mode === 'copilot' ? 'ok' : 'info'}>{result.agent.mode === 'copilot' ? 'Copilot SDK' : 'Simulated demo'}</Pill>}
          <button className="hx-btn" disabled={busy} onClick={() => reset()}>Restart walkthrough</button>
        </>}
      >
        <div id="c81-task" tabIndex={-1}>
          {error && <div className="c81-attention" role="alert">{error} {!record && <button className="hx-btn" onClick={() => setLoadAttempt((n) => n + 1)}>Reload record</button>}</div>}
          {busy && <Backstage key={run} stages={step === 'discussion' ? discussionStages : stages} running holdLast release={false} note="Activity timings are simulated. Copilot SDK is used when configured; otherwise a deterministic demo is shown." />}
          {!record && !error && <Working label="Loading the synthetic patient record" />}
          {step === 'worklist' && record && <>
            <div className="c81-heading"><div><span className="c81-eyebrow">TOMORROW'S TUMOUR BOARD · 08:30</span><h1>Prepare the patient, not the whole guideline</h1><p>One record. Three sources. Clear questions for the MDT.</p></div><Pill tone="warn">CT + MMR pending</Pill></div>
            <Panel title="MDT preparation list · synthetic patients">
              <div className="c81-table-wrap"><table className="hx-table">
                <caption>Primary colon cancer · preparing physician worklist</caption>
                <thead><tr><th>Patient</th><th>Clinical question</th><th>Readiness</th><th>Action</th></tr></thead>
                <tbody>
                  <tr className="selected"><td><strong>Elena Fischer · 64</strong><br />C-081 · sigmoid colon</td><td>Initial treatment planning</td><td><Pill tone="warn">2 results pending</Pill></td><td><button className="hx-btn primary" disabled={busy} onClick={() => void prepare(false)}>{busy ? <><span className="hx-spinner" /> Reading record…</> : 'Prepare guideline recommendations'}</button></td></tr>
                  {[
                    ['Jonas Keller · 71', 'Postoperative pathology review', 'Pathology available'],
                    ['Marta Rossi · 58', 'Primary treatment planning', 'Awaiting imaging'],
                    ['Sofia de Vries · 67', 'Fitness for surgery', 'Assessment scheduled'],
                  ].map(([name, question, status]) => <tr key={name}><td>{name}</td><td>{question}</td><td>{status}</td><td><span className="c81-muted">Context only</span></td></tr>)}
                </tbody>
              </table></div>
            </Panel>
            <Panel title="The record the assistant will use">
              <p>New colon cancer diagnosis; no treatment started. Staging and molecular results are still pending. This walkthrough uses a fixed synthetic case, not a real upload.</p>
              <Sources sources={record.sources} horizon={horizon} />
            </Panel>
          </>}
          {step === 'review' && <>
            <div className="c81-heading"><div><span className="c81-eyebrow">HUMAN REVIEW REQUIRED</span><h1>Are these facts correct?</h1><p>The assistant has not yet matched a treatment pathway. Pending does not mean negative.</p></div></div>
            {horizon === 'six-months' && <div className="c81-attention">Free-text extraction of allergies and wishes is unavailable in this horizon. Add them manually if known; otherwise conflicts remain unassessed.</div>}
            <Panel title="Extracted patient facts · review or correct">
              <div className="c81-table-wrap"><table className="hx-table">
                <caption>Each fact retains its source; edits are marked as physician corrections.</caption>
                <thead><tr><th>Fact</th><th>Value used for matching</th><th>Status</th><th>Source</th></tr></thead>
                <tbody>{facts.map((fact) => <tr key={fact.key}>
                  <th scope="row"><label htmlFor={`c81-${fact.key}`}>{fact.label}</label></th>
                  <td>{options[fact.key] ? <select id={`c81-${fact.key}`} disabled={busy} value={fact.value} onChange={(e) => editFact(fact.key, e.target.value)}>{options[fact.key].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> :
                    <input id={`c81-${fact.key}`} disabled={busy} value={fact.value} maxLength={300} placeholder={fact.key === 'cea' ? '6.2 ng/mL' : 'Not recorded — enter only if known'} onChange={(e) => editFact(fact.key, e.target.value)} />}</td>
                  <td><Pill tone={fact.status === 'available' ? 'ok' : 'warn'}>{fact.status}</Pill></td>
                  <td className="c81-provenance">{fact.source}</td>
                </tr>)}</tbody>
              </table></div>
              <button className="hx-btn primary" disabled={busy} onClick={() => void prepare(true)}>{busy ? <><span className="hx-spinner" /> Comparing examples…</> : 'Confirm facts & compare guidelines'}</button>
            </Panel>
            {record && <Panel title="Inspect original synthetic records"><Sources sources={record.sources} horizon={horizon} /></Panel>}
          </>}
          {step === 'compare' && result && <>
            <div className="c81-heading"><div><span className="c81-eyebrow">DRAFT RECOMMENDATIONS · PHYSICIAN DECIDES</span><h1>Three sources, one patient</h1><p>Select the points you want to discuss at the MDT.</p></div><button className="hx-btn" disabled={busy} onClick={() => go('review')}>Correct facts</button></div>
            <div className="c81-attention"><strong>Illustrative examples, not verified guideline advice.</strong> Full Dutch, Italian and NCCN texts have not been retrieved or checked for currency. Agreement below is between demo examples; actual guideline differences are not established.</div>
            <div className="c81-comparison">{result.recommendations.map((item) => <Panel key={item.id} title={item.source}>
              <Pill tone="warn">Conditional example</Pill>
              <h2>{item.title}</h2><p>{item.detail}</p>
              <details><summary>Exactly which data was used</summary><ul>{item.used.map((value, i) => <li key={i}>{value}</li>)}</ul></details>
              <p className="c81-muted">{item.limitation}</p>
              <a href={item.reference} target="_blank" rel="noreferrer">Open source reference ↗</a>
              <label className="c81-check"><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /> Include in MDT discussion</label>
            </Panel>)}</div>
            <div className="c81-two"><Findings title="Missing data · options that stay open" items={result.missing} /><Findings title="Allergies, wishes & values · conflicts" items={result.conflicts} /></div>
            <Panel title="Agreement and differences">
              <p>The examples agree that staging must be established before choosing a definitive primary treatment plan, and that pending results must stay explicit.</p>
              <p><strong>Differences: not assessed.</strong> A clinician must verify the applicable guideline version, population and local policy before comparing recommendations.</p>
            </Panel>
            <details className="c81-agent"><summary>Assistant explanation · {result.agent.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
              {result.agent.note && <p>{result.agent.note}</p>}
              {result.agent.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}
            </details>
            <button className="hx-btn primary" disabled={busy || !selected.length} onClick={() => go('discussion')}>Discuss patient priorities · {selected.length} selected</button>
          </>}
          {step === 'discussion' && !discussion && !busy && <Panel title="Patient discussion visual aid"><p>Load the source-linked, synthetic option grid using the facts you confirmed.</p><button className="hx-btn primary" onClick={() => void openDiscussion()}>Load patient discussion</button></Panel>}
          {step === 'discussion' && discussion && <PatientDiscussion
            data={discussion}
            priorities={priorities}
            onPriorities={(value) => { setPriorities(value); setDiscussionConfirmed(false); }}
            preference={preference}
            onPreference={(value) => { setPreference(value); setDiscussionConfirmed(false); }}
            discussionNote={discussionNote}
            onNote={(value) => { setDiscussionNote(value); setDiscussionConfirmed(false); }}
            onConfirm={() => { setDiscussionConfirmed(true); setError(''); setStep('summary'); }}
            references={result?.recommendations ?? []}
          />}
          {(step === 'summary' || step === 'filed') && result && <>
            <div className="c81-heading"><div><span className="c81-eyebrow">{step === 'filed' ? 'APPROVED PREPARATION · DEMO ONLY' : 'FINAL HUMAN CHECK'}</span><h1>{step === 'filed' ? 'Ready for the MDT' : 'Your MDT preparation summary'}</h1><p>Elena Fischer · C-081 · primary colon cancer · {horizon === 'future' ? 'The future' : 'In six months'}</p></div>{step === 'filed' && <Pill tone="ok">Approved locally ✓</Pill>}</div>
            {step === 'filed' && <div className="c81-receipt" role="status">Saved in this walkthrough only, not written to a hospital record. No treatment has been ordered. Restarting or reloading clears the demo.</div>}
            <Panel title="Facts reviewed by the preparing physician">
              <dl className="c81-facts">{facts.map((fact) => <div key={fact.key}><dt>{fact.label}</dt><dd>{fact.value || 'Not recorded'} <span className="c81-muted">· {fact.status}</span></dd></div>)}</dl>
            </Panel>
            <Panel title="Selected points for MDT discussion">
              <p className="c81-muted">Unverified illustrative guideline examples — not a final treatment decision.</p>
              {chosen.map((item) => <div className="c81-summary-item" key={item.id}><strong>{item.source} · {item.title}</strong><p>{item.detail}</p><small>Data used: {item.used.join('; ')}</small><p><a href={item.reference} target="_blank" rel="noreferrer">Source reference ↗</a> · {item.limitation}</p></div>)}
              <label htmlFor="c81-note">Physician note for the MDT</label>
              <textarea id="c81-note" rows={3} disabled={step === 'filed'} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: what should the MDT decide?" />
            </Panel>
            {discussion && <Panel title="Patient priorities and provisional preference · discussion confirmed">
              <dl className="c81-facts">{dimensions.map((dimension) => <div key={dimension.key}><dt>{dimension.label}</dt><dd>{priorities[dimension.key]} / 10 importance</dd></div>)}</dl>
              <p><strong>Provisional preference: </strong>{discussion.options.find((option) => option.id === preference)?.title ?? 'No preference yet — keep the question open'}.</p>
              <p><strong>Patient discussion note: </strong>{discussionNote || 'No additional note recorded.'}</p>
              <p>{discussion.eligibility}</p>
              <details><summary>Discussion: reasoning and evidence limitations</summary><p>{discussion.limitation}</p><p>The sliders express values; they do not change risk estimates or establish consent. No treatment is selected by the system.</p>{discussion.evidence.map((item) => <p key={item.label}><strong>{item.label}: </strong>{item.detail}</p>)}</details>
            </Panel>}
            <div className="c81-two"><Findings title="Still unresolved · do not lose these questions" items={result.missing} /><Findings title="Conflicts requiring human judgment" items={result.conflicts} /></div>
            {step === 'summary' && <div className="c81-actions"><button className="hx-btn" onClick={() => setStep('compare')}>Edit selected points</button><button className="hx-btn" onClick={() => go('discussion')}>Revisit patient priorities</button><button className="hx-btn primary" disabled={!selected.length || !discussionConfirmed} onClick={() => go('filed')}>Approve for MDT · save demo summary</button></div>}
          </>}
          {horizon === 'six-months' && record && <Panel title="What this needs from the minimal dataset">
            <p>Coverage is based on the colorectal minimal dataset. Likely source is a hackathon assumption, not a measurement.</p>
            <p>{record.coverage.filter((item) => item.status !== 'outside').length} of {record.coverage.length} elements used here are in the minimal dataset; {record.coverage.filter((item) => item.status === 'partial').length} depend on report text or clinical documentation today.</p>
            <div className="c81-table-wrap"><table className="hx-table"><caption>Data readiness for this walkthrough</caption><thead><tr><th>Element</th><th>Likely source</th><th>Coverage</th></tr></thead><tbody>{record.coverage.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.likely_source}</td><td><Pill tone={item.status === 'available' ? 'ok' : 'warn'}>{item.status}</Pill></td></tr>)}</tbody></table></div>
            <p className="c81-unavailable">Full letter extraction, comprehensive guideline coverage and hospital write-back are not available in six months.</p>
            <strong>What each hospital must do</strong><ul><li>Map diagnosis, stage, performance status and laboratory fields once to the agreed format.</li><li>Structure CT and pathology reports, recording pending results rather than inventing values.</li><li>Use a fixed MDT form and ask the physician to record allergies, wishes and values where available.</li><li>Agree which licensed guideline versions and local treatment policies may be used.</li></ul>
          </Panel>}
        </div>
      </HospitalShell>
    </div>
  );
}

function Sources({ sources, horizon }: { sources: Case['sources']; horizon: Horizon }) {
  return <div className="c81-sources">{sources.map((source) => horizon === 'six-months' && source.name === 'referral-letter.txt' ?
    <p className="c81-unavailable" key={source.name}>Word-letter extraction — unavailable with only the minimal dataset. Record allergies, wishes and performance status manually if known.</p> :
    <details key={source.name}><summary>{source.name} <span className="c81-muted">· {source.format}</span></summary><pre>{source.content}</pre></details>)}</div>;
}

function Findings({ title, items }: { title: string; items: Finding[] }) {
  return <Panel title={title}>{items.length ? items.map((item, i) => <div className="c81-finding" key={i}><strong>{item.label}</strong><p>{item.detail}</p></div>) : <p>No conflict detected from the reviewed facts. This is not a comprehensive safety check.</p>}</Panel>;
}
