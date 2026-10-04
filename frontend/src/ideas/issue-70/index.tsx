import { useEffect, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './board.css';

export const meta: IdeaMeta = {
  id: '70', issue: 70,
  title: 'Is the patient ready for the tumour board?',
  tagline: 'Spot missing colorectal results, ask the right team, and keep board decisions with the coordinator.',
};

type Requirement = { id: string; label: string; source: string; contact: string };
type Result = { available: boolean; detail: string };
type Patient = { id: string; name: string; age: number; sex: string; diagnosis: string; results: Record<string, Result> };
type Board = { scheduled: string; requirements_note: string; requirements: Requirement[]; patients: Patient[] };
type Draft = { id: string; label: string; contact: string; source: string; reason: string; body: string };
type Check = { agent: AgentResult; drafts: Draft[] };
type CaseState = { check?: Check; sent: Record<string, string>; received: string[]; decision?: string };

const story: StoryStep[] = [
  { id: 'worklist', title: 'Next week’s board', explain: 'Eight synthetic patients. A cross means a required signed result is still missing.' },
  { id: 'inspect', title: 'Inspect missing results', explain: 'Elisabeth has two missing reports. Inspect the source and reason, not just the cross.' },
  { id: 'check', title: 'Check sources', explain: 'The assistant checks synthetic records and suggests the right team to ask.' },
  { id: 'review', title: 'Review requests', explain: 'Edit each draft, then explicitly approve a simulated send. No real message leaves this prototype.' },
  { id: 'followup', title: 'Follow up & decide', explain: 'Receive a simulated signed report to update the checklist. You decide whether to discuss or postpone.' },
];
const stages = [
  { label: 'Checking pathology and molecular reports', detail: 'Look for signed histology and MMR/MSI status', ms: 500 },
  { label: 'Checking radiology, laboratory and endoscopy', detail: 'Compare the available reports with this board’s checklist', ms: 500 },
  { label: 'Suggesting contacts and drafting requests', detail: 'A human must review every draft before sending', ms: 500 },
];
const emptyCase = (): CaseState => ({ sent: {}, received: [] });

export default function TumourBoard() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [board, setBoard] = useState<Board | null>(null);
  const [patientId, setPatientId] = useState('CRC-070-01');
  const [step, setStep] = useState('worklist');
  const [cases, setCases] = useState<Record<string, CaseState>>({});
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api.sampleData<Board>('issue-70-board.json').then(setBoard)
      .catch(() => setError('Could not load the synthetic worklist. Reload with the backend running.'));
  }, []);

  const patient = board?.patients.find((p) => p.id === patientId);
  const current = cases[patientId] ?? emptyCase();
  const available = (p: Patient, key: string) => p.results[key].available || (cases[p.id]?.received.includes(key) ?? false);
  const missing = patient && board ? board.requirements.filter((r) => !available(patient, r.id)) : [];
  const patchCase = (update: Partial<CaseState>) => setCases((previous) => ({
    ...previous, [patientId]: { ...(previous[patientId] ?? emptyCase()), ...update },
  }));
  const selectPatient = (id: string) => {
    setPatientId(id); setStep('inspect'); setError(''); setNotice(''); setStarted(false);
  };
  const runCheck = async () => {
    if (busy || !patient) return;
    setBusy(true); setStarted(true); setStep('check'); setError(''); setNotice('');
    try {
      const check = await api.checkBoard<Check>(patientId);
      patchCase({ check: { ...check, drafts: check.drafts.filter((d) => !current.received.includes(d.id)) } });
      setStep('review');
    } catch {
      setError('The source check could not finish. Your requests are preserved. Try “Check sources & draft requests” again.');
    } finally { setBusy(false); }
  };
  const go = (id: string) => {
    if (busy) return;
    if (id === 'check') { void runCheck(); return; }
    if (id === 'review' && !current.check) { void runCheck(); return; }
    if (id === 'followup' && missing.length && !Object.keys(current.sent).length) {
      setNotice('Review and approve at least one request before following up.'); setStep('review'); return;
    }
    setNotice(''); setStep(id);
  };
  const editDraft = (id: string, body: string) => {
    if (current.check) patchCase({ check: { ...current.check, drafts: current.check.drafts.map((d) => d.id === id ? { ...d, body } : d) } });
  };
  const readyCount = board?.patients.filter((p) => board.requirements.every((r) => available(p, r.id))).length ?? 0;

  return <div className={`board70 ${theme}`}>
    <a className="board-skip" href="#board70-main">Skip to board worklist</a>
    <div className="board-top">
      <span>Hackathon prototype – synthetic data – not for clinical use</span>
      <div aria-label="Theme">
        {(['light', 'dark'] as const).map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === 'light' ? 'Light' : 'Dark'}</button>)}
      </div>
    </div>
    <HospitalShell module="Colorectal tumour board preparation"
      nav={[{ id: 'worklist', label: 'Next week’s patients', badge: 8 }, { id: 'inspect', label: 'Required results', badge: missing.length }, { id: 'review', label: 'Requests for review' }, { id: 'followup', label: 'Follow-up & board decision' }]}
      active={step} onNav={go}
      patient={patient ? { ...patient, allergies: 'Not recorded in demo', ward: 'Colorectal outpatient clinic' } : null}
      guide={<StoryGuide steps={story} current={step} onGo={go} nextLabel={step === 'worklist' ? 'Inspect selected patient' : step === 'inspect' ? (busy ? 'Checking sources…' : 'Check sources & draft requests') : undefined} />}
      toolbar={<><strong>Thursday 15 October 2026 · 14:00 · next week’s board (fixed demo date)</strong><span className="hx-spacer" /><Pill tone="ok">{readyCount}/8 complete checklists</Pill></>}>
      <div id="board70-main" tabIndex={-1}>
        <div className="board-heading"><div><span className="board-eyebrow">Tumour board coordinator · preparation worklist</span><h1>Is the patient ready for the tumour board?</h1></div><span>✓ Signed result available<br />✗ Required result missing</span></div>
        {error && <p className="board-attention" role="alert">{error}</p>}
        {notice && <p className="board-attention" role="status">{notice}</p>}
        {!board && !error && <Working label="Loading eight synthetic patients" />}
        {board && patient && <>
          <Panel title="Next week’s colorectal patients">
            <div className="board-table-scroll"><table className="hx-table">
              <caption>Illustrative local requirements · select any patient to inspect their sources</caption>
              <thead><tr><th>Patient / question</th>{board.requirements.map((r) => <th key={r.id}>{r.label}</th>)}<th>Preparation / decision</th></tr></thead>
              <tbody>{board.patients.map((p) => {
                const count = board.requirements.filter((r) => available(p, r.id)).length;
                return <tr key={p.id} className={p.id === patientId ? 'selected' : ''}>
                  <td><button className="board-patient" disabled={busy} onClick={() => selectPatient(p.id)} aria-pressed={p.id === patientId}>{p.name}</button><small>{p.diagnosis}</small></td>
                  {board.requirements.map((r) => <td key={r.id}><span className={available(p, r.id) ? 'board-ok' : 'board-missing'} aria-label={`${r.label}: ${available(p, r.id) ? 'available' : 'missing'}`}>{available(p, r.id) ? '✓' : '✗'}</span>{cases[p.id]?.sent[r.id] && !available(p, r.id) && <small>Requested</small>}</td>)}
                  <td><Pill tone={count === 5 ? 'ok' : 'warn'}>{count === 5 ? 'Checklist complete' : `${5 - count} outstanding`}</Pill><small>{cases[p.id]?.decision ?? 'Board decision pending'}</small></td>
                </tr>;
              })}</tbody>
            </table></div>
          </Panel>
          {step !== 'worklist' && <div className="board-detail-grid">
            <Panel title={`${patient.name} · required results`}>
              <p className="board-attention">{missing.length ? `${missing.length} results still outstanding. A sent request does not count as a result.` : 'All five required results are available. Board inclusion still needs your judgment.'}</p>
              <ul className="board-results">{board.requirements.map((r) => <li key={r.id}>
                <strong className={available(patient, r.id) ? 'board-ok' : 'board-missing'}>{available(patient, r.id) ? '✓' : '✗'} {r.label}</strong>
                <span>{current.received.includes(r.id) ? 'Signed report received and attached · simulated follow-up' : patient.results[r.id].detail}</span>
                <small>{r.source}{!available(patient, r.id) && ` · suggested contact: ${r.contact}`}</small>
              </li>)}</ul>
              <details><summary>Where this checklist comes from</summary><p>{board.requirements_note}</p><p>Source: sample-data/issue-70-board.json · new fictional colorectal cases using the repository’s synthetic patient format.</p><p>MMR: mismatch repair; MSI: microsatellite instability; CEA: carcinoembryonic antigen.</p></details>
              <button className="hx-btn primary" disabled={busy} onClick={() => void runCheck()}>{busy ? <><span className="hx-spinner" /> Checking sources…</> : 'Check sources & draft requests'}</button>
            </Panel>
            <Panel title={step === 'followup' ? 'Follow-up & your board decision' : 'Assistant · missing-result requests'}>
              <Backstage stages={stages} running={started} holdLast release={!busy} note="Source systems and stage timings are simulated. Drafting uses Copilot SDK when configured, otherwise a labelled deterministic demo." />
              {current.check && <>
                <Pill tone={current.check.agent.mode === 'copilot' ? 'info' : 'neutral'}>{current.check.agent.mode === 'copilot' ? 'Copilot SDK' : 'Demo mode · no live AI'}</Pill>
                {current.check.agent.note && <p>{current.check.agent.note}</p>}
                {current.check.agent.blocks.filter((b) => b.type !== 'actions').map((b, i) => <RenderBlock key={i} block={b} />)}
                {step !== 'followup' && current.check.drafts.map((draft) => <div className="board-draft" key={draft.id}>
                  <h3>{draft.label} → {draft.contact}</h3><p>{draft.reason}</p>
                  <label htmlFor={`draft-${draft.id}`}>Request for human review</label>
                  <textarea id={`draft-${draft.id}`} rows={5} value={draft.body} disabled={busy || !!current.sent[draft.id]} onChange={(e) => editDraft(draft.id, e.target.value)} />
                  <button className="hx-btn primary" disabled={busy || !!current.sent[draft.id] || current.received.includes(draft.id) || !draft.body.trim()} onClick={() => {
                    patchCase({ sent: { ...current.sent, [draft.id]: draft.body } });
                    setNotice(`${draft.label}: approved request sent to ${draft.contact} (simulation only). The result remains outstanding.`);
                  }}>{current.sent[draft.id] ? '✓ Approved & sent (simulated)' : 'Approve & send request (simulated)'}</button>
                  <button className="hx-btn" disabled={busy || !!current.sent[draft.id]} onClick={() => {
                    patchCase({ check: { ...current.check!, drafts: current.check!.drafts.filter((d) => d.id !== draft.id) } });
                    setNotice(`${draft.label} request dismissed. Its result is still missing.`);
                  }}>Dismiss draft</button>
                </div>)}
                {step !== 'followup' && <button className="hx-btn" disabled={busy} onClick={() => go('followup')}>Open follow-up & board decision →</button>}
              </>}
              {!current.check && !busy && <p>Check sources to see what is missing, who to ask and an editable draft.</p>}
              {step === 'followup' && <>
                <h3>Simulate the team’s reply</h3>
                {board.requirements.filter((r) => current.sent[r.id]).map((r) => <div className="board-receipt" key={r.id}>
                  <strong>{r.label} · {r.contact}</strong>
                  <details><summary>Inspect approved request</summary><p className="board-message">{current.sent[r.id]}</p></details>
                  <button className="hx-btn" disabled={current.received.includes(r.id)} onClick={() => {
                    patchCase({ received: [...current.received, r.id] });
                    setNotice(`${r.label}: simulated signed report received. Checklist updated; remaining results stay flagged.`);
                  }}>{current.received.includes(r.id) ? '✓ Signed report received (simulated)' : `Receive signed ${r.label} report (simulated)`}</button>
                </div>)}
                <p><strong>{missing.length ? `Still outstanding: ${missing.map((r) => r.label).join(', ')}.` : 'Payoff: complete checklist, ready for your board decision.'}</strong></p>
                <p>Only you decide whether to discuss this case. Treatment remains the board’s decision.</p>
                <button className="hx-btn primary" onClick={() => patchCase({ decision: 'Discuss at board · human decision' })}>Keep for discussion</button>{' '}
                <button className="hx-btn" onClick={() => patchCase({ decision: 'Postponed · human decision' })}>Postpone this patient</button>
                {current.decision && <p role="status" className="board-attention">{current.decision}. The worklist reflects your decision; no treatment has been selected.</p>}
              </>}
            </Panel>
          </div>}
        </>}
      </div>
    </HospitalShell>
  </div>;
}
