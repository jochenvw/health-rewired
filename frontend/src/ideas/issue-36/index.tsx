import { FormEvent, useState } from 'react';
import { api, type AgentResult, type BiopsyResult, type Priority, type TreatmentPath, type TwinSimulation, type WhatIf } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './twin.css';

export const meta: IdeaMeta = {
  id: '36',
  issue: 36,
  title: 'Compare next treatment paths after progression',
  tagline: 'For an oncologist and patient deciding what comes next when a scan shows progression, with the evidence side by side.',
};

// Fake clinic context so the worklist feels like a real day; only Maria (P-004) opens the twin.
const clinicSlots = [
  { time: '08:30', id: 'X-501', name: 'Wolfgang Seidel', dx: 'Prostate ca. cT2N0', type: 'Follow-up', room: 'Room 1', status: 'Waiting' },
  { time: '09:00', id: 'P-004', name: 'Maria López', dx: 'NSCLC, EGFR exon 19del · progression', type: 'Treatment decision', room: 'Room 2', status: 'Progression' },
  { time: '09:45', id: 'X-512', name: 'Elif Aydın', dx: 'CLL Binet A', type: 'Routine review', room: 'Room 1', status: 'Scheduled' },
  { time: '10:30', id: 'P-002', type: 'Tumour board preparation', room: 'MDT', status: 'Scheduled' },
  { time: '11:15', id: 'X-528', name: 'Hans Bruckner', dx: 'Bladder ca. pT1', type: 'Cystoscopy follow-up', room: 'Room 3', status: 'Scheduled' },
];

type Section = 'worklist' | 'twin' | 'compare';

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'Morning worklist',
    explain: 'A new scan flagged Maria López with disease progression. Click her row to open her digital twin.',
  },
  {
    id: 'twin',
    title: 'Review the twin',
    explain: 'Her case as gathered so far - diagnosis, the resistance question, and the new scan. Then compare what could come next.',
  },
  {
    id: 'compare',
    title: 'Compare three paths',
    explain:
      'A shared six-month timeline shows response, progression risk and toxicity diverging by path. Try the what-if inputs, then compare the trade-off.',
  },
  {
    id: 'decide',
    title: 'Decide together',
    explain: 'Nothing is chosen for you. Pick the path you and the patient discussed, and record it for the next visit.',
  },
];

const gatherStages: Stage[] = [
  { label: 'Gathering scans, labs, pathology and molecular results', detail: 'patients/P-004.json', ms: 700 },
  { label: 'Searching for comparable synthetic patients', detail: 'comparable_patients.csv - filtered by cancer type and profile', ms: 800 },
  { label: 'Simulating three treatment paths', detail: 'response, progression risk and toxicity over 6 months', ms: 900 },
  { label: 'Identifying which future test would most reduce uncertainty', detail: 'comparing the assumptions across paths' },
];

const exampleQuestions = [
  'Which comparable patients support the trial path?',
  'What assumptions underlie continuing osimertinib plus SBRT?',
  'Why does the repeat biopsy matter more than a repeat scan?',
];

