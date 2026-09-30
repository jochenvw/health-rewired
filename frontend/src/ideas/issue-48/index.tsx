import { useCallback, useEffect, useState } from 'react';
import type { AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import {
  Attention,
  Drawer,
  Eyebrow,
  Panel,
  Status,
  Table,
  Tabs,
  Workspace,
  type StatusTone,
} from './Workspace';

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

const statusTone: Record<Field['status'], StatusTone> = {
  ok: 'info',
  conflict: 'danger',
  uncertain: 'warning',
  missing: 'warning',
};

const statusLabel: Record<Field['status'], string> = {
  ok: 'Read from source',
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
  const [failed, setFailed] = useState(false);
  const [inspect, setInspect] = useState<{ title: string; docs: Doc[] } | null>(null);

  const prepare = useCallback(() => {
    setSection('dataset');
    setNotice(null);
    if (running || ready) return;
    setRunning(true);
    setFailed(false);
    setLoaded(false);
    call<Dataset>(`/api/ideas/48/dataset/${PATIENT}`)
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => {
        setNotice('The synthetic record could not be retrieved. Use "Prepare for MDT" to try again.');
        setRunning(false);
        setFailed(true);
      });
  }, [running, ready]);

  useEffect(() => {
    if (section === 'dataset' && !running && !data && !failed) prepare();
  }, [section, running, data, failed, prepare]);

  const decide = (field: Field, action: Decision['action'], value: string) => {
    setDecisions((d) => ({ ...d, [field.id]: { value, action } }));
    setScore(null);
  };

  const needsReview = data?.fields.filter((f) => f.status !== 'ok') ?? [];
  const clean = data?.fields.filter((f) => f.status === 'ok') ?? [];
  const confirmedCount = Object.keys(decisions).length;
  const openFlags = needsReview.filter((f) => !decisions[f.id]).length;

  const runScore = async () => {
    setScoring(true);
    setNotice(null);
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

  const openDocs = (title: string, docs: Doc[]) => setInspect({ title, docs });

  return (
    <Workspace
      module="Tumour board preparation"
      org="Klinikum Rewired München · Colorectal multidisciplinary team"
      workstation="MDT office 2 · workstation MDT-A4"
      chromeAction={
        data && (
          <button type="button" className="i48-btn text" onClick={() => openDocs('All source documents', data.documents)}>
            Open all source documents
          </button>
        )
      }
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
        { id: 'worklist', label: 'MDT worklist', detail: `${board.length} cases · Thursday 08:30` },
        {
          id: 'dataset',
          label: 'Minimal dataset',
          detail: data ? `${openFlags} of ${data.counts.total} awaiting a decision` : 'Not gathered yet',
        },
        {
          id: 'reuse',
          label: 'MDT · registry · research',
          detail: `${confirmedCount} confirmed value${confirmedCount === 1 ? '' : 's'} reused`,
        },
        { id: 'score', label: 'Scorecard', detail: 'Against the hidden answer key' },
      ]}
      active={section}
      onNav={(id) => (id === 'dataset' ? prepare() : setSection(id as Section))}
      banner={
        section === 'worklist' || !data
          ? null
          : {
              title: `${data.name.split(' ').slice(-1)[0].toUpperCase()}, ${data.name.split(' ')[0]}`,
              subtitle: `MRN ${data.id.replace(/\D/g, '').padStart(8, '0')} · ${data.sex}, ${data.age} y · synthetic record`,
              facts: [
                { label: 'Diagnosis', value: data.diagnosis },
                { label: 'Tumour board', value: data.mdt },
                { label: 'Source records', value: `${data.documents.length} documents · ${data.counts.languages} languages · ${data.counts.hospitals} hospitals` },
                {
                  label: 'Dataset state',
                  value: (
                    <Status tone={openFlags ? 'warning' : confirmedCount ? 'success' : 'neutral'}>
                      {openFlags ? `${openFlags} awaiting decision` : `${confirmedCount} confirmed`}
                    </Status>
                  ),
                },
              ],
              action: (
                <button type="button" className="i48-btn" onClick={() => openDocs('Complete source record', data.documents)}>
                  Open complete record
                </button>
              ),
            }
      }
      toolbar={
        <>
          <span>
            <Eyebrow>Dataset definition</Eyebrow>
            <br />
            <strong>{data?.dataset ?? 'Health ReWireD minimal dataset – metastatic colorectal cancer (mCRC), v0.3'}</strong>
          </span>
          <span className="i48-spacer" />
          <span>
            <Eyebrow>Confirmed by you</Eyebrow>
            <br />
            <strong>
              {confirmedCount}
              {data ? ` of ${data.counts.total}` : ''}
            </strong>
          </span>
          <button type="button" className="i48-btn primary" onClick={prepare} disabled={running && !loaded}>
            {running && !loaded ? (
              <>
                <span className="hx-spinner" aria-hidden /> Gathering the dataset…
              </>
            ) : (
              'Prepare for MDT'
            )}
          </button>
        </>
      }
      drawer={
        inspect && (
          <Drawer title={inspect.title} onClose={() => setInspect(null)}>
            {inspect.docs.map((d) => (
              <article key={d.id} className="i48-source">
                <div className="i48-source-meta">
                  <Status tone="info">{d.language}</Status>
                  <span>{d.type}</span>
                  <span>{d.date}</span>
                  <span>{d.id}</span>
                </div>
                <p className="i48-quote">{d.text}</p>
                <p className="i48-translation">{d.hospital} · synthetic document, original language retained</p>
              </article>
            ))}
          </Drawer>
        )
      }
    >
      {notice && (
        <Attention
          tone="danger"
          status="Retrieval failed"
          action={
            <button type="button" className="i48-btn" onClick={prepare}>
              Try again
            </button>
          }
        >
          {notice}
        </Attention>
      )}

      {section === 'worklist' && (
        <>
          <Attention
            tone="warning"
            status="Human work required"
            action={
              <button type="button" className="i48-btn primary" onClick={prepare}>
                Prepare Sofia Ricci for MDT
              </button>
            }
          >
            Two cases are not prepared. For Sofia Ricci the stage, condition, molecular results and prior treatment are
            retyped by hand today – for the tumour board, again for the cancer registry, and again for every study.
          </Attention>
          <Panel eyebrow="Current worklist" title="Colorectal tumour board · Thursday 08:30 · Room MDT-2">
            <Table
              caption="Cases scheduled for tomorrow's colorectal tumour board (synthetic)."
              rowKey={(r) => r.id}
              rows={board}
              selected={PATIENT}
              onSelect={(r) =>
                r.id === PATIENT
                  ? prepare()
                  : setNotice('Only Sofia Ricci has the synthetic four-language record in this prototype.')
              }
              columns={[
                { key: 'time', label: 'Time', width: '72px' },
                { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
                { key: 'dx', label: 'Diagnosis' },
                { key: 'from', label: 'Records from' },
                {
                  key: 'status',
                  label: 'Dataset',
                  render: (r) => (
                    <Status tone={r.status === 'Prepared' ? 'success' : 'warning'}>{r.status}</Status>
                  ),
                },
              ]}
            />
          </Panel>
        </>
      )}

      {section === 'dataset' && (
        <>
          <Backstage
            title="Live activity – reading the source documents"
            stages={stages}
            running={running}
            holdLast
            release={loaded}
            onFinished={() => setReady(true)}
            note="Simulated timings; the documents, values and answer key are synthetic."
          />
          {!ready && !data && (
            <Panel eyebrow="Current task" title="Minimal dataset">
              <Working label="Collecting the record from four hospitals" />
            </Panel>
          )}
          {ready && data && (
            <DatasetScreen
              data={data}
              needsReview={needsReview}
              clean={clean}
              openFlags={openFlags}
              decisions={decisions}
              onDecide={decide}
              onInspect={openDocs}
              onDone={() => setSection('reuse')}
            />
          )}
        </>
      )}

      {section === 'reuse' &&
        (data ? (
          <Reuse data={data} decisions={decisions} onScore={() => setSection('score')} onBack={() => prepare()} />
        ) : (
          <Attention
            tone="warning"
            status="Nothing to reuse"
            action={
              <button type="button" className="i48-btn primary" onClick={prepare}>
                Prepare for MDT
              </button>
            }
          >
            The dataset has not been gathered yet, so no value can travel to the tumour board, the registry or research.
          </Attention>
        ))}

      {section === 'score' && (
        <Panel
          eyebrow="Payoff · measured against the answer key"
          title="How well did the assistant do?"
          actions={
            <button type="button" className="i48-btn primary" onClick={runScore} disabled={scoring || confirmedCount === 0}>
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
          {confirmedCount === 0 && (
            <p className="i48-empty">
              Confirm some values first – the scorecard only counts what a human signed off.
            </p>
          )}
          {scoring && <Working label="Comparing your dataset with the hidden answer key" />}
          {score && (
            <>
              <div className="i48-score">
                <div className="success">
                  <strong>{score.correct}</strong>
                  <Eyebrow>Correct</Eyebrow>
                </div>
                <div className="warning">
                  <strong>{score.unknown}</strong>
                  <Eyebrow>Correctly left unknown</Eyebrow>
                </div>
                <div className="danger">
                  <strong>{score.wrong}</strong>
                  <Eyebrow>Wrong</Eyebrow>
                </div>
                <div>
                  <strong>
                    {confirmedCount}/{score.total_fields}
                  </strong>
                  <Eyebrow>Confirmed by you</Eyebrow>
                </div>
              </div>
              <Table
                caption="Your confirmed values compared with the hidden answer key supplied with the synthetic records."
                rowKey={(r) => r.field_id}
                rows={score.rows}
                rowTone={(r) => (r.verdict === 'wrong' ? 'danger' : undefined)}
                columns={[
                  { key: 'label', label: 'Value' },
                  { key: 'confirmed', label: 'You confirmed' },
                  { key: 'expected', label: 'Answer key' },
                  { key: 'action', label: 'Your action' },
                  {
                    key: 'verdict',
                    label: 'Result',
                    render: (r) => (
                      <Status tone={r.verdict === 'correct' ? 'success' : r.verdict === 'unknown' ? 'warning' : 'danger'}>
                        {r.verdict === 'unknown' ? 'Correctly left unknown' : r.verdict}
                      </Status>
                    ),
                  },
                ]}
              />
              <p className="i48-note">
                "Correctly left unknown" counts as a good answer: an implied condition score should stay unknown rather
                than be guessed.
              </p>
            </>
          )}
        </Panel>
      )}
    </Workspace>
  );
}

function DatasetScreen({
  data,
  needsReview,
  clean,
  openFlags,
  decisions,
  onDecide,
  onInspect,
  onDone,
}: {
  data: Dataset;
  needsReview: Field[];
  clean: Field[];
  openFlags: number;
  decisions: Record<string, Decision>;
  onDecide: (field: Field, action: Decision['action'], value: string) => void;
  onInspect: (title: string, docs: Doc[]) => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState('review');
  const docs = new Map(data.documents.map((d) => [d.id, d]));
  const conflicts = needsReview.filter((f) => f.status === 'conflict').length;
  const inspectField = (field: Field) =>
    onInspect(
      `Source documents behind "${field.label}"`,
      field.evidence.map((e) => docs.get(e.doc)).filter((d): d is Doc => Boolean(d)),
    );

  return (
    <>
      {openFlags > 0 ? (
        <Attention tone={conflicts ? 'danger' : 'warning'} status="Human review required">
          {openFlags} of {data.counts.total} values cannot be used yet: {conflicts} contradiction
          {conflicts === 1 ? '' : 's'}, plus values that are only implied or not documented at all. The assistant leaves
          them open instead of filling them in – you accept, correct or mark each one unknown.
        </Attention>
      ) : (
        <Attention
          tone="success"
          status="Ready for the tumour board"
          action={
            <button type="button" className="i48-btn primary" onClick={onDone}>
              Use confirmed values
            </button>
          }
        >
          Every flagged value has a human decision. Confirmed values can now travel to the MDT overview, the cancer
          registration and the research dataset.
        </Attention>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'review', label: `Needs your decision (${needsReview.length})` },
          { id: 'rest', label: `Read from source (${clean.length})` },
          { id: 'docs', label: `Source documents (${data.documents.length})` },
          { id: 'account', label: 'Extraction account' },
          { id: 'assistant', label: 'Ask the assistant' },
        ]}
      />

      {tab === 'review' && (
        <Panel
          eyebrow="Current task · human review required"
          title="Contradictions, uncertain and missing values"
          actions={
            <button type="button" className="i48-btn primary" onClick={onDone}>
              Use confirmed values
            </button>
          }
        >
          {needsReview.map((f) => (
            <ValueCard
              key={f.id}
              field={f}
              docs={docs}
              decision={decisions[f.id]}
              onDecide={onDecide}
              onInspect={inspectField}
            />
          ))}
        </Panel>
      )}

      {tab === 'rest' && (
        <Panel eyebrow="Supporting context" title="Values the assistant could read directly">
          {clean.map((f) => (
            <ValueCard
              key={f.id}
              field={f}
              docs={docs}
              decision={decisions[f.id]}
              onDecide={onDecide}
              onInspect={inspectField}
            />
          ))}
        </Panel>
      )}

      {tab === 'docs' && (
        <Panel
          eyebrow="Full record"
          title="Source documents · four hospitals, four languages"
          actions={
            <button type="button" className="i48-btn" onClick={() => onInspect('All source documents', data.documents)}>
              Open in inspection drawer
            </button>
          }
        >
          <Table
            caption="Synthetic documents behind this minimal dataset; the original language is always kept."
            rowKey={(d) => d.id}
            rows={data.documents}
            onSelect={(d) => onInspect(`${d.type} · ${d.language}`, [d])}
            columns={[
              { key: 'date', label: 'Date', width: '100px' },
              { key: 'type', label: 'Document' },
              { key: 'language', label: 'Language', render: (d) => <Status tone="info">{d.language}</Status> },
              { key: 'hospital', label: 'Hospital' },
              { key: 'id', label: 'Reference' },
            ]}
          />
        </Panel>
      )}

      {tab === 'account' && (
        <Panel eyebrow="Public summary of the assistant's work" title="How this dataset was put together">
          <ol className="i48-account">
            {[
              ['Trying to answer', `Fill the ${data.counts.total} agreed values of the mCRC minimal dataset for ${data.name}.`],
              ['Considered', `${data.documents.length} documents from ${data.counts.hospitals} hospitals in ${data.counts.languages} languages: pathology, consultation, CT and molecular reports.`],
              ['This showed', `${clean.length} values stated explicitly in the text, each with the sentence it came from and a translation.`],
              ['But this remains uncertain', `${needsReview.length} values: a KRAS/RAS contradiction between two reports, a condition described but never scored, an indeterminate lung nodule, and a BRAF result that is simply absent.`],
              ['So the current conclusion is', 'Nothing uncertain has been filled in. Those values stay open until a clinician accepts, corrects or marks them unknown.'],
              ['Next', 'Work through the flagged values, then reuse the confirmed dataset for the tumour board, the cancer registry and research.'],
            ].map(([label, text]) => (
              <li key={label}>
                <Eyebrow>{label}</Eyebrow>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {tab === 'assistant' && <Assistant />}
    </>
  );
}

function ValueCard({
  field,
  docs,
  decision,
  onDecide,
  onInspect,
}: {
  field: Field;
  docs: Map<string, Doc>;
  decision?: Decision;
  onDecide: (field: Field, action: Decision['action'], value: string) => void;
  onInspect: (field: Field) => void;
}) {
  const [choice, setChoice] = useState(decision?.value ?? field.proposed);
  const unknownOption = field.options.find((o) => o.toLowerCase().startsWith('unknown')) ?? 'Unknown';
  const percent = Math.round(field.confidence * 100);
  return (
    <article className={`i48-value ${decision ? 'confirmed' : field.status}`}>
      <header>
        <h4>{field.label}</h4>
        <Status tone={decision ? 'success' : statusTone[field.status]}>
          {decision ? `Confirmed · ${decision.action}` : statusLabel[field.status]}
        </Status>
        <span className="i48-conf">
          <i>
            <b style={{ width: `${percent}%` }} />
          </i>
          confidence {percent}%
        </span>
        <span className="i48-panel-actions">
          <button type="button" className="i48-btn text" onClick={() => onInspect(field)}>
            Open original source
          </button>
        </span>
      </header>
      <Eyebrow>{decision ? 'Confirmed value' : 'Proposed value'}</Eyebrow>
      <p className="i48-claim">
        <strong>{decision ? decision.value : field.proposed}</strong>
      </p>
      <p className="i48-note">
        {field.why} <span className="i48-conf">{field.codes}</span>
      </p>
      {field.evidence.map((e, i) => {
        const doc = docs.get(e.doc);
        return (
          <div key={i} className="i48-source">
            <div className="i48-source-meta">
              <Status tone="info">{doc?.language ?? 'Unknown language'}</Status>
              <span>{doc?.type}</span>
              <span>{doc?.date}</span>
              <span>{doc?.hospital}</span>
            </div>
            <p className="i48-quote">“{e.quote}”</p>
            <p className="i48-translation">→ {e.translation}</p>
          </div>
        );
      })}
      <div className="i48-decide">
        <Eyebrow>Human decision · nothing is reused until you confirm</Eyebrow>
        <label>
          <span className="i48-eyebrow">Value</span>{' '}
          <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label={`Value for ${field.label}`}>
            {field.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="i48-btn primary"
          onClick={() => onDecide(field, choice === field.proposed ? 'accepted' : 'corrected', choice)}
        >
          {choice === field.proposed ? `Accept ${field.label.toLowerCase()}` : 'Confirm correction'}
        </button>
        <button type="button" className="i48-btn" onClick={() => onDecide(field, 'unknown', unknownOption)}>
          Mark unknown
        </button>
      </div>
    </article>
  );
}

function Reuse({
  data,
  decisions,
  onScore,
  onBack,
}: {
  data: Dataset;
  decisions: Record<string, Decision>;
  onScore: () => void;
  onBack: () => void;
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
    <>
      {pending.length > 0 && (
        <Attention
          tone="warning"
          status="Withheld"
          action={
            <button type="button" className="i48-btn" onClick={onBack}>
              Back to the flagged values
            </button>
          }
        >
          {pending.length} value{pending.length === 1 ? '' : 's'} have no human decision yet, so they are withheld from
          the tumour board, the registry and research: {pending.map((p) => p.label).join(', ')}.
        </Attention>
      )}
      <div className="i48-grid">
        <Panel eyebrow="Reuse 1 · tumour board" title={`MDT overview · ${data.name}`}>
          <Table
            caption={`${data.mdt}; prepared without retyping anything.`}
            rowKey={(r) => r.id}
            rows={confirmed}
            empty="Nothing confirmed yet. Accept, correct or mark values unknown first."
            columns={[
              { key: 'label', label: 'Item' },
              { key: 'value', label: 'Confirmed value', render: (r) => <strong>{r.value}</strong> },
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Reuse 2 · cancer registration"
          title="Submission draft"
          actions={<Status tone="warning">Registry validates before intake</Status>}
        >
          <Table
            caption="Only values a clinician has confirmed are offered to the cancer registry."
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
          eyebrow="Reuse 3 · research"
          title="mCRC cohort export"
          actions={
            <button type="button" className="i48-btn primary" onClick={onScore}>
              Show scorecard
            </button>
          }
        >
          <Table
            caption="The same confirmed values, normalised to shared codes for the research dataset."
            rowKey={(r) => r.id}
            rows={confirmed}
            empty="No confirmed values to export."
            columns={[
              { key: 'label', label: 'Variable' },
              { key: 'codes', label: 'Codes' },
              { key: 'value', label: 'Value' },
            ]}
          />
        </Panel>
      </div>
    </>
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
      eyebrow="Assistant · public account of its work"
      title={result ? result.headline : 'Ask the assistant about this dataset'}
      actions={
        result && (
          <Status tone={result.mode === 'copilot' ? 'success' : 'neutral'}>
            {result.mode === 'copilot' ? 'Live model' : 'Deterministic demo'}
          </Status>
        )
      }
    >
      <div className="chip-row">
        {tasks.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => setTask(t)}>
            {t}
          </button>
        ))}
      </div>
      <label>
        <span className="i48-eyebrow">Your question</span>
        <textarea value={task} rows={3} onChange={(e) => setTask(e.target.value)} style={{ width: '100%' }} />
      </label>
      <div className="i48-decide">
        <button type="button" className="i48-btn primary" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <span className="hx-spinner" aria-hidden /> Reading the documents…
            </>
          ) : (
            'Ask the assistant'
          )}
        </button>
        {loading && <Working label="Reading four languages" hint="model answers can take up to a minute" />}
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="blocks">
          {result.note && <p className="i48-note">{result.note}</p>}
          {result.blocks.map((block, i) => (
            <RenderBlock key={i} block={block} />
          ))}
        </div>
      )}
    </Panel>
  );
}
