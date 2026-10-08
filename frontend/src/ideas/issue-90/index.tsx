import { useEffect, useRef, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, Working, type Stage } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './desk.css';

export const meta: IdeaMeta = {
  id: '90',
  issue: 90,
  title: 'Data access desk',
  tagline: 'Approve routine oncology data requests instantly, review exceptions, and learn from repeated decisions.',
};

type Horizon = 'future' | 'six-months';
type Tab = 'requests' | 'rules' | 'audit' | 'coverage';
type AccessRequest = {
  id: string; title: string; agent: string; purpose: string; data: string[];
  scope: string; consent: string; permit: string; free_text: string;
};
type Rule = {
  id: string; title: string; purpose: string; scope: string;
  data: string[]; consent: string; permit: string; text: string;
};
type Log = {
  id: string; time: string; request_id: string; title: string;
  decision: string; rule_id: string | null; actor: string; reason: string;
};
type Desk = {
  requests: AccessRequest[]; rules: Rule[]; log: Log[];
  suggestion: Rule & { evidence_ids: string[] };
};
type Assessment = {
  request: AccessRequest;
  structured: { purpose: string; data: string[]; scope: string };
  checks: { label: string; passed: boolean; detail: string }[];
  status: 'approved' | 'review' | 'unavailable'; rule_id: string | null;
  differences: string[]; agent: AgentResult;
};
type Dataset = {
  title: string; source: string;
  groups: { group: string; elements: { name: string; likely_source: string }[] }[];
};

const steps = [
  { title: 'Open the request', text: 'A data steward opens tomorrow’s colorectal tumour-board request. The requester describes the work in plain words.', action: 'Structure the tumour-board request' },
  { title: 'Structure the request', text: 'The assistant turns the request into a purpose, a data list and a scope. Consent and permit remain inspectable inputs, not an AI guess.', action: 'Inspect the policy decision' },
  { title: 'Apply the policy', text: 'Deterministic checks decide whether the existing rule matches. A complete match creates an automatic approval and an audit receipt.', action: 'Assess the research exception' },
  { title: 'Review the exception', text: 'A research paper resembles quality monitoring, but a different purpose is not permission. The assistant prepares the comparison; the steward decides.', action: 'Open the weekly access log' },
  { title: 'Review the weekly log', text: 'Automatic decisions are recorded alongside human decisions. Three historical approvals of the same research exception suggest a reusable rule.', action: 'Inspect the proposed research rule' },
  { title: 'Decide on the new rule', text: 'Accept or reject the proposal explicitly. An accepted rule is an inspectable session draft, not a real access grant or an active backend policy.', action: 'Restart the walkthrough' },
];

const stages: Stage[] = [
  { label: 'Assistant structures the request', detail: 'Purpose · requested data · scope', ms: 650 },
  { label: 'Policy engine checks the recorded conditions', detail: 'Consent · permit · purpose · data · scope', ms: 750 },
  { label: 'Assistant prepares the steward’s assessment', detail: 'Public explanation and inspectable differences; the engine owns the decision', ms: 800 },
];
const unavailableReasons: Record<string, string> = {
  'RES-018': 'Research use needs a separate approved research purpose, consent and permit; the minimal MDT dataset alone does not establish these.',
  'FED-009': 'Live cross-hospital patient-level queries are outside the six-month dataset. Approved aggregate questions are a later, separate workflow.',
  'CON-007': 'Unstructured consent interpretation is not available in six months. Each hospital must supply an explicit, locally verified consent status.',
};

function Badge({ children, tone = '' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`d90-badge ${tone}`}>{children}</span>;
}

