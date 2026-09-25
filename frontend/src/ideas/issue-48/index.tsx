import { useCallback, useEffect, useState } from 'react';
import type { AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './styles.css';

export const meta: IdeaMeta = {
  id: '48',
  issue: 48,
  title: 'Confirm the tumour board data once, use it everywhere',
  tagline:
    'For the MDT coordinator: stage, condition, molecular results and prior treatment pulled out of notes in four languages, with the source sentence next to every value.',
};

type Doc = {
  id: string;
  hospital: string;
  language: string;
  lang: string;
  type: string;
  date: string;
  text: string;
};

type Evidence = { doc: string; quote: string; translation: string };

type Field = {
  id: string;
  label: string;
  status: 'ok' | 'conflict' | 'uncertain' | 'missing';
  proposed: string;
  confidence: number;
  codes: string;
  options: string[];
  why: string;
  evidence: Evidence[];
};

type Dataset = {
  id: string;
  name: string;
  age: number;
  sex: string;
  diagnosis: string;
  dataset: string;
  mdt: string;
  documents: Doc[];
  fields: Field[];
  counts: { total: number; needs_review: number; languages: number; hospitals: number };
};

type Decision = { value: string; action: 'accepted' | 'corrected' | 'unknown' };

type Scorecard = {
  rows: { field_id: string; label: string; confirmed: string; expected: string; action: string; verdict: string }[];
  correct: number;
  unknown: number;
  wrong: number;
  total_fields: number;
};

const PATIENT = 'P-048';

// Idea-local API calls, so this prototype stays in its own folder (see the build rules).
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

const post = <T,>(path: string, body: unknown) => call<T>(path, body);

// Tomorrow's tumour board list; only Sofia Ricci has the synthetic four-language record.
const board = [
  { id: PATIENT, time: '08:30', name: 'Sofia Ricci', dx: 'Colorectal ca., sigmoid · metastatic', from: '4 hospitals · 4 languages', status: 'Not prepared' },
  { id: 'X-511', time: '08:45', name: 'Jan de Vries', dx: 'NSCLC stage IV', from: 'Amsterdam', status: 'Prepared' },
  { id: 'X-512', time: '09:00', name: 'Marie Dubois', dx: 'Rectal ca. cT3N1', from: 'Liège', status: 'Prepared' },
  { id: 'X-513', time: '09:15', name: 'Georg Haller', dx: 'Colon ca., liver mets', from: 'München', status: 'Not prepared' },
  { id: 'X-514', time: '09:30', name: 'Elena Conti', dx: 'Gastric ca. cT4a', from: 'Milano', status: 'Prepared' },
];

const story: StoryStep[] = [
  { id: 'worklist', title: "Tomorrow's tumour board", explain: 'The MDT list as it looks today. Sofia Ricci is not prepared – her records sit in four hospitals, in four languages.' },
  { id: 'dataset', title: 'Gather the dataset', explain: 'The assistant reads every document and fills the minimal dataset. Contradictions and missing values come first.' },
  { id: 'reuse', title: 'Reuse what you confirmed', explain: 'Only values you confirmed appear in the MDT overview, the cancer registration and the research dataset.' },
  { id: 'score', title: 'How well did it do?', explain: 'Compare your confirmed dataset against the hidden answer key that came with these synthetic records.' },
];

const stages: Stage[] = [
  { label: 'Collecting documents from four hospitals', detail: 'Amsterdam · Liège · München · Milano', ms: 800 },
  { label: 'Reading free text in Dutch, French, German and Italian', detail: 'Pathology, consultation, CT and molecular reports', ms: 900 },
  { label: 'Extracting the agreed minimal dataset (mCRC)', detail: 'Stage, condition, molecular markers, prior treatment', ms: 900 },
  { label: 'Normalising to shared codes', detail: 'TNM 8th edition · SNOMED CT · OMOP', ms: 800 },
  { label: 'Flagging contradictions and gaps – never filling them in', detail: 'Values it cannot prove stay "unknown"', ms: 900 },
];

const tone = (status: Field['status']) => (status === 'conflict' ? 'crit' : status === 'ok' ? 'ok' : 'warn');
const statusLabel: Record<Field['status'], string> = {
  ok: 'Extracted',
  conflict: 'Contradiction',
  uncertain: 'Uncertain',
  missing: 'Not documented',
};

type Section = 'worklist' | 'dataset' | 'reuse' | 'score';

export default function ConfirmOnce() {
  const [section, setSection] = useState<Section>('worklist');
  const [data, setData] = useState<Dataset | null>(null);
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [score, setScore] = useState<Scorecard | null>(null);
  const [scoring, setScoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const prepare = useCallback(() => {
    setSection('dataset');
    setNotice(null);
    if (running || ready) return;
    setRunning(true);
    setLoaded(false);
    call<Dataset>(`/api/ideas/48/dataset/${PATIENT}`)
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => {
        setNotice('The synthetic record could not be loaded – use "Prepare for MDT" to try again.');
        setRunning(false);
      });
  }, [running, ready]);

  useEffect(() => {
    if (section === 'dataset' && !running && !data) prepare();
  }, [section, running, data, prepare]);

  const decide = (field: Field, action: Decision['action'], value: string) => {
    setDecisions((d) => ({ ...d, [field.id]: { value, action } }));
    setScore(null);
  };

  const needsReview = data?.fields.filter((f) => f.status !== 'ok') ?? [];
  const clean = data?.fields.filter((f) => f.status === 'ok') ?? [];
  const confirmedCount = Object.keys(decisions).length;

  const runScore = async () => {
    setScoring(true);
    try {
      setScore(
        await post<Scorecard>('/api/ideas/48/scorecard', {
          patient_id: PATIENT,
          decisions: Object.entries(decisions).map(([field_id, d]) => ({ field_id, value: d.value, action: d.action })),
        }),
      );
    } catch {
      setNotice('The scorecard could not be calculated.');
    } finally {
      setScoring(false);
    }
  };

  return (
    <HospitalShell
      module="Tumour board preparation · minimal dataset"
      guide={
        <StoryGuide
          steps={story}
          current={section}
          onGo={(id) => {
            if (id === 'dataset') prepare();
            else setSection(id as Section);
          }}
          nextLabel={section === 'worklist' ? 'Prepare Sofia Ricci for MDT' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: 'MDT worklist', badge: board.length },
        { id: 'dataset', label: 'Minimal dataset', badge: needsReview.length || undefined },
        { id: 'reuse', label: 'MDT · registry · research', badge: confirmedCount || undefined },
        { id: 'score', label: 'Scorecard' },
      ]}
      active={section}
      onNav={(id) => (id === 'dataset' ? prepare() : setSection(id as Section))}
      patient={
        section === 'worklist' || !data
          ? null
          : { id: data.id, name: data.name, age: data.age, sex: data.sex, diagnosis: data.diagnosis, ward: 'Colorectal MDT' }
      }
      toolbar={
        <>
          <span>
            Dataset: <strong>{data?.dataset ?? 'Health ReWireD minimal dataset – mCRC'}</strong>
          </span>
          <span className="hx-spacer" />
          <span>
            Confirmed {confirmedCount} of {data?.counts.total ?? 8}
          </span>
          <button type="button" className="hx-btn primary" onClick={prepare} disabled={running && !loaded}>
            {running && !loaded ? (
              <>
                <span className="hx-spinner" aria-hidden /> Preparing…
              </>
            ) : (
              'Prepare for MDT'
            )}
          </button>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}

      {section === 'worklist' && (
        <Panel title="Colorectal tumour board · Thursday 08:30 · Room MDT-2">
          <DataTable
            rowKey={(r) => r.id}
            rows={board}
            selected={PATIENT}
            onSelect={(r) =>
              r.id === PATIENT ? prepare() : setNotice('Only Sofia Ricci has the synthetic four-language record in this prototype.')
            }
            columns={[
              { key: 'time', label: 'Time', width: '60px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'dx', label: 'Diagnosis' },
              { key: 'from', label: 'Records from' },
              {
                key: 'status',
                label: 'Dataset',
                render: (r) => <Pill tone={r.status === 'Prepared' ? 'ok' : 'warn'}>{r.status}</Pill>,
              },
            ]}
          />
          <p className="i48-why">
            Today this means reading every document again and retyping stage, condition, molecular results and prior
            treatment – for the MDT, again for the cancer registry, and again for each study.
          </p>
        </Panel>
      )}

      {section === 'dataset' && (
        <>
          <Backstage
            title="Behind the scenes – what the assistant is doing"
            stages={stages}
            running={running}
            holdLast
            release={loaded}
            onFinished={() => setReady(true)}
            note="Simulated timings; the documents, values and answer key are synthetic."
          />
          {!ready && !data && <Panel title="Minimal dataset"><Working label="Collecting the record" /></Panel>}
          {ready && data && (
            <DatasetScreen
              data={data}
              needsReview={needsReview}
              clean={clean}
              decisions={decisions}
              onDecide={decide}
              onDone={() => setSection('reuse')}
            />
          )}
        </>
      )}

      {section === 'reuse' &&
        (data ? (
          <Reuse data={data} decisions={decisions} onScore={() => setSection('score')} />
        ) : (
          <Panel title="MDT · registry · research">Prepare the dataset first.</Panel>
        ))}

      {section === 'score' && (
        <Panel
          title="Scorecard against the hidden answer key"
          actions={
            <button type="button" className="hx-btn primary" onClick={runScore} disabled={scoring || confirmedCount === 0}>
              {scoring ? (
                <>
                  <span className="hx-spinner" aria-hidden /> Checking…
                </>
              ) : (
                'Check my confirmed dataset'
              )}
            </button>
          }
        >
          {confirmedCount === 0 && <span className="hx-empty">Confirm some values first – the scorecard only counts what you signed off.</span>}
          {scoring && <Working label="Comparing with the answer key" />}
          {score && (
            <>
              <div className="i48-score">
                <div>
                  <strong>{score.correct}</strong> correct
                </div>
                <div>
                  <strong>{score.unknown}</strong> kept unknown
                </div>
                <div>
                  <strong>{score.wrong}</strong> wrong
                </div>
                <div>
                  <strong>
                    {confirmedCount}/{score.total_fields}
                  </strong>
                  confirmed
                </div>
              </div>
              <DataTable
                rowKey={(r) => r.field_id}
                rows={score.rows}
                rowTone={(r) => (r.verdict === 'wrong' ? 'crit' : undefined)}
                columns={[
                  { key: 'label', label: 'Value' },
                  { key: 'confirmed', label: 'You confirmed' },
                  { key: 'expected', label: 'Answer key' },
                  { key: 'action', label: 'Your action' },
                  {
                    key: 'verdict',
                    label: 'Result',
                    render: (r) => (
                      <Pill tone={r.verdict === 'correct' ? 'ok' : r.verdict === 'unknown' ? 'neutral' : 'crit'}>
                        {r.verdict === 'unknown' ? 'correctly left unknown' : r.verdict}
                      </Pill>
                    ),
                  },
                ]}
              />
              <p className="i48-why">
                "Correctly left unknown" counts as a good answer: an implied condition score should stay unknown rather
                than be guessed.
              </p>
            </>
          )}
        </Panel>
      )}
    </HospitalShell>
  );
}

function DatasetScreen({
  data,
  needsReview,
  clean,
  decisions,
  onDecide,
  onDone,
}: {
  data: Dataset;
  needsReview: Field[];
  clean: Field[];
  decisions: Record<string, Decision>;
  onDecide: (field: Field, action: Decision['action'], value: string) => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState('review');
  const docs = new Map(data.documents.map((d) => [d.id, d]));
  return (
    <>
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'review', label: `Needs your decision (${needsReview.length})` },
          { id: 'rest', label: `Rest of the dataset (${clean.length})` },
          { id: 'docs', label: `Source documents (${data.documents.length})` },
          { id: 'assistant', label: 'Ask the assistant' },
        ]}
      />
      {tab === 'review' && (
        <Panel
          title={`Contradictions, uncertain and missing values · ${data.counts.languages} languages · ${data.counts.hospitals} hospitals`}
          actions={
            <button type="button" className="hx-btn primary" onClick={onDone}>
              Use confirmed values →
            </button>
          }
        >
          {needsReview.map((f) => (
            <FieldCard key={f.id} field={f} docs={docs} decision={decisions[f.id]} onDecide={onDecide} />
          ))}
        </Panel>
      )}
      {tab === 'rest' && (
        <Panel title="Values the assistant could read directly">
          {clean.map((f) => (
            <FieldCard key={f.id} field={f} docs={docs} decision={decisions[f.id]} onDecide={onDecide} />
          ))}
        </Panel>
      )}
      {tab === 'docs' && (
        <Panel title="Source documents – synthetic, four hospitals, four languages">
          {data.documents.map((d) => (
            <div key={d.id} className="i48-evidence">
              <div className="i48-meta">
                <Pill tone="info">{d.language}</Pill>
                <span>{d.type}</span>
                <span>{d.date}</span>
                <span>{d.hospital}</span>
                <span>{d.id}</span>
              </div>
              <div className="i48-quote">{d.text}</div>
            </div>
          ))}
        </Panel>
      )}
      {tab === 'assistant' && <Assistant />}
    </>
  );
}

