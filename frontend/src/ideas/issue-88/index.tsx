import { useEffect, useRef, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, Working, type Stage } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './workspace.css';

export const meta: IdeaMeta = {
  id: '88',
  issue: 88,
  title: 'One front door for oncology data requests',
  tagline: 'Check feasibility, find reusable work and let the data steward decide the next step.',
};

type Horizon = 'future' | 'six-months';
type Variable = {
  id: string; label: string; minimal_name: string | null; group: string;
  likely_source: string; availability: 'available' | 'conditional' | 'future'; aliases: string[];
};
type QueueRequest = {
  id: string; requester: string; purpose: string; request: string; permit: string;
  pipeline: string; investment: string; status: string;
};
type Dataset = {
  '@type': string; identifier: string; title: string; description: string; modified: string;
  theme: string | string[]; accessRights: string; patient_count: number; variables: string[];
  distribution: { title: string; format: string; accessURL: string }[];
};
type Catalogue = {
  synthetic: boolean;
  catalogue: {
    '@context': unknown; '@type': string; title: string; publisher: unknown; modified: string;
    dataset: Dataset[];
  };
  variables: Variable[]; requests: QueueRequest[];
  extractions: { id: string; title: string; pipeline: string; variables: string[]; cancer: string; stage: string }[];
};
type Assessment = {
  mapped: (Variable & { status: 'available' | 'conditional' | 'missing' })[];
  missing_variables: string[]; patient_count: number | null; count_note: string; flags: string[];
  reuse: { id: string; title: string; pipeline: string; overlap: number } | null;
  investment: string; permit_status: string; horizon: string;
};
type Result = { assessment: Assessment; agent: AgentResult };

const example = 'Stage III colorectal cancer, age, adjuvant regimen and overall survival.';
const steps = [
  ['Catalogue', 'See what oncology data exists before asking for access.', 'Open prefilled request'],
  ['Requester intake', 'A researcher wants to compare adjuvant outcomes in stage III colorectal cancer.', 'Assess feasibility'],
  ['Assistant feasibility', 'Map the question to variables and inspect sources, gaps and a simulated count.', 'Review permit & reuse'],
  ['Permit & reuse', 'A missing permit blocks approval; previous extraction work may reduce investment.', 'Open CIO overview'],
  ['CIO overview', 'Compare every request, its pipeline and the investment needed.', 'Review human decision'],
  ['Human decision', 'Approve review, edit or send back. No action here grants access or delivers data.', ''],
];
const stages: Stage[] = [
  { label: 'Map the request to the oncology catalogue', detail: 'Cancer, stage, age, regimen and survival; no patient-level records queried.' },
  { label: 'Check source coverage and permit reference', detail: 'Sources are assumptions, not measured hospital readiness.' },
  { label: 'Compare reusable extractions and draft the review', detail: 'Copilot SDK output, or a clearly labelled deterministic demo fallback.' },
];

function Badge({ text }: { text: string }) {
  const tone = /missing|blocked|not available/i.test(text) ? 'missing'
    : /conditional|review|pending|not verified/i.test(text) ? 'conditional' : 'neutral';
  return <span className={`op88-badge ${tone}`}>{text}</span>;
}

