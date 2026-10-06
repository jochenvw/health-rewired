import { useEffect, useState } from 'react';
import { request, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, Working, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './style.css';

export const meta: IdeaMeta = {
  id: '80', issue: 80,
  title: 'Guideline recommendations during MDT preparation',
  tagline: 'Review the patient facts, compare three guidelines, and bring the open questions to the tumour board.',
};

type Field = { key: string; label: string; value: string; source: string; likely_source: string; minimal: boolean };
type RecordData = {
  id: string; name: string; age: number; sex: string; diagnosis: string;
  fields: Field[]; documents: { name: string; format: string; body: string }[];
};
type Preparation = {
  record: RecordData;
  recommendations: { guideline: string; option: string; passage: string; source: string; used: string[]; status: string }[];
  missing: { label: string; status: string; source: string; branches: string[] }[];
  conflicts: { option: string; reason: string }[];
  agent: AgentResult;
};
type Dataset = { groups: { group: string; elements: { name: string; likely_source: string }[] }[] };
const steps: StoryStep[] = [
  { id: '0', title: 'MDT worklist', explain: 'Open the highlighted colon cancer case for primary treatment planning.' },
  { id: '1', title: 'Read & review', explain: 'Start preparation, then correct the extracted facts before comparing options.' },
  { id: '2', title: 'Compare guidelines', explain: 'Inspect three fictional guideline excerpts and the exact reviewed facts used.' },
  { id: '3', title: 'Missing data', explain: 'See which results are pending and how each outcome would change the discussion.' },
  { id: '4', title: 'Patient fit', explain: 'Check options against allergies, comorbidity and what matters to this patient.' },
  { id: '5', title: 'MDT summary', explain: 'Adjust the draft and explicitly confirm it for the synthetic tumour board.' },
];
const stages = [
  { label: 'Read the synthetic record', detail: 'CSV fields · Word-style note · FHIR-style resource', ms: 500 },
  { label: 'Check evidence and missing results', detail: 'Reviewed facts only; unknown is never a negative result', ms: 600 },
  { label: 'Prepare the comparison for physician review', detail: 'Copilot SDK, or a clearly labelled deterministic demo' },
];
const coverageNames = [
  'cTNM', 'Morphology', 'Non-metastatic CRC: MSI',
  'WHO performance status', 'Medical history', 'Imaging result (e.g. CT thorax-abdomen)',
];

export default function GuidelinePreparation() {
  const [theme, setTheme] = useState('light');
  const [horizon, setHorizon] = useState<'future' | 'six-months'>('future');
  const [step, setStep] = useState(0);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [extraction, setExtraction] = useState<RecordData | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [extracted, setExtracted] = useState(false);
  const [result, setResult] = useState<Preparation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    request<RecordData>('/api/ideas/80/record').then(setRecord).catch(() => setError('The synthetic record could not be loaded. Check that the API is running, then reload.'));
    request<Dataset>('/api/sample-data/minimal-mdt-dataset.json').then(setDataset).catch(() => setDataset(null));
  }, []);

  function reset(next: 'future' | 'six-months') {
    setHorizon(next); setFields({}); setExtracted(false); setExtraction(null); setResult(null);
    setSummary(''); setConfirmed(false); setStep(1); setError('');
  }

  async function prepare(reviewed: boolean) {
    setBusy(true); setError('');
    try {
      const response = await request<Preparation>('/api/ideas/80/prepare', {
        method: 'POST', body: JSON.stringify({ horizon, reviewed, fields: reviewed ? fields : {} }),
      });
      if (!reviewed) {
        setExtraction(response.record);
        setFields(Object.fromEntries(response.record.fields.map(f => [f.key, f.value])));
        setExtracted(true);
      } else {
        setResult(response); setStep(2); setConfirmed(false);
        setSummary([
          `${record?.name} · Primary colon cancer treatment · ${horizon === 'future' ? 'Full-record demo' : 'Minimal-dataset demo'}`,
          ...response.record.fields.map(f => `${f.label}: ${f.value}`),
          '', 'Guideline discussion (fictional excerpts, not clinical advice):',
          ...response.recommendations.map(r => `${r.guideline}: ${r.option}`),
          '', 'Open questions:', ...response.missing.map(m => `${m.label}: ${m.status}. ${m.branches.join(' / ')}`),
          '', 'Patient fit:', ...response.conflicts.map(c => `${c.option}: ${c.reason}`),
          '', 'Final treatment decision remains with the MDT. No orders or chart write-back.',
        ].join('\n'));
      }
    } catch {
      setError('Preparation could not be completed. Your edits are preserved; try again.');
    } finally { setBusy(false); }
  }

  function go(next: number) {
    if (busy) return;
    if (next >= 2 && !result) {
      setStep(1); setError('First prepare, review the extracted facts, then approve them for comparison.'); return;
    }
    setError(''); setStep(next);
  }
  const reviewedFields = result?.record.fields ?? record?.fields ?? [];
  const allergy = horizon === 'six-months' ? 'Not available in minimal dataset' : fields.allergy || record?.fields.find(f => f.key === 'allergy')?.value || 'Not yet reviewed';

  return (
    <div className="issue80" data-theme={theme}>
      <a className="i80-skip" href="#i80-task">Skip to current task</a>
      <div className="i80-disclaimer">Hackathon prototype – synthetic data – not for clinical use · Guideline excerpts are fictional, not verified guidance.</div>
      <HospitalShell module="Colon cancer · MDT preparation"
        patient={record ? { id: record.id, name: record.name, age: record.age, sex: record.sex, diagnosis: record.diagnosis, allergies: allergy, ward: 'Colorectal MDT' } : null}
        nav={steps.map(s => ({ id: s.id, label: s.title }))}
        active={String(step)} onNav={id => go(Number(id))}
        toolbar={<>
          <span className="i80-eyebrow">Primary treatment only</span>
          <span className="hx-spacer" />
          <div className="i80-switch" aria-label="Data horizon">
            <button className="hx-btn" aria-pressed={horizon === 'six-months'} disabled={busy} onClick={() => reset('six-months')}>In six months</button>
            <button className="hx-btn" aria-pressed={horizon === 'future'} disabled={busy} onClick={() => reset('future')}>The future</button>
          </div>
          <div className="i80-switch" aria-label="Theme">
            {['light', 'dark'].map(t => <button className="hx-btn" key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === 'light' ? 'Light' : 'Dark'}</button>)}
          </div>
        </>}>
        <section id="i80-task" className="i80-guide" aria-label="Guided demo">
          <span className="i80-eyebrow">Step {step + 1} of 6 · Physician-led preparation</span>
          <h1>{steps[step].title}</h1><p>{steps[step].explain}</p>
          <div className="i80-actions">
            {step > 0 && <button className="hx-btn" disabled={busy} onClick={() => go(step - 1)}>← Back</button>}
            {step === 0 && <button className="hx-btn primary" disabled={!record} onClick={() => go(1)}>Open selected patient →</button>}
            {step >= 2 && step < 5 && <button className="hx-btn primary" onClick={() => go(step + 1)}>{steps[step + 1].title} →</button>}
          </div>
        </section>
        {error && <p className="i80-alert" role="alert">{error}</p>}
        {!record && !error && <Working label="Loading synthetic patient record" />}
        {step === 0 && record && <Panel title="Next tumour board · 9 October · Synthetic worklist">
          <table className="hx-table"><caption>Primary colon cancer cases · select the highlighted case</caption>
            <thead><tr><th>Time</th><th>Patient</th><th>Question</th><th>Preparation</th></tr></thead>
            <tbody><tr className="selected"><td>09:00</td><td><button className="hx-btn" onClick={() => go(1)}>{record.name} · {record.id}</button></td><td>Primary treatment · CT and MMR pending</td><td><Pill tone="warn">Needs preparation</Pill></td></tr>
              <tr><td>09:15</td><td>Demo patient B</td><td>Postoperative pathology review</td><td>Prepared · context only</td></tr>
              <tr><td>09:30</td><td>Demo patient C</td><td>Staging discussion</td><td>Awaiting imaging · context only</td></tr>
              <tr><td>09:45</td><td>Demo patient D</td><td>Fitness for surgery</td><td>Anaesthetic review · context only</td></tr>
            </tbody></table>
        </Panel>}
        {step === 1 && record && <>
          <Panel title={extracted ? 'Extracted facts · review and correct' : 'Patient record ready for preparation'} actions={<Pill>{extracted ? 'Human review required' : '3 synthetic source formats'}</Pill>}>
            {!extracted ? <><p>Read the record to find the facts that distinguish treatment options. Nothing is evaluated until you review them.</p>
              <button className="hx-btn primary" disabled={busy} onClick={() => prepare(false)}>{busy ? <><span className="hx-spinner" /> Reading record…</> : 'Prepare guideline recommendations'}</button>
            </> : <>
              <div className="i80-fields">{record.fields.map(f => {
                const unavailable = horizon === 'six-months' && !f.minimal;
                return <label key={f.key} className={unavailable ? 'i80-unavailable' : ''}>
                  <strong>{f.label}</strong><input value={fields[f.key] ?? ''} disabled={busy || unavailable}
                    onChange={e => { setFields({ ...fields, [f.key]: e.target.value }); setResult(null); setConfirmed(false); }} />
                  <small>{unavailable ? 'Unavailable in six months — needs full-record access' : f.source}</small>
                </label>;
              })}</div>
              <p>Blank or pending results remain unknown. Correct values only from a reviewed source.</p>
              <button className="hx-btn primary" disabled={busy} onClick={() => prepare(true)}>{busy ? <><span className="hx-spinner" /> Comparing recommendations…</> : 'Approve reviewed facts & compare guidelines'}</button>
            </>}
          </Panel>
          <Panel title="Inspect original synthetic sources">
            {(extraction?.documents ?? (horizon === 'future' ? record.documents : [])).map(d => <details key={d.name}><summary>{d.name} · {d.format}</summary><pre>{d.body}</pre></details>)}
            {horizon === 'six-months' && !extracted && <p>Prepare the minimal extract to inspect available sources. Full-record notes are unavailable in this horizon.</p>}
            <p className="i80-muted">Format adapters are demonstrated with synthetic source fixtures; arbitrary file uploads are not part of this prototype.</p>
          </Panel>
        </>}
        {busy && <Backstage key={extracted ? 'comparison' : 'extraction'} stages={stages} running holdLast release={false} note="Illustrative process stages; the API uses the Copilot SDK when configured." />}
        {result && step === 2 && <>
          <div className="i80-alert">Fictional Dutch, Italian and NCCN-style excerpts for demonstrating the workflow. Full texts, source versions and the attached PDF have not been verified or ingested.</div>
          <Panel title="Agreement and differences · illustrative comparison">
            <p><strong>Shared condition:</strong> establish stage and review patient fitness before selecting a primary treatment pathway. Pending CT or MMR cannot be treated as a negative result.</p>
            <p><strong>Illustrative differences:</strong> the excerpts below show alternative discussion branches and safety conditions. They do not establish real disagreement between the Dutch, Italian or NCCN guidelines.</p>
          </Panel>
          <div className="i80-comparison">{['Dutch', 'Italian', 'NCCN'].map(name => <section key={name} aria-label={`${name} synthetic excerpts`}>
            <h2>{name} · fictional excerpts</h2>
            {result.recommendations.filter(r => r.guideline.startsWith(name)).map((r, i) => <Panel key={`${r.source}-${i}`} title={r.guideline} actions={<Pill tone={r.status.startsWith('Conflict') ? 'crit' : 'warn'}>{r.status}</Pill>}>
              <h2>{r.option}</h2>
              <details open><summary>Passage behind this option</summary><blockquote>{r.passage}</blockquote><small>{r.source}</small></details>
              <h3>Exact patient data used</h3><ul>{r.used.map((f, j) => <li key={j}>{f}</li>)}</ul>
            </Panel>)}
            {!result.recommendations.some(r => r.guideline.startsWith(name)) && <Panel title="No matching excerpt"><p>No excerpt in this small synthetic collection matches the reviewed branch. This does not mean that the real guideline has no recommendation.</p></Panel>}
          </section>)}</div>
          <Panel title="Assistant's evidence-grounded draft" actions={<Pill tone={result.agent.mode === 'copilot' ? 'ok' : 'neutral'}>{result.agent.mode === 'copilot' ? 'Live Copilot SDK' : 'Deterministic demo'}</Pill>}>
            {result.agent.note && <p>{result.agent.note}</p>}
            <p className="i80-muted">The structured comparison above is the reproducible demo rule match. The assistant explains it below.</p>
            {result.agent.blocks.map((block, i) => <RenderBlock key={i} block={block} />)}
            <details><summary>Assistant tool activity</summary><ul>{result.agent.trace.map((t, i) => <li key={i}>{t.tool}</li>)}</ul></details>
          </Panel>
        </>}
        {result && step === 3 && <Panel title="Missing data · options remain conditional">
          {result.missing.length ? result.missing.map(m => <div className="i80-missing" key={m.label}><h2>{m.label} <Pill tone="warn">{m.status}</Pill></h2><small>{m.source}</small><ul>{m.branches.map(b => <li key={b}>{b}</li>)}</ul></div>) : <p>No unresolved discriminator in the reviewed demo facts. The MDT still verifies the record.</p>}
          <details><summary>Inspect all reviewed facts</summary><dl className="hx-facts">{reviewedFields.map(f => <div key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{f.value} · {f.source}</dd></div>)}</dl></details>
        </Panel>}
        {result && step === 4 && <Panel title="Allergies, wishes and values · patient fit">
          {horizon === 'six-months' && <p className="i80-alert">Allergy and wishes checks are unavailable with this minimal dataset. Not recorded does not mean no allergy or no preference. Ask the patient and review the full chart before treatment.</p>}
          {result.conflicts.map((c, i) => <div className="i80-missing" key={i}><Pill tone="crit">Requires physician review</Pill><h2>{c.option}</h2><p>{c.reason}</p></div>)}
          {!result.conflicts.length && <p>No conflict identified in available demo facts; this is not treatment clearance.</p>}
          <button className="hx-btn primary" onClick={() => go(5)}>Reviewed patient fit · draft MDT summary →</button>
        </Panel>}
        {result && step === 5 && <Panel title={confirmed ? 'Ready for the synthetic MDT' : 'Review the MDT preparation summary'} actions={confirmed && <Pill tone="ok">Physician confirmed · local demo only</Pill>}>
          <label className="i80-summary">Editable preparation note<textarea rows={15} value={summary} disabled={confirmed} onChange={e => setSummary(e.target.value)} /></label>
          <div className="i80-actions"><button className="hx-btn primary" disabled={confirmed || !summary.trim()} onClick={() => setConfirmed(true)}>Confirm summary for MDT</button>
            {confirmed && <button className="hx-btn" onClick={() => setConfirmed(false)}>Reopen for adjustment</button>}
            <button className="hx-btn" onClick={() => { setFields({}); setExtracted(false); setResult(null); setConfirmed(false); setStep(0); }}>Restart walkthrough</button></div>
          <p aria-live="polite">{confirmed ? 'Summary confirmed for discussion. No treatment decision, prescription or hospital write-back has been performed.' : 'You remain responsible for the recommendation. Confirmation changes only this demo screen.'}</p>
        </Panel>}
        {horizon === 'six-months' && <Panel title="What this needs from the minimal dataset">
          <p>6 of 8 decision fields map to the working list: 4 are report text, 1 structured, and 1 usually a clinic note. Report-text fields still need structuring; clinic-note fields may be missing. Allergy and wishes checks need the future full record. Source availability is a hackathon assumption, not a measured hospital readiness score.</p>
          {dataset ? <table className="hx-table"><caption>Relevant elements from the UMC Utrecht working list</caption><thead><tr><th>Element</th><th>Likely source</th><th>Availability</th></tr></thead><tbody>
            {dataset.groups.flatMap(g => g.elements).filter(e => coverageNames.includes(e.name)).map(e => <tr key={e.name}><td>{e.name}</td><td>{e.likely_source}</td><td>{e.likely_source === 'structured' || e.likely_source === 'derived' ? '✓ Mappable' : e.likely_source === 'patient / clinic note' ? '✕ Often missing' : '◐ Expect gaps'}</td></tr>)}
            <tr><td>Allergies; treatment wishes / values</td><td>Full record / patient conversation</td><td>✕ Outside this working list</td></tr>
          </tbody></table> : <p>Coverage file unavailable; reload to inspect its element names.</p>}
          <h3>What each hospital must do</h3><ul><li>Map patient identifiers and coded morphology to an agreed format.</li><li>Structure staging, pathology, MMR and imaging reports, including pending-result dates.</li><li>Record performance status and the MDT question in a fixed form; have the physician verify missing facts and patient preferences.</li><li>Agree and license the guideline versions before real clinical use. No automated chart write-back in six months.</li></ul>
        </Panel>}
      </HospitalShell>
    </div>
  );
}