function FieldCard({
  field,
  docs,
  decision,
  onDecide,
}: {
  field: Field;
  docs: Map<string, Doc>;
  decision?: Decision;
  onDecide: (field: Field, action: Decision['action'], value: string) => void;
}) {
  const [choice, setChoice] = useState(field.proposed);
  const unknownOption = field.options.find((o) => o.toLowerCase().startsWith('unknown')) ?? 'Unknown';
  return (
    <article className={`i48-field ${decision ? 'confirmed' : field.status}`}>
      <header>
        <strong>{field.label}</strong>
        <Pill tone={decision ? 'ok' : tone(field.status)}>{decision ? `Confirmed (${decision.action})` : statusLabel[field.status]}</Pill>
        <span className="i48-meta">
          <span className="i48-conf" aria-label={`confidence ${Math.round(field.confidence * 100)}%`}>
            <span style={{ width: `${Math.round(field.confidence * 100)}%` }} />
          </span>
          confidence {Math.round(field.confidence * 100)}% · {field.codes}
        </span>
      </header>
      <div>
        Proposed: <strong>{decision ? decision.value : field.proposed}</strong>
      </div>
      <p className="i48-why">{field.why}</p>
      {field.evidence.map((e, i) => {
        const doc = docs.get(e.doc);
        return (
          <div key={i} className="i48-evidence">
            <div className="i48-meta">
              <Pill tone="info">{doc?.language ?? '—'}</Pill>
              <span>{doc?.type}</span>
              <span>{doc?.date}</span>
              <span>{doc?.hospital}</span>
            </div>
            <div className="i48-quote">“{e.quote}”</div>
            <div className="i48-translation">→ {e.translation}</div>
          </div>
        );
      })}
      <div className="i48-decide">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={`Value for ${field.label}`}>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <button
          type="button"
          className="hx-btn primary"
          onClick={() => onDecide(field, choice === field.proposed ? 'accepted' : 'corrected', choice)}
        >
          {choice === field.proposed ? 'Accept' : 'Confirm correction'}
        </button>
        <button type="button" className="hx-btn" onClick={() => onDecide(field, 'unknown', unknownOption)}>
          Mark unknown
        </button>
        {decision && <span className="i48-translation">Nothing is reused until you confirm it.</span>}
      </div>
    </article>
  );
}