export default function DataAccessDesk() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [horizon, setHorizon] = useState<Horizon>('future');
  const [desk, setDesk] = useState<Desk | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverageError, setCoverageError] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('requests');
  const [selectedId, setSelectedId] = useState('MDT-041');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [assessments, setAssessments] = useState<Record<string, Assessment>>({});
  const [localLog, setLocalLog] = useState<Log[]>([]);
  const [reason, setReason] = useState('');
  const [proposal, setProposal] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [notice, setNotice] = useState('');
  const requestSequence = useRef(0);

  const loadDesk = () => {
    setLoading(true);
    setError('');
    api.ideaRequest<Desk>('90', 'desk').then(setDesk)
      .catch((e: unknown) => setError(`The access desk could not be loaded: ${String(e)}. Retry to open the synthetic worklist.`))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    loadDesk();
    api.sampleData<Dataset>('minimal-mdt-dataset.json').then(setDataset)
      .catch(() => setCoverageError('The minimal dataset could not be loaded. Coverage is not estimated or invented.'));
  }, []);

  const key = `${horizon}:${selectedId}`;
  const assessment = assessments[key];
  const selected = desk?.requests.find((r) => r.id === selectedId);
  const blocked = horizon === 'six-months' ? unavailableReasons[selectedId] : undefined;
  const logs = [...localLog, ...(desk?.log ?? [])];
  const humanDecision = localLog.find((l) => l.request_id === selectedId && l.actor === 'Steward');
  const historicalExceptions = desk?.log.filter((l) => l.decision === 'approved' && l.actor === 'Steward'
    && l.rule_id === 'EXCEPTION' && l.title === desk.requests.find((r) => r.id === 'RES-018')?.title) ?? [];
  const usedElements = new Set(desk?.requests.flatMap((request) => request.data) ?? []);
  const coverage = dataset?.groups.flatMap((g) => g.elements.filter((e) => usedElements.has(e.name))
    .map((e) => ({ ...e, group: g.group }))) ?? [];

  async function assess(id = selectedId, nextStep?: number) {
    if (busy || (horizon === 'six-months' && unavailableReasons[id])) return;
    const sequence = ++requestSequence.current;
    setSelectedId(id);
    setTab('requests');
    setBusy(true);
    setError('');
    setNotice('');
    setReason('');
    if (nextStep !== undefined) setStep(nextStep);
    try {
      const result = await api.ideaRequest<Assessment>('90', 'assess', { request_id: id, horizon });
      if (sequence !== requestSequence.current) return;
      setAssessments((previous) => ({ ...previous, [`${horizon}:${id}`]: result }));
      if (result.status === 'approved') {
        setLocalLog((previous) => previous.some((l) => l.id === `AUTO-${horizon}-${id}`) ? previous : [{
          id: `AUTO-${horizon}-${id}`, time: new Date().toISOString(), request_id: id,
          title: result.request.title, decision: 'approved', rule_id: result.rule_id,
          actor: 'Policy engine', reason: `All recorded conditions matched ${result.rule_id}. Session-only simulated receipt (${horizon}).`,
        }, ...previous]);
      }
    } catch (e: unknown) {
      setError(`Assessment could not be completed: ${String(e)}. No decision or access grant has been created. Retry the assessment.`);
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  }

  function selectRequest(id: string) {
    setSelectedId(id);
    setReason('');
    setNotice('');
    setError('');
  }

  function decide(decision: 'approved' | 'declined') {
    if (!assessment || assessment.status !== 'review' || humanDecision || blocked || !reason.trim()) return;
    setLocalLog((previous) => [{
      id: `HUMAN-${selectedId}-${Date.now()}`, time: new Date().toISOString(),
      request_id: selectedId, title: assessment.request.title, decision, rule_id: 'EXCEPTION',
      actor: 'Steward', reason: reason.trim(),
    }, ...previous]);
    setNotice(`Request ${decision} by the steward. A session-only audit receipt was added; no real data access was granted.`);
  }

  function goStep(index: number) {
    if (busy) return;
    setStep(index);
    setNotice('');
    if (index <= 2) {
      setTab('requests');
      selectRequest('MDT-041');
      if (index > 0 && !assessments[`${horizon}:MDT-041`]) void assess('MDT-041', index);
    } else if (index === 3) {
      setTab('requests');
      selectRequest('RES-018');
      if (horizon === 'future' && !assessments['future:RES-018']) void assess('RES-018', index);
    } else setTab(index === 4 ? 'audit' : 'rules');
  }

  function proposalDecision(value: 'accepted' | 'rejected') {
    if (horizon !== 'future' || proposal !== 'pending' || !desk || historicalExceptions.length < 3) return;
    setProposal(value);
    setLocalLog((previous) => [{
      id: `RULE-${Date.now()}`, time: new Date().toISOString(), request_id: desk.suggestion.id,
      title: desk.suggestion.title, decision: value, rule_id: value === 'accepted' ? 'RES-DRAFT-01' : null,
      actor: 'Steward', reason: value === 'accepted'
        ? 'Approved a machine-readable session draft after inspecting three historical exceptions. Not activated in the backend.'
        : 'Rejected the proposed rule. Existing rules remain unchanged.',
    }, ...previous]);
    setNotice(value === 'accepted'
      ? 'Research rule draft approved for this session. Future assessments still use the backend’s existing rules and require human review.'
      : 'Research rule proposal rejected. No new rule has been added.');
  }

  const needsDecision = step === 3 && horizon === 'future' && assessment?.status === 'review' && !humanDecision;
  return (
    <div className="d90" data-theme={theme}>
      <a className="d90-skip" href="#d90-main" onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById('d90-main');
        main?.focus();
        main?.scrollIntoView();
      }}>Skip to access desk</a>
      <div className="d90-disclaimer">Hackathon prototype – synthetic data – not for clinical use</div>
      <header className="d90-header">
        <div className="d90-identity"><span className="d90-mark" aria-hidden>+</span><div><strong>Data access desk</strong><small>Health Rewired · Oncology data stewardship · Munich</small></div></div>
        <div className="d90-header-controls">
          <div className="d90-switch" aria-label="Prototype horizon">
            <button aria-pressed={horizon === 'six-months'} disabled={busy} onClick={() => { setHorizon('six-months'); setNotice(''); setError(''); }}>In six months</button>
            <button aria-pressed={horizon === 'future'} disabled={busy} onClick={() => { setHorizon('future'); setNotice(''); setError(''); }}>The future</button>
          </div>
          <div className="d90-switch" aria-label="Workspace theme">
            <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
            <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>
      </header>
      <div className="d90-context">
        <div><span className="d90-eyebrow">Steward workstation / synthetic environment</span><h1>Every request has a purpose. Every decision has a record.</h1></div>
        <div className="d90-context-facts"><span><strong>{desk?.requests.length ?? '—'}</strong> requests</span><span><strong>{desk?.rules.length ?? '—'}</strong> active demo rules</span><span><strong>{historicalExceptions.length}</strong> repeated exceptions</span></div>
      </div>
      <div className="d90-layout">
        <aside className="d90-sidebar">
          <span className="d90-eyebrow">Data stewardship</span>
          <nav aria-label="Access desk sections">
            {([['requests', 'Access requests', 'Purpose, scope and decision'], ['rules', 'Rules & proposals', 'Inspect the permission boundary'], ['audit', 'Weekly access log', 'Automatic and human receipts'], ['coverage', 'Six-month readiness', 'What hospitals must deliver']] as const).map(([id, label, detail]) => (
              <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><strong>{label}</strong><small>{detail}</small></button>
            ))}
          </nav>
          <div className="d90-sidebar-note"><Badge tone="warning">Session-only simulation</Badge><p>No real access grants. Human decisions and approved rule drafts are kept in this page only and reset on reload.</p></div>
          <div className="d90-sidebar-note"><span className="d90-eyebrow">Decision boundary</span><p>The assistant structures and explains. Deterministic policy checks decide routine matches. The steward owns exceptions.</p></div>
        </aside>
        <main id="d90-main" tabIndex={-1}>
          <section className="d90-guide" aria-label="Six-step guided story">
            <ol>{steps.map((s, index) => <li key={s.title}><button disabled={busy} aria-current={step === index ? 'step' : undefined} onClick={() => goStep(index)}><span>{index + 1}</span>{s.title}{horizon === 'six-months' && (index === 3 || index === 5) && <small>Future only</small>}</button></li>)}</ol>
            <div className="d90-guide-detail"><div><span className="d90-eyebrow">Guided story · {step + 1} of 6</span><p>{horizon === 'six-months' && (step === 3 || step === 5) ? 'Research permissions and research-rule learning need more than the minimal MDT dataset. Inspect the gap, then continue to the six-month payoff: routine MDT checks and an access log.' : steps[step].text}</p></div><button className="d90-primary" disabled={busy || loading || !desk || needsDecision} onClick={() => goStep(step === 5 ? 0 : step + 1)}>{busy ? <><span className="d90-spinner" /> Working…</> : steps[step].action} {!busy && '→'}</button></div>
            {needsDecision && <p className="d90-guide-hint">Approve or decline below, with a reason, before opening the weekly log.</p>}
          </section>

          {horizon === 'six-months' && <div className="d90-attention"><Badge tone="warning">Six-month boundary</Badge><span>Routine colorectal MDT and locally approved quality monitoring only. Research, live patient-level federation and free-text consent interpretation are disabled. <button className="d90-text-button" onClick={() => setTab('coverage')}>Inspect dataset coverage →</button></span></div>}
          {error && <div className="d90-attention danger" role="alert">{error}{!desk && <button onClick={loadDesk}>Retry loading desk</button>}</div>}
          {notice && <div className="d90-attention" role="status">{notice}</div>}
          {loading && <section className="d90-panel"><Working label="Loading synthetic access requests and policy rules" /></section>}

          {desk && tab === 'requests' && <div className="d90-request-grid">
            <section className="d90-panel d90-worklist"><header className="d90-panel-heading"><div><span className="d90-eyebrow">Incoming worklist</span><h2>Access requests</h2></div><Badge>{desk.requests.length} cases</Badge></header>
              <div className="d90-request-list">{desk.requests.map((r) => {
                const unavailable = horizon === 'six-months' && unavailableReasons[r.id];
                const result = assessments[`${horizon}:${r.id}`];
                const receipt = localLog.find((l) => l.request_id === r.id && l.actor === 'Steward');
                return <button key={r.id} disabled={busy} className={`${selectedId === r.id ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`} aria-pressed={selectedId === r.id} onClick={() => selectRequest(r.id)}><span className="d90-request-top"><code>{r.id}</code><Badge tone={unavailable ? '' : receipt?.decision === 'approved' || result?.status === 'approved' ? 'success' : 'warning'}>{unavailable ? 'Future only' : receipt?.decision ?? (result?.status === 'approved' ? 'Auto-approved' : result?.status === 'review' ? 'Human review' : 'Awaiting assessment')}</Badge></span><strong>{r.title}</strong><small>{r.agent}</small>{unavailable && <small>{unavailable}</small>}</button>;
              })}</div>
            </section>
            <div className="d90-case">
              {selected && <section className="d90-panel">
                <header className="d90-panel-heading"><div><span className="d90-eyebrow">{selected.id} · current request</span><h2>{selected.title}</h2></div><Badge>{selected.agent}</Badge></header>
                <blockquote>{selected.free_text}</blockquote>
                <div className="d90-request-inputs"><div><span className="d90-eyebrow">Recorded consent</span><p>{selected.consent}</p></div><div><span className="d90-eyebrow">Recorded permit</span><p>{selected.permit}</p></div></div>
                {blocked ? <div className="d90-attention"><Badge>Unavailable in six months</Badge>{blocked}</div> : <div className="d90-actions"><button className="d90-primary" disabled={busy} onClick={() => void assess()}>{busy ? <><span className="d90-spinner" /> Working…</> : assessment ? 'Reassess this request' : 'Structure & assess request'}</button><span className="d90-muted">Assistant prepares · policy engine checks · steward reviews</span></div>}
              </section>}
              <Backstage title="Preparing the access assessment" stages={stages} running={busy} holdLast release={!busy} note="Stage timings are illustrative. The final stage waits for the SDK-backed response; answers may take up to a minute." />
              {assessment && !busy && !blocked && <>
                <section className="d90-panel"><header className="d90-panel-heading"><div><span className="d90-eyebrow">Structured request / inspectable inputs</span><h2>What is being requested?</h2></div><Badge tone={assessment.status === 'approved' ? 'success' : 'warning'}>{assessment.status === 'approved' ? 'Instant simulated approval' : assessment.status === 'review' ? 'Human review required' : 'Unavailable'}</Badge></header>
                  <dl className="d90-definition"><dt>Purpose</dt><dd>{assessment.structured.purpose}</dd><dt>Data</dt><dd>{assessment.structured.data.join(' · ')}</dd><dt>Scope</dt><dd>{assessment.structured.scope}</dd><dt>Policy reference</dt><dd>{assessment.rule_id ?? 'No fully matching rule'}</dd></dl>
                  <h3>Deterministic policy checks</h3><ul className="d90-checks">{assessment.checks.map((check, i) => <li key={`${check.label}-${i}`}><span className={check.passed ? 'd90-pass' : 'd90-fail'}>{check.passed ? '✓ Pass' : '× Not matched'}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></li>)}</ul>
                  {assessment.differences.length > 0 && <div className="d90-differences"><h3>Why the near match is not permission</h3><ul>{assessment.differences.map((difference) => <li key={difference}>{difference}</li>)}</ul></div>}
                  {assessment.status === 'approved' && <div className="d90-attention success"><Badge tone="success">Approval recorded</Badge>All conditions matched {assessment.rule_id}. The policy engine added a session-only audit receipt. <button className="d90-text-button" onClick={() => setTab('audit')}>Inspect the receipt →</button></div>}
                  {assessment.status === 'review' && <div className="d90-human"><h3>Steward decision</h3><p>No exact policy match. Review consent, permit and the differences above before deciding.</p>{humanDecision ? <div role="status"><Badge tone={humanDecision.decision === 'approved' ? 'success' : 'danger'}>{humanDecision.decision}</Badge><p>{humanDecision.reason}</p><small>Steward · session-only exception · no real access grant</small></div> : <><label htmlFor="d90-reason">Reason for your decision</label><textarea id="d90-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Record why this research use is approved or declined after checking its consent and permit." rows={3} /><div className="d90-actions"><button className="d90-primary" disabled={!reason.trim()} onClick={() => decide('approved')}>Approve this exception</button><button className="d90-decline" disabled={!reason.trim()} onClick={() => decide('declined')}>Decline this request</button></div><small>A reason is required. This records a human decision, not an AI authorization.</small></>}</div>}
                </section>
                <section className="d90-panel d90-agent"><header className="d90-panel-heading"><div><span className="d90-eyebrow">Assistant’s public summary</span><h2>{assessment.agent.headline}</h2></div><Badge tone={assessment.agent.mode === 'copilot' ? 'success' : 'warning'}>{assessment.agent.mode === 'copilot' ? 'Copilot SDK' : 'Deterministic demo fallback'}</Badge></header>
                  {assessment.agent.note && <p className="d90-agent-note">{assessment.agent.note}</p>}
                  {assessment.agent.blocks.map((block, index) => <RenderBlock key={`${block.type}-${index}`} block={block} />)}
                  <details><summary>Inspect assistant tools and provenance</summary><p>The assistant’s explanation is separate from the deterministic authorization checks above.</p><ul>{assessment.agent.trace.map((trace, index) => <li key={index}><code>{trace.tool}</code>{trace.arguments && <pre>{trace.arguments}</pre>}</li>)}</ul></details>
                </section>
              </>}
              {!assessment && !busy && !blocked && <section className="d90-panel d90-empty"><span className="d90-eyebrow">Ready for assessment</span><h3>The request is not yet approved.</h3><p>Structure and assess it to inspect its purpose, scope, consent and permit against the current policy.</p></section>}
            </div>
          </div>}

          {desk && tab === 'audit' && <section className="d90-panel">
            <header className="d90-panel-heading"><div><span className="d90-eyebrow">Weekly automatic access log / synthetic records</span><h2>Decisions you can account for</h2></div><Badge>{logs.length} receipts</Badge></header>
            <div className="d90-log-summary"><div><strong>{logs.filter((l) => l.actor === 'Policy engine').length}</strong><span>Automatic policy decisions</span></div><div><strong>{historicalExceptions.length}</strong><span>Historical same-case research exceptions</span></div><div><strong>{localLog.filter((l) => l.actor === 'Steward').length}</strong><span>Human actions in this session</span></div></div>
            <p className="d90-muted">Weekly review is generated from the synthetic historical access log plus this session’s decisions. Historical records belong to the future scenario; local additions reset on reload.</p>
            <div className="d90-table-wrap"><table><caption>Access decision receipts — inspect the actor, policy and reason</caption><thead><tr><th>Time / receipt</th><th>Request</th><th>Decision</th><th>Policy / actor</th><th>Reason</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} id={`d90-log-${log.id}`}><td><time>{log.time}</time><code>{log.id}</code></td><td><strong>{log.title}</strong><code>{log.request_id}</code></td><td><Badge tone={['approved', 'accepted'].includes(log.decision) ? 'success' : 'danger'}>{log.decision}</Badge></td><td><code>{log.rule_id ?? '—'}</code><span>{log.actor}</span></td><td>{log.reason}{localLog.includes(log) && <small>Session-only simulation</small>}</td></tr>)}</tbody></table></div>
            <div className="d90-attention"><Badge tone="warning">{historicalExceptions.length} historical exceptions</Badge><span>Three past identical research exceptions were approved by the steward. These recorded decisions suggest a reusable research rule for the steward to review.</span><button onClick={() => { setTab('rules'); setStep(5); }}>Inspect proposed rule →</button></div>
          </section>}

          {desk && tab === 'rules' && <div className="d90-rules-grid">
            <section className="d90-panel"><header className="d90-panel-heading"><div><span className="d90-eyebrow">Backend policy / deterministic conditions</span><h2>Existing access rules</h2></div><Badge>{desk.rules.length} active demo rules</Badge></header>
              {desk.rules.map((rule) => <article className="d90-rule" key={rule.id}><div className="d90-panel-heading"><h3>{rule.title}</h3><code>{rule.id}</code></div><p>{rule.text}</p><dl className="d90-definition"><dt>Purpose</dt><dd>{rule.purpose}</dd><dt>Scope</dt><dd>{rule.scope}</dd><dt>Data</dt><dd>{rule.data.join(' · ')}</dd><dt>Consent</dt><dd>{rule.consent}</dd><dt>Permit</dt><dd>{rule.permit}</dd></dl><details><summary>Inspect machine-readable rule</summary><pre>{JSON.stringify(rule, null, 2)}</pre></details></article>)}
              {proposal === 'accepted' && <article className="d90-rule d90-approved-draft"><Badge tone="success">Approved session draft · not activated</Badge><h3>{desk.suggestion.title}</h3><code>RES-DRAFT-01</code><p>{desk.suggestion.text}</p><p>This approved draft is visible for future simulation. It is not sent to the backend and cannot automatically authorize research requests.</p><details open><summary>Inspect approved machine-readable rule</summary><pre>{JSON.stringify({ id: 'RES-DRAFT-01', title: desk.suggestion.title, purpose: desk.suggestion.purpose, scope: desk.suggestion.scope, data: desk.suggestion.data, consent: desk.suggestion.consent, permit: desk.suggestion.permit, status: 'approved_session_draft', active: false }, null, 2)}</pre></details></article>}
            </section>
            <section className="d90-panel d90-proposal"><span className="d90-eyebrow">Learning from repeated human decisions</span><div className="d90-panel-heading"><h2>A proposed research rule</h2><Badge tone={proposal === 'accepted' ? 'success' : proposal === 'rejected' ? 'danger' : 'warning'}>{proposal === 'pending' ? 'Steward review' : proposal}</Badge></div><h3>{desk.suggestion.title}</h3><p>{desk.suggestion.text}</p>
              <dl className="d90-definition"><dt>Purpose</dt><dd>{desk.suggestion.purpose}</dd><dt>Scope</dt><dd>{desk.suggestion.scope}</dd><dt>Data</dt><dd>{desk.suggestion.data.join(' · ')}</dd><dt>Consent</dt><dd>{desk.suggestion.consent}</dd><dt>Permit</dt><dd>{desk.suggestion.permit}</dd></dl>
              <h3>Evidence: exactly three historical approvals</h3><ul className="d90-evidence">{desk.suggestion.evidence_ids.map((id) => { const evidence = desk.log.find((l) => l.id === id); return <li key={id}><code>{id}</code><strong>{evidence?.title ?? 'Receipt not found'}</strong><small>{evidence ? `${evidence.time} · ${evidence.actor} · ${evidence.decision} · ${evidence.rule_id}` : 'Do not accept without an inspectable receipt.'}</small>{evidence && <p>{evidence.reason}</p>}</li>; })}</ul>
              <button className="d90-text-button" onClick={() => setTab('audit')}>Open full weekly log →</button>
              {horizon === 'six-months' ? <div className="d90-attention"><Badge>Future only</Badge>Research rules require research-specific agreements and verified consent beyond the minimal dataset. Accept and reject are disabled in this horizon.</div> : <div className="d90-human"><h3>Keep the steward in control</h3><p>Accepting creates a machine-readable, approved session draft. The existing backend rules remain unchanged; research still requires review.</p><div className="d90-actions"><button className="d90-primary" disabled={proposal !== 'pending' || historicalExceptions.length < 3} onClick={() => proposalDecision('accepted')}>Accept proposed research rule</button><button className="d90-decline" disabled={proposal !== 'pending'} onClick={() => proposalDecision('rejected')}>Reject proposed rule</button></div></div>}
              {step === 5 && <div className="d90-payoff"><span className="d90-eyebrow">The payoff</span><h3>{horizon === 'six-months' ? 'Start with accountable tumour-board access.' : proposal === 'accepted' ? 'Routine access is fast. Repeated exceptions become inspectable rules.' : proposal === 'rejected' ? 'The steward rejected the proposal. The boundary stays unchanged.' : 'Faster routine work, with human control over new uses.'}</h3><p>{horizon === 'six-months' ? 'Hospitals can map colorectal MDT fields, verify local permissions and keep a clear access log. Research and live federation remain visibly outside this first step.' : 'The assistant prepares, the policy engine checks, and the steward decides where the rulebook changes. Every action leaves a visible simulated receipt.'}</p></div>}
            </section>
          </div>}

          {tab === 'coverage' && <section className="d90-panel"><header className="d90-panel-heading"><div><span className="d90-eyebrow">Six-month delivery / colorectal MDT</span><h2>What this needs from the minimal dataset</h2></div><Badge>Working-list assumptions</Badge></header>
            {!dataset && !coverageError && <Working label="Loading minimal dataset coverage" />}
            {coverageError && <p role="alert">{coverageError}</p>}
            {dataset && <><p><strong>{coverage.length} of {usedElements.size} requested clinical elements</strong> are in the working list; <strong>{coverage.filter((e) => !['structured', 'derived'].includes(e.likely_source)).length}</strong> usually need report or MDT-form structuring. This is a synthetic readiness illustration, not a hospital measurement.</p><div className="d90-table-wrap"><table><caption>{dataset.title}</caption><thead><tr><th>Group</th><th>Element</th><th>Likely source</th><th>Six-month availability</th></tr></thead><tbody>{coverage.map((element) => <tr key={element.name}><td>{element.group}</td><td>{element.name}</td><td>{element.likely_source}</td><td><Badge tone={['structured', 'derived'].includes(element.likely_source) ? 'success' : 'warning'}>{['structured', 'derived'].includes(element.likely_source) ? '✓ Reliable after mapping' : '◐ Gaps until structured'}</Badge></td></tr>)}</tbody></table></div>
              <div className="d90-coverage-grid"><section><h3>Not provided by the minimal dataset</h3><ul><li>× Explicit consent and permit policy — local governance inputs, not inferred from clinical fields.</li><li>× Research-paper access permissions — a separate approved use.</li><li>× Live cross-hospital patient-level querying.</li><li>× Interpretation of free-text consent.</li><li>× Hospital-system write-back or real grants.</li></ul></section><section><h3>What each hospital must do</h3><ul><li>Map the listed structured clinical, treatment and survival fields to a common colorectal format; keep records locally.</li><li>Start structuring staging reports and fixed MDT conclusions and recommendations.</li><li>Provide locally verified, explicit consent and permit statuses with the approved MDT and quality-monitoring rules.</li><li>Agree the allowed purposes, data scope and steward review process; deliver inspectable access receipts.</li></ul></section></div><details><summary>Dataset provenance and assumptions</summary><p>{dataset.source}</p><p>Likely sources are hackathon assumptions, not measured availability. Clinical coverage never implies consent or research permission. Source: sample-data/minimal-mdt-dataset.json.</p></details></>}
          </section>}
        </main>
      </div>
      <footer className="d90-footer"><span>Oncology Hackathon 2026 · Munich</span><span>Synthetic operations demo · no real access grants · local changes reset on reload</span></footer>
    </div>
  );
}
