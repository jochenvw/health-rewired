import { useState, type ReactNode } from 'react';
import type { AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Panel, Pill } from '../../hospital/HospitalShell';

export const dimensions = [
  { key: 'survival', label: 'Living longer', measure: 'Alive at five years · fictional people / 100', higherBetter: true },
  { key: 'quality', label: 'Quality of life', measure: 'Quality of life · fictional score / 100', higherBetter: true },
  { key: 'mobility', label: 'Preserving mobility', measure: 'Independent mobility · fictional people / 100', higherBetter: true },
  { key: 'limitations', label: 'Avoiding daily limitations', measure: 'Daily limitation burden · fictional score / 100', higherBetter: false },
  { key: 'costs', label: 'Reducing costs', measure: 'Relative cost burden · fictional score / 100, not euros', higherBetter: false },
] as const;
type Dimension = typeof dimensions[number]['key'];
export type Priorities = Record<Dimension, number>;
export const initialPriorities = (): Priorities => ({ survival: 5, quality: 5, mobility: 5, limitations: 5, costs: 5 });
type Finding = { label: string; detail: string };
type Option = {
  id: string;
  title: string;
  condition: string;
  plain_language: string;
  metrics: Record<Dimension, number>;
  neuropathy: number;
  trajectory: { week: number; fatigue: number; visits: number; recovery: string }[];
  reasoning: string;
};
export type Discussion = {
  limitation: string;
  eligibility: string;
  context: Finding[];
  options: Option[];
  glossary: { term: string; meaning: string; timeline: string; reference: string }[];
  evidence: Finding[];
  agent: AgentResult;
};

function preferenceFit(option: Option, priorities: Priorities) {
  const total = dimensions.reduce((sum, dimension) => sum + priorities[dimension.key], 0);
  if (!total) return null;
  return Math.round(dimensions.reduce((sum, dimension) => sum + priorities[dimension.key] *
    (dimension.higherBetter ? option.metrics[dimension.key] : 100 - option.metrics[dimension.key]), 0) / total);
}