function Reuse({
  data,
  decisions,
  onScore,
}: {
  data: Dataset;
  decisions: Record<string, Decision>;
  onScore: () => void;
}) {
  const rows = data.fields.map((f) => ({
    id: f.id,
    label: f.label,
    value: decisions[f.id]?.value ?? '',
    action: decisions[f.id]?.action ?? '',
    codes: f.codes,
  }));
  const confirmed = rows.filter((r) => r.value);
  const pending = rows.filter((r) => !r.value);
  return (
    <div className="hx-grid">
      <Panel title="MDT overview – Sofia Ricci">
        <DataTable
          rowKey={(r) => r.id}
          rows={confirmed}
          empty="Nothing confirmed yet. Go back to the dataset and accept, correct or mark values unknown."
          columns={[
            { key: 'label', label: 'Item' },
            { key: 'value', label: 'Confirmed value', render: (r) => <strong>{r.value}</strong> },
          ]}
        />
        <p className="i48-why">{data.mdt} · prepared without retyping anything.</p>
      </Panel>
      <Panel
        title="Cancer registration – submission draft"
        actions={<Pill tone="warn">Registry validates before intake</Pill>}
      >
        <DataTable
          rowKey={(r) => r.id}
          rows={confirmed}
          empty="Registration stays empty until values are confirmed."
          columns={[
            { key: 'label', label: 'Registry item' },
            { key: 'value', label: 'Value' },
            { key: 'action', label: 'Confirmed as' },
          ]}
        />
      </Panel>
      <Panel
        title="Research dataset – mCRC cohort export"
        actions={
          <button type="button" className="hx-btn primary" onClick={onScore}>
            Show scorecard →
          </button>
        }
      >
        <DataTable
          rowKey={(r) => r.id}
          rows={confirmed}
          empty="No confirmed values to export."
          columns={[
            { key: 'label', label: 'Variable' },
            { key: 'codes', label: 'Codes' },
            { key: 'value', label: 'Value' },
          ]}
        />
        {pending.length > 0 && (
          <p className="i48-why">
            Not exported ({pending.length}): {pending.map((p) => p.label).join(', ')} – a value only travels once a
            clinician has confirmed it.
          </p>
        )}
      </Panel>
    </div>
  );
}

