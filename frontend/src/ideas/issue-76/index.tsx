import { useEffect, useRef, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './mdt.css';

export const meta: IdeaMeta = {
  id: '76',
  issue: 76,
  title: 'Guideline recommendations during preparation of the MDT',
  tagline: 'Review the patient facts, compare colon cancer options and bring the open questions to the board.',
};

type Horizon = 'future' | 'six-month';
type Fact = { key: string; label: string; value: string; source: string; status: 'recorded' | 'pending' | 'missing' | 'unavailable' };
type Patient = {
  id: string; name: string; age: number; sex: string; diagnosis: string;
  phase: string; scenario: string;
  records: { id: string; type: string; title: string; date: string; text: string }[];
};
type Source = { id: string; title: string; url: string; status: string; limitations: string; summary: string };
type CoverageElement = { key: string; label: string; group: string | null; likely_source: string | null; availability: string; reason: string };
type Coverage = { elements: CoverageElement[]; included: number; total: number; hospital_actions: string[] };
type Workspace = { patients: Patient[]; sources: Source[]; coverage: Coverage };
type Extraction = { facts: Fact[]; agent?: AgentResult };
type Recommendation = {
  id: string; title: string; options: string[]; rationale: string;
  used_facts: string[]; missing: string[]; source_ids: string[];
};
type Assessment = {
  facts: Fact[];
  recommendations: Recommendation[];
  missing: { field: string; status: string; source: string; action: string }[];
  conflicts: string[];
  agent: AgentResult;
};

const steps: StoryStep[] = [
  { id: 'record', title: 'Open the record', explain: 'A preparing physician asks for a guideline check for one synthetic colon cancer patient.' },
  { id: 'review', title: 'Review patient facts', explain: 'Inspect the record sources and correct uncertain facts before they are used.' },
  { id: 'options', title: 'Compare options', explain: 'See conditional options, pending diagnostics and conflicts with the person’s wishes.' },
  { id: 'draft', title: 'Bring to the MDT', explain: 'Approve a preparation draft, not a treatment decision. The board keeps the final judgment.' },
];
const stages = [
  { label: 'Read the reviewed patient facts', detail: 'Only the facts shown to the physician are used.' },
  { label: 'Match primary colon cancer pathways', detail: 'Illustrative Dutch, Italian and NCCN reference summaries.' },
  { label: 'Look for unresolved results and personal conflicts', detail: 'Unknown data remains unknown; no diagnostic result is invented.' },
];

export default function ColonMdt() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [patientId, setPatientId] = useState('');
  const [view, setView] = useState('preparation');
  const [step, setStep] = useState('record');
  const [format, setFormat] = useState('narrative');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [extraction, setExtraction] = useState<AgentResult | undefined>();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<'loading' | 'extract' | 'recommend' | null>('loading');
  const [error, setError] = useState('');
  const generation = useRef(0);
  const patient = workspace?.patients.find((p) => p.id === patientId);

  useEffect(() => {
    let alive = true;
    request<Workspace>('/api/ideas/76/workspace')
      .then((data) => {
        if (!alive) return;
        setWorkspace(data);
        setPatientId(data.patients[0]?.id ?? '');
      })
      .catch(() => { if (alive) setError('The synthetic worklist could not be loaded. Reload the page to try again.'); })
      .finally(() => { if (alive) setBusy(null); });
    return () => { alive = false; generation.current += 1; };
  }, []);

  function reset() {
    generation.current += 1;
    setFacts([]); setAssessment(null); setExtraction(undefined); setDismissed([]);
    setApproved(false); setNote(''); setError(''); setStep('record'); setBusy(null);
  }

  async function extract() {
    if (!patient || busy) return;
    const run = ++generation.current;
    setBusy('extract'); setError(''); setView('preparation');
    setAssessment(null); setApproved(false); setDismissed([]); setNote('');
    try {
      const data = await request<Extraction>('/api/ideas/76/extract', {
        method: 'POST', body: JSON.stringify({ patient_id: patientId, horizon }),
      });
      if (generation.current !== run) return;
      setFacts(data.facts); setExtraction(data.agent); setStep('review');
    } catch {
      if (generation.current === run) setError('Patient facts could not be prepared. Your record is unchanged; try again.');
    } finally {
      if (generation.current === run) setBusy(null);
    }
  }

  async function recommend() {
    if (!facts.length || busy) return;
    const run = ++generation.current;
    setBusy('recommend'); setError(''); setAssessment(null); setApproved(false); setDismissed([]);
    try {
      const data = await request<Assessment>('/api/ideas/76/recommend', {
        method: 'POST', body: JSON.stringify({ patient_id: patientId, horizon, facts, reviewed: true }),
      });
      if (generation.current !== run) return;
      setFacts(data.facts); setAssessment(data); setStep('options');
    } catch {
      if (generation.current === run) setError('The guideline check did not finish. Your reviewed facts are preserved; try again.');
    } finally {
      if (generation.current === run) setBusy(null);
    }
  }

  function go(id: string) {
    if (busy) return;
    setView('preparation');
    if (id === 'record') setStep(id);
    if (id === 'review') {
      if (!facts.length) void extract();
      else setStep(id);
    }
    if (id === 'options') {
      if (assessment) setStep(id);
      else if (facts.length) void recommend();
      else setError('First extract and review the patient facts.');
    }
    if (id === 'draft') {
      if (assessment) setStep(id);
      else setError('First review the facts and compare the conditional options.');
    }
  }

  function edit(index: number, patch: Partial<Fact>) {
    setFacts((current) => current.map((fact, i) => i === index ? { ...fact, ...patch, source: `${fact.source.replace(/ · Physician correction$/, '')} · Physician correction` } : fact));
    setAssessment(null); setApproved(false); setDismissed([]);
  }

  const sources = <Panel title="Guideline reference shelf">
    <p className="mdt-alert">Illustrative summaries only. Full guideline text has not been verified; editions and local applicability must be checked before clinical use.</p>
    {workspace?.sources.map((source) => <article className="mdt-source" key={source.id}>
      <strong>{source.title}</strong>
      <p>{source.status}</p><p>{source.limitations}</p>
      <details><summary>Illustrative reference focus</summary><p>{source.summary}</p></details>
      <a href={source.url} target="_blank" rel="noreferrer">Open original reference ↗</a>
    </article>)}
    <p className="mdt-muted">No claim that these are the latest recommendations. Agreement or differences between guideline bodies are not independently established by this demo.</p>
  </Panel>;

  const coverage = <Panel title="What this needs from the minimal dataset">
    <p>{workspace?.coverage.included} of {workspace?.coverage.total} required elements are in the minimal colorectal MDT dataset. Likely sources and readiness are hackathon assumptions, not hospital measurements.</p>
    <div className="mdt-table-scroll"><table className="hx-table">
      <caption>Fields used for this workflow and their expected availability</caption>
      <thead><tr><th>Element</th><th>Group</th><th>Likely source</th><th>Six-month coverage</th></tr></thead>
      <tbody>{workspace?.coverage.elements.map((item) => <tr key={item.key}>
        <td>{item.label}</td><td>{item.group ?? 'Not in dataset'}</td><td>{item.likely_source ?? 'Not defined'}</td><td>{item.availability === 'available' ? '✓ Mapped' : item.availability === 'partial' ? '◐ Needs structuring' : '✕ Unavailable'}<br /><small>{item.reason}</small></td>
      </tr>)}</tbody>
    </table></div>
    <h4>What each hospital must do</h4>
    <ul>
      {workspace?.coverage.hospital_actions.map((action) => <li key={action}>{action}</li>)}
    </ul>
    <p className="mdt-unavailable">Live hospital queries and clinical write-back are unavailable in six months. Approval here saves a local demo draft only, in either horizon.</p>
  </Panel>;

  const record = <Panel title="Patient record · synthetic fixture">
    <p>{patient?.scenario}</p>
    <Tabs tabs={[{ id: 'narrative', label: 'Clinical note / Word text' }, { id: 'csv', label: 'CSV' }, { id: 'fhir', label: 'FHIR' }]} active={format} onChange={setFormat} />
    {patient?.records.filter((r) => r.type.toLowerCase().includes(format)).map((r) => <article key={r.id}><h4>{r.title} · {r.date}</h4><small>{r.id} · {r.type}</small><pre className="mdt-record">{r.text}</pre></article>)}
    {!patient?.records.some((r) => r.type.toLowerCase().includes(format)) && <p>No {format.toUpperCase()} record in this synthetic patient’s chart. Select another format or patient.</p>}
    <p className="mdt-muted">Synthetic record previews, not a live hospital connection. Arbitrary file upload and Word document parsing are not implemented in this prototype.</p>
    {horizon === 'six-month' && <p className="mdt-alert">Only minimal dataset facts are used below. Full-record preferences and allergy checks cannot be assumed available.</p>}
  </Panel>;

  const review = <Panel title="Patient facts used to evaluate recommendations">
    <p>Review extracted facts and their provenance. Correct a value or mark it missing or pending; do not turn a pending result into a confirmed finding.</p>
    <div className="mdt-table-scroll"><table className="hx-table mdt-facts">
      <caption>Editable facts · only these reviewed values enter the check</caption>
      <thead><tr><th>Fact</th><th>Value</th><th>Status</th><th>Record source</th></tr></thead>
      <tbody>{facts.map((fact, i) => <tr key={fact.key}>
        <th scope="row">{fact.label}</th>
        <td><input aria-label={`${fact.label} value`} value={fact.value} disabled={!!busy || fact.status === 'unavailable'} onChange={(e) => edit(i, { value: e.target.value })} /></td>
        <td><select aria-label={`${fact.label} status`} value={fact.status} disabled={!!busy || fact.status === 'unavailable'} onChange={(e) => edit(i, { status: e.target.value as Fact['status'] })}>
          {['recorded', 'pending', 'missing', ...(fact.status === 'unavailable' ? ['unavailable'] : [])].map((status) => <option key={status}>{status}</option>)}
        </select></td>
        <td>{fact.source}</td>
      </tr>)}</tbody>
    </table></div>
    <button className="hx-btn primary" disabled={!!busy || !facts.length} onClick={() => void recommend()}>
      {busy === 'recommend' ? <><span className="hx-spinner" /> Checking options…</> : 'Confirm reviewed facts & check guidelines'}
    </button>
    {extraction && <details><summary>How these facts were prepared · {extraction.mode === 'fallback' ? 'deterministic demo' : 'Copilot SDK'}</summary>
      <p>{extraction.note ?? extraction.headline}</p>
      {extraction.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}
    </details>}
  </Panel>;

  const options = assessment && <>
    <div className="mdt-alert">
      <Pill tone="warn">Preparation advice · not a treatment order</Pill>
      <p>{assessment.agent.mode === 'fallback' ? 'Copilot is not configured or unavailable. Deterministic synthetic demo matching is shown.' : 'Copilot SDK prepared the supporting assessment.'} {assessment.agent.note}</p>
    </div>
    <Panel title="Missing data and pending diagnostics">
      {!assessment.missing.length ? <p>No unresolved branching facts in this fixture. Verify completeness with the physician.</p> :
        assessment.missing.map((item, i) => <article className="mdt-missing" key={i}>
          <Pill tone="warn">{item.status}</Pill> <strong>{item.field}</strong>
          <p>{item.source}</p><p><strong>Next:</strong> {item.action}</p>
        </article>)}
    </Panel>
    <Panel title="Allergies, wishes and values">
      {assessment.conflicts.map((conflict, i) => <p className="mdt-alert" key={i}>{conflict}</p>)}
      {!assessment.conflicts.length && <p>No conflict identified in the reviewed facts; this does not establish treatment safety.</p>}
      {horizon === 'six-month' && <p className="mdt-unavailable">Full-record conflict detection needs clinic-note and allergy data; ask the physician rather than assuming consent or no allergy.</p>}
    </Panel>
    {assessment.recommendations.map((rec) => <Panel key={rec.id} title={rec.title} actions={<Pill tone={dismissed.includes(rec.id) ? 'neutral' : 'warn'}>{dismissed.includes(rec.id) ? 'Dismissed from draft' : 'Conditional option'}</Pill>}>
      <p>{rec.rationale}</p>
      <ul>{rec.options.map((option, i) => <li key={i}>{option}</li>)}</ul>
      <details><summary>Why this fits · facts and reference sources</summary>
        <h4>Facts used</h4><ul>{rec.used_facts.map((key, i) => {
          const fact = facts.find((f) => f.key === key);
          return <li key={i}>{fact ? `${fact.label}: ${fact.value} (${fact.status}) · ${fact.source}` : key}</li>;
        })}</ul>
        <h4>Data needed to distinguish options</h4><ul>{rec.missing.length ? rec.missing.map((item, i) => <li key={i}>{item}</li>) : <li>No additional branch identified in this fixture.</li>}</ul>
        <h4>Reference summaries · not verified recommendations</h4>
        {rec.source_ids.map((id) => {
          const source = workspace?.sources.find((s) => s.id === id);
          return source ? <p key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> · {source.status}</p> : <p key={id}>Unresolved reference: {id}</p>;
        })}
      </details>
      <button className="hx-btn" onClick={() => {
        setDismissed((current) => current.includes(rec.id) ? current.filter((id) => id !== rec.id) : [...current, rec.id]);
        setApproved(false);
      }}>{dismissed.includes(rec.id) ? 'Restore option to draft' : 'Dismiss option from draft'}</button>
    </Panel>)}
    <Panel title="Assistant’s supporting assessment">
      <details><summary>Open public assessment summary</summary>
        {assessment.agent.blocks.filter((block) => block.type !== 'actions').map((block, i) => <RenderBlock key={i} block={block} />)}
      </details>
      <details><summary>Inspect tool activity</summary><ul>{assessment.agent.trace.map((item, i) => <li key={i}>{item.tool}</li>)}</ul></details>
    </Panel>
    <button className="hx-btn primary" onClick={() => go('draft')}>Prepare the MDT draft →</button>
  </>;

  return <div className="mdt76" data-theme={theme}>
    <a className="mdt-skip" href="#mdt76-workspace">Skip to preparation</a>
    <div className="mdt-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
    <div className="mdt-controls">
      <div><strong>Colon cancer · primary treatment</strong><span>MDT preparation workstation</span></div>
      <div className="mdt-toggle" aria-label="Time horizon">{(['six-month', 'future'] as const).map((value) => <button key={value} aria-pressed={horizon === value} disabled={!!busy} onClick={() => { reset(); setHorizon(value); }}>{value === 'future' ? 'The future' : 'In six months'}</button>)}</div>
      <div className="mdt-toggle" aria-label="Theme">{(['light', 'dark'] as const).map((value) => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'light' ? 'Light' : 'Dark'}</button>)}</div>
    </div>
    <HospitalShell module="MDT guideline preparation"
      nav={[{ id: 'preparation', label: 'Prepare for the MDT' }, { id: 'record', label: 'Complete record' }, { id: 'sources', label: 'Guideline references', badge: 3 }, { id: 'coverage', label: 'Six-month coverage' }]}
      active={view} onNav={setView}
      patient={patient ? { ...patient, allergies: horizon === 'six-month' ? 'Not in minimal dataset' : facts.find((f) => f.key === 'allergy')?.value ?? 'Not yet reviewed', ward: 'Colorectal MDT · synthetic' } : null}
      guide={<StoryGuide steps={steps} current={step} onGo={go} nextLabel={step === 'record' ? 'Extract patient facts' : step === 'review' ? 'Confirm facts & check guidelines' : 'Prepare MDT draft'} />}
      toolbar={<><label>Patient <select value={patientId} disabled={!!busy} onChange={(e) => { reset(); setPatientId(e.target.value); }}>{workspace?.patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}</select></label><Pill tone="info">{horizon === 'future' ? 'Full synthetic record' : 'Minimal dataset only'}</Pill><span className="mdt-muted">Triggered by physician · no automatic treatment orders</span></>}>
      <div id="mdt76-workspace" tabIndex={-1}>
        {error && <p className="mdt-alert" role="alert">{error}</p>}
        {busy === 'loading' && <Working label="Loading synthetic MDT worklist" />}
        {busy === 'extract' && <Working label="Preparing patient facts" hint="The Copilot SDK may take up to a minute" />}
        {busy === 'recommend' && <Backstage stages={stages} running holdLast note="Stage animation is illustrative; the last stage stays active until the assessment arrives." />}
        {view === 'sources' ? sources : view === 'coverage' ? coverage : view === 'record' ? record : <div className="mdt-layout">
          <div className="mdt-primary">
            <header className="mdt-heading"><span className="mdt-eyebrow">Preparing physician · decision support</span><h1>Which recommendations fit this patient?</h1><p>Review the facts first. Keep pending results and personal wishes visible when comparing primary colon cancer options.</p></header>
            {step === 'record' && <>
              <Panel title="Today’s colon cancer MDT worklist">
                <div className="mdt-worklist">{workspace?.patients.map((p) => <button key={p.id} disabled={!!busy} aria-pressed={patientId === p.id} onClick={() => { reset(); setPatientId(p.id); }}>
                  <strong>{p.name}</strong><span>{p.diagnosis}</span><small>{p.scenario}</small>
                </button>)}</div>
              </Panel>
              <button className="hx-btn primary" disabled={!patient || !!busy} onClick={() => void extract()}>{busy === 'extract' ? <><span className="hx-spinner" /> Preparing facts…</> : 'Extract patient facts →'}</button>
              {record}
            </>}
            {step === 'review' && review}
            {step === 'options' && options}
            {step === 'draft' && assessment && <Panel title="Draft for the colon cancer MDT">
              <Pill tone={approved ? 'ok' : 'warn'}>{approved ? 'Preparation draft approved locally' : 'Preparing physician review required'}</Pill>
              <h2>{patient?.name} · primary treatment discussion</h2>
              <ul>{assessment.recommendations.filter((r) => !dismissed.includes(r.id)).map((r) => <li key={r.id}><strong>{r.title}</strong><ul>{r.options.map((option, i) => <li key={i}>{option}</li>)}</ul></li>)}</ul>
              <h4>Still unresolved</h4><ul>{assessment.missing.map((item, i) => <li key={i}>{item.field} ({item.status}) · {item.action}</li>)}</ul>
              <ul>{assessment.conflicts.map((item, i) => <li key={i}>{item}</li>)}</ul>
              <details><summary>Reviewed facts and reference provenance</summary>
                <ul>{facts.map((fact) => <li key={fact.key}>{fact.label}: {fact.value} ({fact.status}) · {fact.source}</li>)}</ul>
                <ul>{workspace?.sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {source.status}</li>)}</ul>
              </details>
              {!!dismissed.length && <p>{dismissed.length} option(s) dismissed by the preparing physician; original assessment remains inspectable.</p>}
              <label className="mdt-note">Question or clarification for the board<textarea value={note} onChange={(e) => { setNote(e.target.value); setApproved(false); }} placeholder="For example: await MMR result; discuss the patient’s neuropathy concern." /></label>
              <p className="mdt-muted">Illustrative references only. The board decides treatment; approval does not resolve pending results or file anything into a hospital record.</p>
              <button className="hx-btn primary" disabled={approved} onClick={() => setApproved(true)}>{approved ? 'Approved · retained in this demo session' : 'Approve preparation draft'}</button>
              {approved && <p className="mdt-receipt" role="status">Ready for the MDT: reviewed facts, conditional options and open questions stay together. No treatment has been ordered. {note && `Board question: ${note}`}</p>}
              <button className="hx-btn" onClick={() => go('options')}>Return to options</button>
            </Panel>}
            {horizon === 'six-month' && coverage}
          </div>
          <aside className="mdt-rail">{sources}<Panel title="The physician remains in control"><ol><li>Trigger the check.</li><li>Review or correct the extracted facts.</li><li>Resolve doubt with the board, not an invented result.</li><li>Approve the preparation draft.</li></ol><p className="mdt-muted">This demonstration covers primary colon cancer only, not rectal pathways or later-line treatment.</p></Panel></aside>
        </div>}
      </div>
    </HospitalShell>
  </div>;
}
