import { FormEvent, useState } from 'react';
import { api, type AgentResult, type TreatmentPath, type TwinSimulation } from '../../api';
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
    explain: 'Simulated response, progression risk and toxicity for each path, with the evidence and assumptions behind it.',
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
          started={started}
          simulation={simulation}
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

function TrajectoryBars({ path }: { path: TreatmentPath }) {
  return (
    <div>
      <div className="twin-bars">
        {path.trajectory.map((point) => (
          <div className="twin-bar-col" key={point.month}>
            <div className="twin-bar-track">
              <div className="twin-bar" style={{ height: `${Math.max(point.response_pct, 2)}%` }} title={`Response ${point.response_pct}%`} />
              <div
                className="twin-bar risk"
                style={{ height: `${Math.max(point.progression_risk_pct, 2)}%` }}
                title={`Progression risk ${point.progression_risk_pct}%`}
              />
            </div>
            <span>M{point.month}</span>
          </div>
        ))}
      </div>
      <div className="twin-legend">
        <span className="response">Response</span>
        <span className="risk">Progression risk</span>
      </div>
    </div>
  );
}

function PathCard({
  path,
  chosen,
  onChoose,
}: {
  path: TreatmentPath;
  chosen: boolean;
  onChoose: () => void;
}) {
  const maxToxicity = path.trajectory.length ? Math.max(...path.trajectory.map((p) => p.toxicity_grade)) : 0;
  return (
    <div className={`twin-path-card${chosen ? ' chosen' : ''}`}>
      <h4>{path.name}</h4>
      <p>{path.description}</p>
      <TrajectoryBars path={path} />
      <p>
        Worst simulated toxicity: <Pill tone={maxToxicity >= 3 ? 'crit' : maxToxicity >= 2 ? 'warn' : 'ok'}>Grade {maxToxicity}</Pill>
      </p>
      <div>
        <strong>Assumptions</strong>
        <ul className="twin-assumptions">
          {path.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Evidence</strong>
        <ul className="twin-evidence">
          {path.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input type="radio" name="chosen-path" checked={chosen} onChange={onChoose} />
        Choose this path to discuss with Maria
      </label>
    </div>
  );
}

function CompareAndDecide({
  loading,
  started,
  simulation,
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
  started: boolean;
  simulation: TwinSimulation | null;
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
            <div className="twin-paths">
              {simulation.paths.map((path) => (
                <PathCard key={path.id} path={path} chosen={path.id === chosenPathId} onChoose={() => onChoose(path.id)} />
              ))}
            </div>
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