const tasks = [
  'Explain the contradictions and the missing values in this dataset, and what I must decide.',
  'Which values come from which language and document, and how sure are you?',
  'Why is the performance status not filled in?',
];

function Assistant() {
  const [task, setTask] = useState(tasks[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      setResult(await post<AgentResult>('/api/ideas/48/agent', { patient_id: PATIENT, task }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel
      title={result ? result.headline : 'Ask the assistant about this dataset'}
      actions={
        result && <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>{result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>
      }
    >
      <div className="chip-row">
        {tasks.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => setTask(t)}>
            {t}
          </button>
        ))}
      </div>
      <textarea value={task} rows={3} onChange={(e) => setTask(e.target.value)} style={{ width: '100%' }} />
      <button type="button" className="hx-btn primary" onClick={run} disabled={loading}>
        {loading ? (
          <>
            <span className="hx-spinner" aria-hidden /> Assistant is reading the documents…
          </>
        ) : (
          'Ask assistant'
        )}
      </button>
      {loading && <Working label="Reading four languages" hint="AI answers can take up to a minute" />}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="blocks">
          {result.note && <p className="note">{result.note}</p>}
          {result.blocks.map((block, i) => (
            <RenderBlock key={i} block={block} />
          ))}
        </div>
      )}
    </Panel>
  );
}