export default function CancerDigitalTwin() {
  const [section, setSection] = useState<Section>('worklist');
  const [notice, setNotice] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<TwinSimulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [started, setStarted] = useState(false);
  const [runs, setRuns] = useState(0);
  const [chosenPathId, setChosenPathId] = useState<string | null>(null);
  const [testOrdered, setTestOrdered] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');
  const [recorded, setRecorded] = useState(false);

  const openPatient = (id: string) => {
    if (id !== 'P-004') {
      setNotice('This idea is built around Maria López (P-004). Open her row to see the digital twin.');
      return;
    }
    setNotice(null);
    setSection('twin');
  };

  const compare = async () => {
    setRuns((n) => n + 1);
    setSimulation(null);
    setChosenPathId(null);
    setTestOrdered(false);
    setRecorded(false);
    setDecisionNote('');
    setLoading(true);
    setStarted(true);
    setSection('compare');
    try {
      setSimulation(await api.twin('P-004'));
    } catch {
      setNotice('The digital twin could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const updateWhatIf = async (patch: Partial<WhatIf>) => {
    if (!simulation) return;
    const nextWhatIf = { ...simulation.what_if, ...patch };
    setUpdating(true);
    try {
      setSimulation(await api.twin('P-004', nextWhatIf));
    } catch {
      setNotice('The digital twin could not recompute the what-if scenario.');
    } finally {
      setUpdating(false);
    }
  };

  const storyStep = section === 'compare' && recorded ? 'decide' : section;

  return (
    <HospitalShell
      module="Oncology clinic - treatment decision"
      guide={
        <StoryGuide
          steps={story}
          current={storyStep}
          onGo={(id) => {
            if (id === 'decide') {
              if (!simulation) {
                setNotice('Click "Compare next treatment paths" first.');
                return;
              }
              setSection('compare');
              return;
            }
            if (id === 'compare' && !simulation && !loading) {
              compare();
              return;
            }
            setSection(id as Section);
          }}
          nextLabel={section === 'worklist' ? 'Open Maria López' : section === 'twin' ? 'Compare next treatment paths' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: 'Clinic worklist' },
        { id: 'twin', label: 'Digital twin' },
        { id: 'compare', label: 'Compare & decide', badge: simulation ? simulation.paths.length : undefined },
      ]}
      active={section}
      onNav={(id) => {
        if (id === 'twin' || id === 'compare') {
          if (id === 'compare' && !simulation) {
            setSection('twin');
            return;
          }
          setSection(id as Section);
          return;
        }
        setSection(id as Section);
      }}
      patient={
        section === 'worklist'
          ? null
          : {
              id: 'P-004',
              name: 'Maria López',
              age: 61,
              sex: 'female',
              diagnosis: 'NSCLC · EGFR exon 19 deletion · stage IVA · oligoprogression on osimertinib',
            }
      }
      toolbar={
        section === 'twin' ? (
          <>
            <span className="hx-spacer" />
            <button type="button" className="hx-btn primary" onClick={compare}>
              Compare next treatment paths
            </button>
          </>
        ) : undefined
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}

      {section === 'worklist' && (
        <Panel title={`Clinic worklist · Medical Oncology · ${new Date().toLocaleDateString('de-DE')}`}>
          <table className="hx-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Time</th>
                <th>Patient</th>
                <th>Diagnosis</th>
                <th>Visit</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clinicSlots.map((s) => (
                <tr key={s.id} className={s.id === 'P-004' ? 'clickable' : undefined} onClick={() => openPatient(s.id)}>
                  <td>{s.time}</td>
                  <td>
                    <strong>{s.name ?? s.id}</strong>
                  </td>
                  <td>{s.dx ?? ''}</td>
                  <td>{s.type}</td>
                  <td>{s.room}</td>
                  <td>
                    <Pill tone={s.status === 'Progression' ? 'crit' : s.status === 'Waiting' ? 'warn' : 'neutral'}>{s.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {section === 'twin' && <TwinOverview />}

      {section === 'compare' && (
        <CompareAndDecide
          key={runs}
          loading={loading}
          updating={updating}
          started={started}
          simulation={simulation}
          onWhatIfChange={updateWhatIf}
          chosenPathId={chosenPathId}
          onChoose={setChosenPathId}
          testOrdered={testOrdered}
          onOrderTest={() => setTestOrdered(true)}
          decisionNote={decisionNote}
          onNoteChange={setDecisionNote}
          recorded={recorded}
          onRecord={() => setRecorded(true)}
        />
      )}
    </HospitalShell>
  );
}

function TwinOverview() {
  return (
    <div className="hx-grid">
      <Panel title="New scan - restaging CT (2026-02-20)">
        <dl className="hx-facts">
          <dt>Finding</dt>
          <dd>Growth of the right lower lobe mass + new 1.1 cm liver lesion</dd>
          <dt>Read as</dt>
          <dd>
            <Pill tone="crit">Oligoprogression</Pill> on first-line osimertinib (month 9)
          </dd>
          <dt>Prior response</dt>
          <dd>Partial response at 3 months, stable at 6 months</dd>
        </dl>
      </Panel>
      <Panel title="Molecular results">
        <dl className="hx-facts">
          <dt>EGFR</dt>
          <dd>Exon 19 deletion (positive, at diagnosis)</dd>
          <dt>ctDNA T790M (latest)</dt>
          <dd>Not detected</dd>
          <dt>Resistance mechanism</dt>
          <dd>
            <Pill tone="warn">Unknown - repeat biopsy not yet done</Pill>
          </dd>
        </dl>
      </Panel>
      <Panel title="What makes this case uncertain">
        <p>
          Maria has chronic kidney disease (eGFR 48), which raises the toxicity of standard chemotherapy. The scan shows only
          two growing sites, but nobody has confirmed the resistance mechanism, so it is unclear whether continuing osimertinib
          with local therapy, switching chemotherapy, or a molecular-matched trial fits best.
        </p>
        <p>
          Click <strong>Compare next treatment paths</strong> above to let the assistant gather this record, find comparable
          synthetic patients, and simulate three options.
        </p>
      </Panel>
    </div>
  );
}

const PATH_COLORS = ['#1f5c99', '#b26a00', '#6a3fb2'];

function pathColor(index: number): string {
  return PATH_COLORS[index % PATH_COLORS.length];
}

function toxicityTone(grade: number): 'crit' | 'warn' | 'ok' {
  return grade >= 3 ? 'crit' : grade >= 2 ? 'warn' : 'ok';
}

const CHART = { width: 460, height: 130, left: 34, right: 10, top: 10, bottom: 20, maxMonth: 6 };

function chartX(month: number): number {
  const plotW = CHART.width - CHART.left - CHART.right;
  return CHART.left + (month / CHART.maxMonth) * plotW;
}

function chartY(value: number): number {
  const plotH = CHART.height - CHART.top - CHART.bottom;
  return CHART.top + (1 - value / 100) * plotH;
}

/** Shared six-month timeline: every path is plotted on the same axes so divergence is visible at a glance. */
function TwinTimeline({ paths }: { paths: TreatmentPath[] }) {
  const months = [0, 1, 3, 6];
  return (
    <div className="twin-timeline">
      <TimelineChart title="Simulated response (%)" paths={paths} field="response_pct" />
      <TimelineChart title="Progression risk (%)" paths={paths} field="progression_risk_pct" />
      <div className="twin-legend">
        {paths.map((path, i) => (
          <span key={path.id} style={{ color: pathColor(i) }}>
            {path.name}
          </span>
        ))}
      </div>
      <div className="twin-toxicity-ladder">
        <span className="twin-ladder-label">Simulated toxicity grade</span>
        <div className="twin-ladder-rows">
          {paths.map((path, i) => (
            <div className="twin-ladder-row" key={path.id}>
              <span className="twin-ladder-swatch" style={{ background: pathColor(i) }} />
              {months.map((month) => {
                const point = path.trajectory.find((p) => p.month === month);
                const grade = point?.toxicity_grade ?? 0;
                return (
                  <span key={month} className={`twin-ladder-cell tone-${toxicityTone(grade)}`} title={`Month ${month}: grade ${grade}`}>
                    {grade}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="twin-ladder-axis">
          {months.map((m) => (
            <span key={m}>M{m}</span>
          ))}
        </div>
      </div>
      <ul className="twin-annotations" aria-label="What changes the simulation at each point">
        {paths.flatMap((path, i) =>
          path.trajectory
            .filter((point) => point.note)
            .map((point) => (
              <li key={`${path.id}-${point.month}`}>
                <span className="twin-annotation-dot" style={{ background: pathColor(i) }} />
                <strong>M{point.month} · {path.name}:</strong> {point.note}
              </li>
            ))
        )}
      </ul>
    </div>
  );
}

function TimelineChart({
  title,
  paths,
  field,
}: {
  title: string;
  paths: TreatmentPath[];
  field: 'response_pct' | 'progression_risk_pct';
}) {
  const months = [0, 1, 3, 6];
  return (
    <div className="twin-chart">
      <span className="twin-chart-title">{title}</span>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={`${title} over six months, one line per path`}>
        {[0, 25, 50, 75, 100].map((gridValue) => (
          <line
            key={gridValue}
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={chartY(gridValue)}
            y2={chartY(gridValue)}
            className="twin-chart-grid"
          />
        ))}
        {months.map((month) => (
          <text key={month} x={chartX(month)} y={CHART.height - 4} className="twin-chart-axis">
            M{month}
          </text>
        ))}
        {paths.map((path, i) => {
          const points = path.trajectory.map((p) => `${chartX(p.month)},${chartY(p[field])}`).join(' ');
          return (
            <g key={path.id}>
              <polyline points={points} fill="none" stroke={pathColor(i)} strokeWidth={2} />
              {path.trajectory.map((p) => (
                <circle
                  key={p.month}
                  cx={chartX(p.month)}
                  cy={chartY(p[field])}
                  r={p.note ? 5 : 3}
                  fill={pathColor(i)}
                  stroke={p.note_kind === 'evidence' ? 'var(--ok)' : p.note_kind === 'assumption' ? 'var(--warning)' : 'none'}
                  strokeWidth={p.note ? 2 : 0}
                >
                  <title>
                    {path.name} · M{p.month}: {p[field]}%{p.note ? ` — ${p.note}` : ''}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Clinician-controlled what-if inputs: changing either one recomputes every trajectory immediately. */
function WhatIfControls({
  whatIf,
  updating,
  onChange,
}: {
  whatIf: WhatIf;
  updating: boolean;
  onChange: (patch: Partial<WhatIf>) => void;
}) {
  return (
    <div className="twin-whatif">
      <label>
        Repeat-biopsy result
        <select
          value={whatIf.biopsy_result}
          disabled={updating}
          onChange={(e) => onChange({ biopsy_result: e.target.value as BiopsyResult })}
        >
          <option value="unknown">Not yet done</option>
          <option value="met_amplification">MET amplification</option>
          <option value="t790m">T790M</option>
          <option value="no_mechanism_found">No mechanism found</option>
        </select>
      </label>
      <label>
        Priority
        <select value={whatIf.priority} disabled={updating} onChange={(e) => onChange({ priority: e.target.value as Priority })}>
          <option value="balanced">Balanced</option>
          <option value="minimize_toxicity">Minimise toxicity</option>
          <option value="maximize_response">Maximise response</option>
        </select>
      </label>
      {updating && (
        <span className="twin-recalculating">
          <span className="hx-spinner" aria-hidden /> Recalculating…
        </span>
      )}
    </div>
  );
}

/** The consultation payoff: every path's headline trade-offs side by side, feeding the human decision below. */
function TradeoffTable({
  paths,
  chosenPathId,
  onChoose,
}: {
  paths: TreatmentPath[];
  chosenPathId: string | null;
  onChoose: (id: string) => void;
}) {
  return (
    <table className="hx-table twin-tradeoff">
      <thead>
        <tr>
          <th>Path</th>
          <th>Response @6mo</th>
          <th>Progression risk @6mo</th>
          <th>Worst toxicity</th>
          <th>Key assumption</th>
          <th>Discuss with Maria</th>
        </tr>
      </thead>
      <tbody>
        {paths.map((path, i) => {
          const last = path.trajectory[path.trajectory.length - 1];
          const maxToxicity = path.trajectory.length ? Math.max(...path.trajectory.map((p) => p.toxicity_grade)) : 0;
          const chosen = path.id === chosenPathId;
          return (
            <tr key={path.id} className={chosen ? 'chosen' : undefined}>
              <td>
                <span className="twin-ladder-swatch" style={{ background: pathColor(i) }} /> <strong>{path.name}</strong>
                <div className="twin-tradeoff-desc">{path.description}</div>
              </td>
              <td>{last?.response_pct ?? 0}%</td>
              <td>{last?.progression_risk_pct ?? 0}%</td>
              <td>
                <Pill tone={toxicityTone(maxToxicity)}>Grade {maxToxicity}</Pill>
              </td>
              <td>{path.assumptions[0]}</td>
              <td>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="radio" name="chosen-path" checked={chosen} onChange={() => onChoose(path.id)} />
                  Choose
                </label>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CompareAndDecide({
  loading,
  updating,
  started,
  simulation,
  onWhatIfChange,
  chosenPathId,
  onChoose,
  testOrdered,
  onOrderTest,
  decisionNote,
  onNoteChange,
  recorded,
  onRecord,
}: {
  loading: boolean;
  updating: boolean;
  started: boolean;
  simulation: TwinSimulation | null;
  onWhatIfChange: (patch: Partial<WhatIf>) => void;
  chosenPathId: string | null;
  onChoose: (id: string) => void;
  testOrdered: boolean;
  onOrderTest: () => void;
  decisionNote: string;
  onNoteChange: (v: string) => void;
  recorded: boolean;
  onRecord: () => void;
}) {
  const chosen = simulation?.paths.find((p) => p.id === chosenPathId);
  return (
    <>
      {/* Defensive empty state: this section should never render blank, even if it is reached
          without the simulation fetch having started (e.g. a guided-demo jump). */}
      {!started && !simulation && (
        <Panel title="Compare next treatment paths">
          <p className="hx-empty">The comparison has not been built yet.</p>
        </Panel>
      )}
      <Backstage
        title="Behind the scenes - building the digital twin"
        stages={gatherStages}
        running={started}
        holdLast
        release={!loading}
        note="In this prototype the steps are shown for explanation; the numbers are an illustrative simulation, not modelled from real outcome data."
      />
      {simulation && (
        <>
          <Panel title={simulation.headline}>
            <p className="note">{simulation.note}</p>
            <WhatIfControls whatIf={simulation.what_if} updating={updating} onChange={onWhatIfChange} />
            <p className="note">{simulation.what_if_explanation}</p>
            <TwinTimeline paths={simulation.paths} />
          </Panel>
          <Panel title="Side-by-side trade-off for the consultation">
            <TradeoffTable paths={simulation.paths} chosenPathId={chosenPathId} onChoose={onChoose} />
          </Panel>
          <Panel
            title="Which future observation would most reduce uncertainty?"
            actions={
              <button type="button" className="hx-btn" disabled={testOrdered} onClick={onOrderTest}>
                {testOrdered ? 'Ordered ✓' : 'Order this test (demo)'}
              </button>
            }
          >
            <p>
              <strong>{simulation.informative_test}.</strong> {simulation.informative_test_reason}
            </p>
          </Panel>
          <Panel
            title="Decide together"
            actions={
              <button type="button" className="hx-btn primary" disabled={!chosen || recorded} onClick={onRecord}>
                {recorded ? 'Recorded for next visit ✓' : 'Record decision for next visit'}
              </button>
            }
          >
            {!chosen && <span className="hx-empty">Choose one path above after discussing it with Maria.</span>}
            {chosen && !recorded && (
              <>
                <p>
                  Chosen path: <strong>{chosen.name}</strong>
                </p>
                <label>
                  Note for the chart (optional)
                  <textarea
                    value={decisionNote}
                    onChange={(e) => onNoteChange(e.target.value)}
                    rows={2}
                    placeholder="e.g. Maria prefers to avoid further neuropathy risk; discuss trial screening at next visit."
                  />
                </label>
              </>
            )}
            {recorded && chosen && (
              <p>
                <Pill tone="ok">Filed to chart</Pill> {chosen.name} recorded as the agreed next step
                {decisionNote ? ` - "${decisionNote}"` : ''}. This is a human decision; the simulation was evidence for the
                discussion, not an instruction.
              </p>
            )}
          </Panel>
          <TwinAssistant />
        </>
      )}
    </>
  );
}

function TwinAssistant() {
  const [task, setTask] = useState(exampleQuestions[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      setResult(await api.askTwin({ task, patient_id: 'P-004', role: 'Oncologist' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="Ask the assistant about this comparison">
      <form className="agent-form" onSubmit={ask}>
        <label>
          Question
          <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={2} />
        </label>
        <div className="chip-row">
          {exampleQuestions.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setTask(q)}>
              {q}
            </button>
          ))}
        </div>
        <button className="hx-btn primary" type="submit" disabled={loading || task.trim().length < 3}>
          {loading ? (
            <>
              <span className="hx-spinner" aria-hidden /> Assistant is checking the evidence…
            </>
          ) : (
            'Ask assistant'
          )}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="result" aria-live="polite">
          {result.note && <p className="note">{result.note}</p>}
          {result.trace.length > 0 && (
            <ol className="trace" aria-label="What the assistant looked at">
              {result.trace.map((step, index) => (
                <li key={index} title={step.arguments ?? undefined}>
                  {step.tool}
                </li>
              ))}
            </ol>
          )}
          <div className="blocks">
            {result.blocks.map((block, index) => (
              <RenderBlock key={index} block={block} />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