export default function PatientDiscussion({
  data, priorities, onPriorities, preference, onPreference, discussionNote, onNote, onConfirm, references,
}: {
  data: Discussion;
  priorities: Priorities;
  onPriorities: (priorities: Priorities) => void;
  preference: string;
  onPreference: (preference: string) => void;
  discussionNote: string;
  onNote: (note: string) => void;
  onConfirm: () => void;
  references: { source: string; reference: string }[];
}) {
  const [visible, setVisible] = useState<Dimension[]>(dimensions.map((dimension) => dimension.key));
  const [trajectoryMetric, setTrajectoryMetric] = useState<'fatigue' | 'visits'>('fatigue');
  const [term, setTerm] = useState<string | null>(null);
  const highest = Math.max(...Object.values(priorities));
  const total = Object.values(priorities).reduce((sum, value) => sum + value, 0);
  const glossary = data.glossary.find((entry) => entry.term === term);

  return <>
    <div className="c81-heading"><div><span className="c81-eyebrow">SHARED DECISION DISCUSSION · NOT A TREATMENT ORDER</span>
      <h1>What matters most to Elena?</h1><p>Discuss the options together. Move the sliders to explore trade-offs, not to let the system choose treatment.</p>
    </div><Pill tone="warn">Synthetic visual aid</Pill></div>
    <div className="c81-attention"><strong>No validated personal risk estimates.</strong> {data.limitation}<p>{data.eligibility}</p></div>
    <Panel title="The patient context used here">
      <dl className="c81-facts">{data.context.filter((item) => ['Age', 'Genetics / tumour MMR', 'Comorbidities', 'ECOG', 'CEA'].includes(item.label)).map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.detail}</dd></div>)}</dl>
      <details><summary>Full context, sources and simulation recipe</summary>{data.context.map((item) => <p key={item.label}><strong>{item.label}: </strong>{item.detail}</p>)}</details>
      <Evidence data={data} references={references} label="Context: reasoning, missing inputs and references" />
    </Panel>
    <div className="c81-two">
      <Panel title="Patient priorities · change in real time">
        <p>0 = not a priority today · 10 = very important. These sliders change emphasis and preference-fit scores, never the underlying outcome numbers.</p>
        <div className="c81-sliders">{dimensions.map((dimension) => <div key={dimension.key}>
          <label htmlFor={`c81-priority-${dimension.key}`}>{dimension.label} <output htmlFor={`c81-priority-${dimension.key}`}>{priorities[dimension.key]} / 10</output></label>
          <input id={`c81-priority-${dimension.key}`} type="range" min={0} max={10} step={1} value={priorities[dimension.key]}
            onChange={(event) => onPriorities({ ...priorities, [dimension.key]: Number(event.target.value) })} />
        </div>)}</div>
        <p aria-live="polite">{total ? `Most important: ${dimensions.filter((dimension) => priorities[dimension.key] === highest).map((dimension) => dimension.label).join(', ')}.` : 'No priorities selected. Preference-fit scores are not calculated.'}</p>
        <button className="hx-btn" onClick={() => onPriorities(initialPriorities())}>Reset to equal priorities</button>
        <Evidence data={data} references={references} label="Priorities: reasoning and references">
          <p>Preference fit = weighted average of the five fictional metric scores. Costs and limitations are reversed (100 − burden). All-zero weights produce no score. This is a demonstration of values, not a clinical prediction, eligibility check or recommendation.</p>
        </Evidence>
      </Panel>
      <Panel title="Plain-language help · click a term">
        <div className="c81-actions c81-term-buttons">{data.glossary.map((entry) => <button className="hx-btn" key={entry.term} aria-pressed={term === entry.term} onClick={() => setTerm(term === entry.term ? null : entry.term)}>{entry.term}</button>)}</div>
        {glossary ? <div className="c81-term-explanation" role="region" aria-label={`${glossary.term} explained`}>
          <h2>{glossary.term}</h2><p>{glossary.meaning}</p>
          <p className="c81-mini-timeline">{glossary.timeline}</p>
          <details><summary>Term: reasoning and reference</summary><p>Author-written simplification for the demo; ask the clinician to verify its applicability.</p><a href={glossary.reference} target="_blank" rel="noreferrer">Open reference ↗</a></details>
          <button className="hx-btn" onClick={() => setTerm(null)}>Close explanation</button>
        </div> : <p>Open “resection” or “adjuvant therapy” to see an everyday explanation and where it fits in the treatment journey.</p>}
        <details className="c81-agent"><summary>Assistant explanation · {data.agent.mode === 'copilot' ? 'Copilot SDK' : 'deterministic demo'}</summary>
          {data.agent.note && <p>{data.agent.note}</p>}
          {data.agent.blocks.map((block, index) => <RenderBlock key={index} block={block} />)}
        </details>
        <Evidence data={data} references={references} label="Plain-language help: reasoning and references" />
      </Panel>
    </div>
    {data.options.length > 0 ? <>
      <Panel title="Visual risk / benefit option grid · fictional numbers">
        <fieldset className="c81-filters"><legend>Show or hide outcomes · visibility only, weights are unchanged</legend>
          {dimensions.map((dimension) => <label key={dimension.key}><input type="checkbox" checked={visible.includes(dimension.key)}
            onChange={(event) => setVisible(event.target.checked ? [...visible, dimension.key] : visible.filter((key) => key !== dimension.key))} /> {dimension.label}</label>)}
        </fieldset>
        <div className="c81-table-wrap"><table className="hx-table c81-option-grid">
          <caption>Hypothetical localized-cancer scenarios, not confirmed eligible treatments. Green = more benefit / less burden; amber or red = higher burden. Colour never establishes suitability.</caption>
          <thead><tr><th scope="col">Outcome / question</th>{data.options.map((option) => <th scope="col" key={option.id}>{option.title}</th>)}</tr></thead>
          <tbody>
            <tr><th scope="row">What this involves</th>{data.options.map((option) => <td key={option.id}><p>{option.plain_language}</p><Pill tone="warn">{option.condition}</Pill><details><summary>Option: reasoning and evidence</summary><p>{option.reasoning}</p><Evidence data={data} references={references} label="Inspect references and limitations" /></details></td>)}</tr>
            {dimensions.filter((dimension) => visible.includes(dimension.key)).map((dimension) => <tr className={total && priorities[dimension.key] === highest ? 'c81-priority-row' : undefined} key={dimension.key}>
              <th scope="row">{dimension.label}<br /><small>{dimension.measure}</small><br /><span className="c81-muted">Importance: {priorities[dimension.key]} / 10</span></th>
              {data.options.map((option) => {
                const value = option.metrics[dimension.key];
                const benefit = dimension.higherBetter ? value : 100 - value;
                return <td key={option.id} className={`c81-heat-${benefit >= 70 ? 'benefit' : benefit >= 40 ? 'caution' : 'burden'}`}>
                  <strong>{value} / 100 · fictional</strong>
                  <div className="c81-probability-bar" role="img" aria-label={`${option.title}: ${dimension.measure}, ${value} out of 100, fictional`}><span style={{ width: `${value}%` }} /></div>
                  <details><summary>Outcome: reasoning and reference</summary><p>{option.reasoning}</p><p>{dimension.measure}. This number is not a calibrated patient probability; slider movement cannot change it.</p><Evidence data={data} references={references} label="See evidence limitations" /></details>
                </td>;
              })}
            </tr>)}
            <tr><th scope="row">Lasting nerve symptoms<br /><small>Fictional people / 100 · lower is better</small></th>{data.options.map((option) => <td className={option.neuropathy >= 25 ? 'c81-heat-burden' : 'c81-heat-caution'} key={option.id}><strong>{option.neuropathy} / 100 · fictional</strong><p>Tingling or numbness can matter when preserving mobility is a priority.</p><details><summary>Side effect: reasoning and reference</summary><p>{option.reasoning} These are arbitrary visual-aid values, not measured side-effect rates.</p><Evidence data={data} references={references} label="See evidence limitations" /></details></td>)}</tr>
            <tr><th scope="row">Preference fit<br /><small>Weighted demo score, not a probability</small></th>{data.options.map((option) => <td key={option.id}><output aria-live="polite" aria-label={`${option.title} preference fit`}>{preferenceFit(option, priorities) === null ? 'No priorities set' : `${preferenceFit(option, priorities)} / 100`}</output><p>No automatic choice is made.</p></td>)}</tr>
          </tbody>
        </table></div>
        <Evidence data={data} references={references} label="Option grid: reasoning, numerical assumptions and references" />
      </Panel>
      <Panel title="Week-by-week journey · illustrative, not a forecast">
        <div className="c81-actions c81-term-buttons" role="group" aria-label="Trajectory measure">
          <button className="hx-btn" aria-pressed={trajectoryMetric === 'fatigue'} onClick={() => setTrajectoryMetric('fatigue')}>Fatigue</button>
          <button className="hx-btn" aria-pressed={trajectoryMetric === 'visits'} onClick={() => setTrajectoryMetric('visits')}>Hospital visits</button>
        </div>
        <Trajectory options={data.options} metric={trajectoryMetric} />
        <div className="c81-table-wrap"><table className="hx-table"><caption>Illustrative recovery milestones; visits are counts per week, not hospital-stay duration.</caption><thead><tr><th>Week</th>{data.options.map((option) => <th key={option.id}>{option.title}</th>)}</tr></thead>
          <tbody>{data.options[0].trajectory.map((point) => <tr key={point.week}><th scope="row">{point.week}</th>{data.options.map((option) => {
            const value = option.trajectory.find((entry) => entry.week === point.week);
            return <td key={option.id}>{value ? <>Fatigue {value.fatigue}/100 · visits {value.visits}<br />{value.recovery}</> : 'Not supplied'}</td>;
          })}</tr>)}</tbody>
        </table></div>
        <Evidence data={data} references={references} label="Trajectory: reasoning, context adjustment and references" />
      </Panel>
    </> : <Panel title="No applicable option grid for this case"><p>{data.eligibility}</p><p>Record the patient's priorities and questions for specialist MDT review. Do not reuse a localized-cancer comparison for metastatic disease.</p><Evidence data={data} references={references} label="Applicability: reasoning and references" /></Panel>}
    <Panel title="Record the discussion · patient and clinician decide">
      <label htmlFor="c81-preference">Provisional preference for discussion, not a treatment selection</label>
      <select id="c81-preference" value={preference} onChange={(event) => onPreference(event.target.value)}>
        <option value="">No preference yet · keep the question open</option>
        {data.options.map((option) => <option key={option.id} value={option.id}>{option.title} · conditional discussion only</option>)}
      </select>
      <label htmlFor="c81-discussion-note">What did the patient say? What must the MDT clarify?</label>
      <textarea id="c81-discussion-note" rows={3} value={discussionNote} onChange={(event) => onNote(event.target.value)} placeholder="For example: staying independent matters most; discuss whether the benefit justifies lasting nerve symptoms." />
      <p>The sliders are conversation inputs, not consent. Confirm only after reviewing this visual aid together. An undecided preference is valid.</p>
      <button className="hx-btn primary" onClick={onConfirm}>Confirm patient discussion & review MDT summary</button>
    </Panel>
  </>;
}