export default function OncologyRequests() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [step, setStep] = useState(0);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [catalogueLoading, setCatalogueLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState('');
  const [reload, setReload] = useState(0);
  const [request, setRequest] = useState(example);
  const [purpose, setPurpose] = useState('Compare adjuvant treatment outcomes');
  const [permit, setPermit] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legalReviewed, setLegalReviewed] = useState(false);
  const [decision, setDecision] = useState('');
  const revision = useRef(0);
  const assessment = result?.assessment;

  useEffect(() => {
    let active = true;
    setCatalogueLoading(true);
    setCatalogueError('');
    api.issue88Catalogue<Catalogue>().then((data) => {
      if (active) setCatalogue(data);
    }).catch((err: unknown) => {
      if (active) setCatalogueError(`Catalogue unavailable: ${err instanceof Error ? err.message : 'connection interrupted'}. Retry to load the synthetic records.`);
    }).finally(() => { if (active) setCatalogueLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => () => { revision.current += 1; }, []);

  function invalidate() {
    revision.current += 1;
    setResult(null);
    setBusy(false);
    setError('');
    setDecision('');
    setLegalReviewed(false);
  }

  function changeHorizon(value: Horizon) {
    if (value === horizon) return;
    invalidate();
    setHorizon(value);
    setStep(0);
  }

  async function assess() {
    if (request.trim().length < 3 || !purpose.trim() || busy) return;
    const current = ++revision.current;
    setBusy(true);
    setResult(null);
    setError('');
    setDecision('');
    setLegalReviewed(false);
    setStep(2);
    try {
      const response = await api.issue88Assess<Result>({ request, purpose, permit, horizon });
      if (current === revision.current) setResult(response);
    } catch (err: unknown) {
      if (current === revision.current) setError(`Assessment could not finish: ${err instanceof Error ? err.message : 'connection interrupted'}. Your request is preserved; retry below.`);
    } finally {
      if (current === revision.current) setBusy(false);
    }
  }

  function go(next: number) {
    if (next >= 2 && !result) {
      if (!busy) void assess();
      return;
    }
    setStep(next);
  }

  function decide(value: string) {
    if (!assessment) return;
    if (value === 'Approved for review' && (!permit.trim() || !purpose.trim() || !legalReviewed)) return;
    setDecision(value);
  }

  const currentRequest: QueueRequest = {
    id: 'REQ-045', requester: 'Pharmaceutical consortium (synthetic)',
    purpose, request, permit: permit || 'Missing permit reference',
    pipeline: assessment?.reuse?.pipeline ?? 'Feasibility review — no extraction',
    investment: assessment?.investment ?? 'Awaiting assessment',
    status: decision || (assessment ? 'Human review required' : 'Draft intake'),
  };
  const queue = [currentRequest, ...(catalogue?.requests ?? [])];
  const canApprove = !!assessment && !!permit.trim() && !!purpose.trim() && legalReviewed && !decision;

  return (
    <div className="op88" data-theme={theme}>
      <a className="op88-skip" href="#op88-main">Skip to workspace</a>
      <div className="op88-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
      <header className="op88-header">
        <div><span className="op88-eyebrow">Health Rewired · Munich 2026</span><strong>Oncology data office</strong><small>CIO / data steward workstation · Synthetic environment</small></div>
        <div className="op88-global">
          <div role="group" aria-label="Planning horizon">
            <button aria-pressed={horizon === 'six-months'} onClick={() => changeHorizon('six-months')}>In six months</button>
            <button aria-pressed={horizon === 'future'} onClick={() => changeHorizon('future')}>The future</button>
          </div>
          <div role="group" aria-label="Theme">
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
          </div>
          <a href="#/">All ideas ↗</a>
        </div>
      </header>
      <div className="op88-context">
        <div><span className="op88-eyebrow">Single requests front door</span><h1>From question to a reviewable data request</h1></div>
        <div><strong>REQ-045 · Stage III colorectal cancer</strong><br /><span>{horizon === 'future' ? 'Future federated platform · simulated feasibility' : 'Six-month plan · minimal colorectal MDT dataset'}</span></div>
      </div>
      <main id="op88-main" className="op88-main">
        <section className="op88-guide" aria-label="Six-step guided walkthrough">
          <ol>{steps.map(([title], index) => <li key={title}>
            <button aria-current={step === index ? 'step' : undefined} disabled={busy && index > 1} onClick={() => go(index)}>
              <span>{index + 1}</span>{title}
            </button>
          </li>)}</ol>
          <div className="op88-guide-action">
            <p><span className="op88-eyebrow">Step {step + 1} / 6</span>{steps[step][1]}</p>
            <div className="op88-actions">
              {step > 0 && <button onClick={() => setStep(step - 1)}>← Back</button>}
              {step < 5 && <button className="primary" disabled={busy || (step === 1 && (request.trim().length < 3 || !purpose.trim())) || (step >= 2 && !result)} onClick={() => go(step + 1)}>
                {busy ? <><span className="hx-spinner" /> Assessing…</> : `${steps[step][2]} →`}
              </button>}
            </div>
          </div>
        </section>
        {catalogueError && <div className="op88-attention" role="alert">{catalogueError} <button onClick={() => setReload((value) => value + 1)}>Retry catalogue</button></div>}
        {catalogueLoading && <div className="op88-panel"><Working label="Loading synthetic catalogue and requests" /></div>}

        {step === 0 && catalogue && <section className="op88-panel">
          <div className="op88-section-heading"><div><span className="op88-eyebrow">Discover · DCAT catalogue</span><h2>Available data, visible limitations</h2></div><Badge text="Metadata only — no access granted" /></div>
          <p>The catalogue describes datasets, not permission to use them. Counts are synthetic; federated extensions are future assumptions.</p>
          <div className="op88-table-wrap"><table><caption>Oncology datasets · {catalogue.catalogue.modified}</caption>
            <thead><tr><th>Dataset / description</th><th>Synthetic patients</th><th>Coverage</th><th>Access conditions</th></tr></thead>
            <tbody>{catalogue.catalogue.dataset.map((dataset) => {
              const futureOnly = horizon === 'six-months' && dataset.identifier !== 'crc-mdt';
              return <tr key={dataset.identifier} className={futureOnly ? 'op88-unavailable' : ''}>
                <td><strong>{dataset.title}</strong><small>{dataset.description}</small><details><summary>Inspect dataset record</summary><p>{dataset.variables.join(' · ')}</p><p>Modified: {dataset.modified}</p>{dataset.distribution.map((item) => <p key={item.accessURL}>{item.title} · {item.format}<br /><code>{item.accessURL}</code> · metadata reference, not a delivery link</p>)}</details></td>
                <td>{futureOnly ? 'Not available' : dataset.patient_count}</td><td>{futureOnly ? 'Future extension — not in six months' : dataset.variables.join(', ')}</td><td>{dataset.accessRights}</td>
              </tr>;
            })}</tbody>
          </table></div>
          <details className="op88-disclosure"><summary>Inspect standard DCAT JSON-LD catalogue</summary>
            <p>{horizon === 'six-months' ? 'Six-month view: minimal colorectal dataset only.' : 'Future catalogue: synthetic federated dataset descriptions.'}</p>
            <pre>{JSON.stringify({ ...catalogue.catalogue, dataset: catalogue.catalogue.dataset.filter((dataset) => horizon === 'future' || dataset.identifier === 'crc-mdt') }, null, 2)}</pre>
          </details>
        </section>}

        {step === 1 && <div className="op88-columns">
          <section className="op88-panel">
            <span className="op88-eyebrow">Requester intake · REQ-045</span><h2>Tell the data office what you need</h2>
            <form onSubmit={(event) => { event.preventDefault(); void assess(); }}>
              <label>Oncology data request<textarea rows={5} value={request} onChange={(event) => { invalidate(); setRequest(event.target.value); }} /></label>
              {request.trim().length < 3 && <p className="op88-attention" role="status">Request is too short — describe the oncology data needed in at least 3 characters.</p>}
              <div className="op88-actions"><button type="button" onClick={() => { invalidate(); setRequest(example); }}>Stage III example</button><button type="button" onClick={() => { invalidate(); setRequest(`${example} Include whole-slide images, performance status and quality of life from clinic notes.`); }}>Add images & clinic-note outcomes</button></div>
              <label>Purpose<input value={purpose} onChange={(event) => { invalidate(); setPurpose(event.target.value); }} /></label>
              {!purpose.trim() && <p className="op88-attention" role="status">Purpose is missing — add the intended use.</p>}
              <label>Permit reference (synthetic only)<input placeholder="Leave empty to see the missing-permit review" value={permit} onChange={(event) => { invalidate(); setPermit(event.target.value); }} /></label>
              <p className="op88-muted">A supplied reference is not verified. Do not enter real patient information or real credentials.</p>
              <button className="primary" disabled={busy || request.trim().length < 3 || !purpose.trim()}>{busy ? <><span className="hx-spinner" /> Assessing…</> : 'Assess feasibility with assistant'}</button>
            </form>
          </section>
          <aside className="op88-panel"><span className="op88-eyebrow">A shared front door</span><h2>One request, three views</h2><dl><dt>Researcher</dt><dd>Describe the cohort, variables and purpose in plain words.</dd><dt>Data steward</dt><dd>Inspect source assumptions, gaps, permit and possible reuse.</dd><dt>CIO</dt><dd>See repeated demand and the investment needed across all requests.</dd></dl><p className="op88-attention">No extraction starts here. A human review and later access-body decision remain necessary.</p></aside>
        </div>}

        {step === 2 && <section className="op88-panel">
          <span className="op88-eyebrow">Assistant feasibility · human review required</span><h2>Can this request be answered?</h2>
          <Backstage stages={stages} running={busy} holdLast note="The stage display explains the work; results come from the backend assessment and Copilot SDK (or its labelled fallback)." />
          {error && <div className="op88-attention" role="alert">{error} <button onClick={() => void assess()}>Retry assessment</button></div>}
          {!busy && !result && !error && <p>Run the assessment before proceeding. <button onClick={() => void assess()}>Assess request</button></p>}
          {assessment && <>
            <div className="op88-summary"><div><span className="op88-eyebrow">Potential cohort · simulated</span><strong>{assessment.patient_count ?? 'Unknown'}</strong><span>{assessment.count_note}</span></div><div><span className="op88-eyebrow">Permission</span><Badge text={assessment.permit_status} /><span>No eligibility, access or patient-level delivery established.</span></div><div><span className="op88-eyebrow">Gaps</span><strong>{assessment.missing_variables.length}</strong><span>{assessment.missing_variables.join(', ') || 'No missing variables identified; source conditions still apply.'}</span></div></div>
            <div className="op88-table-wrap"><table><caption>Requested variables mapped to sources</caption><thead><tr><th>Requested variable</th><th>Minimal dataset element</th><th>Likely source</th><th>Assessment</th></tr></thead><tbody>{assessment.mapped.map((variable) => <tr key={variable.id}><td>{variable.label}</td><td>{variable.minimal_name || 'Not in minimal dataset'}</td><td>{variable.likely_source}</td><td><Badge text={variable.status} /></td></tr>)}</tbody></table></div>
            <p className="op88-muted">Likely sources are hackathon assumptions to check per hospital, not measured availability. A simulated count is not a live query.</p>
            {assessment.flags.length > 0 && <div className="op88-attention"><strong>Conditions to resolve</strong><ul>{assessment.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul></div>}
            {result && <section className="op88-agent"><div className="op88-section-heading"><h3>{result.agent.headline}</h3><Badge text={result.agent.mode === 'copilot' ? 'Copilot SDK' : 'Demo fallback — SDK unavailable'} /></div>
              {result.agent.note && <p>{result.agent.note}</p>}
              <p className="op88-muted">Assistant output is a proposal only. All request decisions use the human decision step, with permit and legal-review checks.</p>
              {result.agent.blocks.map((block, index) => <RenderBlock key={index} block={block.type === 'actions' ? { ...block, type: 'summary' } : block} />)}
              <details><summary>Inspect assistant tool activity</summary><ol>{result.agent.trace.map((entry, index) => <li key={index}><strong>{entry.tool}</strong>{entry.arguments && <pre>{entry.arguments}</pre>}</li>)}</ol></details>
            </section>}
          </>}
        </section>}

        {step === 3 && assessment && <div className="op88-columns">
          <section className="op88-panel"><span className="op88-eyebrow">Permission check</span><h2>Review does not equal access</h2><div className="op88-attention"><Badge text={assessment.permit_status} /><p>{permit.trim() ? 'This is only a supplied reference. Its scope, validity and permitted purpose have not been verified.' : 'Ask the requester for a permit reference before approving review or reuse.'}</p></div><button onClick={() => { setStep(1); }}>Edit permit / request</button><p>Editing invalidates this assessment. Reassess the revised request before making a decision.</p><dl><dt>Later: permit verification</dt><dd>A responsible reviewer verifies the authority, scope and purpose.</dd><dt>Later: access-body handoff</dt><dd>The relevant access body decides whether use is permitted.</dd><dt>Later: extraction delivery</dt><dd>An authorised pipeline delivers the agreed data. None of these actions happen in this prototype.</dd></dl></section>
          <section className="op88-panel"><span className="op88-eyebrow">Reuse / investment proposal</span><h2>Do not build the same extraction twice</h2>
            {assessment.reuse ? <><h3>{assessment.reuse.title}</h3><p>Pipeline: <code>{assessment.reuse.pipeline}</code></p><p>Variable overlap: {assessment.reuse.overlap}% (backend comparison). This suggests reuse, not permission to reuse.</p></> : <p>{horizon === 'six-months' ? 'Pipeline reuse needs the future extraction registry — not available in six months.' : 'No matching reusable extraction was found for this request.'}</p>}
            <div className="op88-attention"><strong>Proposed investment</strong><p>{assessment.investment}</p></div>
            <button disabled title="Later capability; no extraction is started">Launch extraction — later</button>
            {catalogue && <details><summary>Inspect registered extraction examples (future)</summary>{catalogue.extractions.map((item) => <p key={item.id}><strong>{item.title}</strong> · {item.cancer} · {item.stage}<br /><code>{item.pipeline}</code><br />{item.variables.join(', ')}</p>)}</details>}
          </section>
        </div>}

        {(step === 4 || step === 5) && <section className="op88-panel">
          <div className="op88-section-heading"><div><span className="op88-eyebrow">CIO / data steward · all requests</span><h2>Demand, pipelines and investment</h2></div><Badge text={`${queue.length} synthetic requests`} /></div>
          <p>Compare proposed work across requests. Open a request to inspect its question, purpose and permit reference.</p>
          <div className="op88-table-wrap"><table><caption>Local request queue · decisions are session-only; no data delivered</caption><thead><tr><th>Request / requester</th><th>Status</th><th>Pipeline</th><th>Investment needed</th></tr></thead><tbody>{queue.map((item) => <tr key={item.id}><td><details><summary><strong>{item.id}</strong> · {item.requester}</summary><dl><dt>Question</dt><dd>{item.request}</dd><dt>Purpose</dt><dd>{item.purpose}</dd><dt>Permit</dt><dd>{item.permit || 'Missing permit reference'}</dd></dl></details></td><td><Badge text={item.status} /></td><td>{item.pipeline}{horizon === 'six-months' && item.id !== currentRequest.id && <small>Future pipeline / reuse proposal — not available in six months</small>}</td><td>{item.investment}{horizon === 'six-months' && item.id !== currentRequest.id && <small>Future investment proposal; six-month work is source mapping and permit review.</small>}</td></tr>)}</tbody></table></div>
          <p className="op88-muted">Repeated oncology outcomes requests suggest shared source mapping; image requests require a separate future work package. These are planning proposals, not approved budgets.</p>
        </section>}

        {step === 5 && <section className="op88-panel op88-decision">
          <span className="op88-eyebrow">Human control · REQ-045</span><h2>Choose the next step, not the access outcome</h2>
          <p>Approve a steward review / reuse proposal, return it to the requester, or edit and reassess.</p>
          <p><strong>Permit:</strong> {assessment?.permit_status ?? 'No current assessment'}</p>
          <label className="op88-check"><input type="checkbox" checked={legalReviewed} onChange={(event) => { setLegalReviewed(event.target.checked); setDecision(''); }} />I have reviewed the legal conditions for forwarding this synthetic proposal. This does not verify the permit or grant access.</label>
          {!permit.trim() && <div className="op88-attention">Approval is blocked: add a synthetic permit reference in intake and run a new assessment.</div>}
          <div className="op88-actions">
            <button className="primary" disabled={!canApprove} onClick={() => decide('Approved for review')}>Approve review / reuse proposal</button>
            <button onClick={() => { invalidate(); setStep(1); }}>Edit request & reassess</button>
            <button disabled={!assessment || !!decision} onClick={() => decide('Sent back to requester')}>Send back for clarification</button>
          </div>
          {decision && <div className="op88-receipt" role="status"><span className="op88-eyebrow">Decision receipt · session only</span><h3>{decision}</h3><p>REQ-045 is updated in the CIO queue above. {decision === 'Approved for review' ? 'The proposal is ready for a responsible steward to review; it has not been sent to an access body.' : 'The requester must clarify the permit, source gaps or scope before further review.'}</p><strong>Access NOT granted. No data delivered.</strong><p>{horizon === 'six-months' ? 'Six-month payoff: a reviewable minimal-dataset request and a visible hospital mapping work package.' : 'Future payoff: one front door connects request feasibility, proposed reuse and a CIO investment decision.'}</p></div>}
        </section>}

        {horizon === 'six-months' && catalogue && <section className="op88-panel">
          <span className="op88-eyebrow">Six-month coverage · actual minimal dataset metadata</span><h2>What this needs from the minimal dataset</h2>
          <p>{catalogue.variables.filter((variable) => variable.minimal_name).length} of {catalogue.variables.length} catalogue variables map to the colorectal working list. This is catalogue coverage, not completeness of patient records.</p>
          <div className="op88-table-wrap"><table><caption>Source assumptions from the minimal MDT dataset, checked per hospital</caption><thead><tr><th>Group / variable</th><th>Element</th><th>Likely source</th><th>Six-month coverage</th></tr></thead><tbody>{catalogue.variables.map((variable) => <tr key={variable.id}><td><small>{variable.group}</small>{variable.label}</td><td>{variable.minimal_name || 'Outside minimal dataset'}</td><td>{variable.likely_source}</td><td><Badge text={!variable.minimal_name || variable.likely_source === 'patient / clinic note' ? 'Missing' : ['report text', 'MDT form'].includes(variable.likely_source) ? 'Conditional' : 'Available'} /></td></tr>)}</tbody></table></div>
          <h3>What each hospital must do</h3><ul><li>Map structured cancer, age, treatment and follow-up fields once to the agreed format; keep records at the hospital.</li><li>Start structuring pTNM from pathology reports and required tumour-board fields; show gaps rather than invent values.</li><li>Agree purpose and permission review for simple approved counts or aggregates; clinic-note outcomes often remain missing.</li></ul>
          <div className="op88-actions"><button disabled>Whole-slide images — future only</button><button disabled>Live federated query — future only</button><button disabled>Pipeline reuse — future only</button></div>
        </section>}
        <footer className="op88-footer">Synthetic records only · Source assumptions require hospital confirmation · Permit verification, access-body handoff and extraction delivery remain later work.</footer>
      </main>
    </div>
  );
}