function Evidence({ data, references, label, children }: { data: Discussion; references: { source: string; reference: string }[]; label: string; children?: ReactNode }) {
  return <details className="c81-evidence"><summary>{label}</summary>{children}
    {data.evidence.map((entry) => <p key={entry.label}><strong>{entry.label}: </strong>{entry.detail}</p>)}
    <ul>{references.map((reference) => <li key={reference.source}><a href={reference.reference} target="_blank" rel="noreferrer">{reference.source} ↗</a> — reference only; does not substantiate demo numbers.</li>)}</ul>
  </details>;
}

function Trajectory({ options, metric }: { options: Option[]; metric: 'fatigue' | 'visits' }) {
  const points = options.flatMap((option) => option.trajectory);
  const weeks = points.map((point) => point.week);
  const minimum = Math.min(...weeks);
  const span = Math.max(1, Math.max(...weeks) - minimum);
  const max = metric === 'fatigue' ? 100 : Math.max(1, ...points.map((point) => point.visits));
  const x = (week: number) => 48 + (week - minimum) / span * 500;
  const y = (value: number) => 180 - value / max * 140;
  return <div className="c81-trajectory">
    <svg viewBox="0 0 600 220" role="img" aria-label={`Illustrative ${metric} comparison by week; exact values are in the table below`}>
      <title>Fictional week-by-week {metric} · not a personal prognosis</title>
      <line x1="48" y1="40" x2="48" y2="180" className="c81-axis" /><line x1="48" y1="180" x2="548" y2="180" className="c81-axis" />
      <text x="8" y="44">{max}</text><text x="28" y="184">0</text>
      {[...new Set(weeks)].map((week) => <text key={week} x={x(week)} y="204" textAnchor="middle">W{week}</text>)}
      {options.map((option, index) => <g key={option.id} className={`c81-line-${index % 2}`}>
        <polyline fill="none" strokeWidth="3" strokeDasharray={index % 2 ? '6 4' : undefined} points={option.trajectory.map((point) => `${x(point.week)},${y(point[metric])}`).join(' ')} />
        {option.trajectory.map((point) => <circle key={point.week} cx={x(point.week)} cy={y(point[metric])} r="4"><title>{option.title}, week {point.week}: {point[metric]}</title></circle>)}
      </g>)}
    </svg>
    <p className="c81-muted">{metric === 'fatigue' ? 'Fatigue score 0–100 · higher means more tired' : 'Hospital visits per week'} · all values fictional</p>
    <div className="c81-legend">{options.map((option, index) => <span key={option.id} className={`c81-line-${index % 2}`}>{index % 2 ? '┄' : '━'} {option.title}</span>)}</div>
  </div>;
}
