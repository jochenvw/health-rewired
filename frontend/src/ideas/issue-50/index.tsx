import { useEffect, useMemo, useState } from 'react';
import type { AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '50',
  issue: 50,
  title: 'Confirm the record once, and it is right everywhere',
  tagline:
    'For the MDT coordinator: the dataset for tomorrow’s tumour board is gathered from records in four languages, you confirm it once, and it appears in the MDT, the cancer registry and research.',
};

type EvidenceItem = { document: string; quote: string; translation: string };

type Field = {
  id: string;
  label: string;
  group: string;
  suggested: string;
  coding: string;
  confidence: 'high' | 'medium' | 'low' | 'none' | 'conflict';
  status: 'ok' | 'conflict' | 'implied' | 'missing';
  issue: string;
  options: string[];
  evidence: EvidenceItem[];
};

type SourceDoc = {
  id: string;
  path: string;
  language: string;
  flag: string;
  hospital: string;
  kind: string;
  date: string;
  text: string;
};

type Case = { patient: Record<string, string | number>; documents: SourceDoc[]; fields: Field[] };

type Decision = { state: 'pending' | 'confirmed' | 'unknown'; value: string };

// Idea-local API calls, so this idea stays inside its own files.
async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

async function post<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

type Section = 'sources' | 'dataset' | 'mdt' | 'registry';

const story: StoryStep[] = [
  {
    id: 'sources',
    title: 'What arrived',
    explain:
      'Four hospitals sent this patient’s records: a Dutch letter, a French pathology report, an Italian CT report and a German molecular report. Today someone retypes all of it.',
  },
  {
    id: 'extract',
    title: 'Read the records',
    explain:
      'The assistant reads all four languages and fills the agreed minimal dataset – with the original sentence behind every value.',
  },
  {
    id: 'confirm',
    title: 'Confirm each value',
    explain:
      'Contradictions, implied values and gaps are at the top. Accept, correct or mark unknown – nothing is recorded until you do.',
  },
  {
    id: 'mdt',
    title: 'Tumour board view',
    explain: 'Confirmed values appear in the MDT overview immediately. Anything still open stays visibly open.',
  },
  {
    id: 'registry',
    title: 'Registry & research',
    explain:
      'The same confirmed values, coded, ready for the cancer registry and the research dataset. Confirmed once, reused everywhere.',
  },
];

const extractStages: Stage[] = [
  { label: 'Collecting documents from four hospitals', detail: 'NL Amsterdam · FR Lille · IT Bologna · DE Leipzig', ms: 700 },
  { label: 'Reading Dutch, French, Italian and German text', detail: '4 documents · no retyping in between', ms: 800 },
  { label: 'Filling the minimal dataset', detail: 'stage, performance status, molecular results, previous treatments', ms: 900 },
  { label: 'Normalising towards TNM, SNOMED CT and OMOP', detail: 'a code attached to each value', ms: 700 },
  { label: 'Checking the sources against each other', detail: 'contradictions, implied wording and missing results', ms: 900 },
  { label: 'Asking the assistant what needs a human decision' },
];

const statusTone = { conflict: 'crit', implied: 'warn', missing: 'warn', ok: 'ok' } as const;
const statusLabel = {
  conflict: 'Sources disagree',
  implied: 'Implied only',
  missing: 'Missing',
  ok: 'Extracted',
} as const;
const confidenceLabel = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  none: 'No value found',
  conflict: 'Conflicting sources',
} as const;

export default function RecordOnceReuseEverywhere() {
  const [section, setSection] = useState<Section>('sources');
  const [data, setData] = useState<Case | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [extracted, setExtracted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState(0);
  const [review, setReview] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState(false);

  useEffect(() => {
    get<Case>('/api/ideas/50/case')
      .then(setData)
      .catch(() => setError('Could not load the synthetic case.'));
  }, []);

  const fields = useMemo(() => {
    const order = { conflict: 0, missing: 1, implied: 2, ok: 3 };
    return [...(data?.fields ?? [])].sort((a, b) => order[a.status] - order[b.status]);
  }, [data]);

  const decisionFor = (field: Field): Decision => decisions[field.id] ?? { state: 'pending', value: field.suggested };
  const confirmed = fields.filter((f) => decisionFor(f).state === 'confirmed');
  const open = fields.filter((f) => decisionFor(f).state === 'pending').length;

  const extract = async () => {
    setSection('dataset');
    if (loading) return;
    setLoading(true);
    setExtracted(true);
    setRuns((n) => n + 1);
    setReview(null);
    try {
      setReview(await post<AgentResult>('/api/ideas/50/review'));
    } catch {
      setError('The assistant could not be reached.');
    } finally {
      setLoading(false);
    }
  };

  const decide = (field: Field, state: Decision['state'], value?: string) =>
    setDecisions((d) => ({ ...d, [field.id]: { state, value: value ?? decisionFor(field).value } }));

  const storyStep = section === 'dataset' ? (extracted ? 'confirm' : 'extract') : section;

  return (
    <HospitalShell
      module="Tumour board preparation · minimal dataset"
      guide={
        <StoryGuide
          steps={story}
          current={storyStep}
          onGo={(id) => {
            if (id === 'extract' || (id === 'confirm' && !extracted)) {
              void extract();
              return;
            }
            setSection(id === 'confirm' ? 'dataset' : (id as Section));
          }}
          nextLabel={section === 'sources' ? 'Let the assistant read all four' : undefined}
        />
      }
      nav={[
        { id: 'sources', label: 'Incoming documents', badge: data?.documents.length ?? 0 },
        { id: 'dataset', label: 'Minimal dataset', badge: extracted ? open || '✓' : undefined },
        { id: 'mdt', label: 'MDT overview', badge: confirmed.length || undefined },
        { id: 'registry', label: 'Registry & research', badge: confirmed.length || undefined },
      ]}
      active={section}
      onNav={(id) => setSection(id as Section)}
      patient={
        data
          ? {
              id: String(data.patient.id),
              name: String(data.patient.name),
              age: Number(data.patient.age),
              sex: String(data.patient.sex),
              diagnosis: String(data.patient.diagnosis),
              ward: String(data.patient.mdt),
            }
          : null
      }
      toolbar={
        <>
          <span>
            Dataset: <strong>Health ReWireD minimal dataset · metastatic colorectal cancer</strong>
          </span>
          <span className="hx-spacer" />
          <span>
            {confirmed.length}/{fields.length} confirmed
          </span>
          <button type="button" className="hx-btn primary" onClick={() => void extract()} disabled={loading}>
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Reading the records…
              </>
            ) : (
              'Read the records'
            )}
          </button>
        </>
      }
    >
      {error && <Panel title="Information">{error}</Panel>}
      {!data && !error && (
        <Panel title="Patient file">
          <Working label="Loading the synthetic case" />
        </Panel>
      )}
      {data && section === 'sources' && (
        <div className="hx-grid">
          <Panel title="Documents received for this patient">
            <DataTable
              rowKey={(d) => d.id}
              rows={data.documents}
              selected={openDoc}
              onSelect={(d) => setOpenDoc(d.id)}
              columns={[
                { key: 'date', label: 'Date', width: '96px' },
                { key: 'flag', label: 'Lang', width: '64px', render: (d) => <Pill tone="info">{d.flag}</Pill> },
                { key: 'kind', label: 'Document', render: (d) => <strong>{d.kind}</strong> },
                { key: 'hospital', label: 'Sending hospital' },
                { key: 'format', label: 'Format', render: () => 'Free text' },
              ]}
            />
            <p className="hx-empty" style={{ display: 'block', marginTop: 8 }}>
              Nothing here is structured: stage, performance status, molecular results and previous treatments are
              sentences in four languages. Click a row to read the original.
            </p>
          </Panel>
          <Panel title={data.documents.find((d) => d.id === openDoc)?.kind ?? 'Select a document'}>
            {openDoc ? (
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                {data.documents.find((d) => d.id === openDoc)?.text}
              </pre>
            ) : (
              <span className="hx-empty">Open one of the documents to see the original text.</span>
            )}
          </Panel>
        </div>
      )}
      {data && section === 'dataset' && (
        <>
          <Panel
            title="Minimal dataset for the tumour board"
            actions={
              <>
                <Pill tone={open === 0 ? 'ok' : 'warn'}>{open === 0 ? 'All values decided' : `${open} still open`}</Pill>
                <Pill tone="info">{confirmed.length} confirmed</Pill>
              </>
            }
          >
            {!extracted ? (
              <span className="hx-empty">
                Press “Read the records” above. The assistant reads all four documents and proposes the dataset – you
                decide what is recorded.
              </span>
            ) : (
              <>
                <Backstage
                  key={runs}
                  title="Behind the scenes – what the assistant is doing"
                  stages={extractStages}
                  running={extracted}
                  holdLast
                  release={!loading}
                  note="Values and evidence come from the four synthetic reports; the review below is the Copilot SDK agent (or its demo fallback)."
                />
                <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                  {fields.map((field) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      document={(id) => data.documents.find((d) => d.id === id)}
                      decision={decisionFor(field)}
                      onDecide={decide}
                    />
                  ))}
                </div>
              </>
            )}
          </Panel>
          {extracted && (
            <Panel
              title={review ? review.headline : 'Assistant review – what needs a human decision'}
              actions={
                review && (
                  <Pill tone={review.mode === 'copilot' ? 'ok' : 'neutral'}>
                    {review.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
                  </Pill>
                )
              }
            >
              {loading && <Working label="The assistant is reading four languages" hint="AI answers can take up to a minute" />}
              {review && (
                <div className="blocks">
                  {review.note && <p className="note">{review.note}</p>}
                  {review.blocks.map((block, index) => (
                    <RenderBlock key={index} block={block} />
                  ))}
                </div>
              )}
            </Panel>
          )}
        </>
      )}
      {data && section === 'mdt' && (
        <Panel title="MDT overview · Gastrointestinal tumour board · Thursday 08:00">
          <DataTable
            rowKey={(f) => f.id}
            rows={fields}
            rowTone={(f) => (decisionFor(f).state === 'pending' ? 'warn' : undefined)}
            columns={[
              { key: 'label', label: 'Dataset item', width: '220px' },
              {
                key: 'value',
                label: 'Value shown to the board',
                render: (f) => {
                  const d = decisionFor(f);
                  if (d.state === 'confirmed') return <strong>{d.value}</strong>;
                  if (d.state === 'unknown') return <em>Unknown – confirmed as not documented</em>;
                  return <em>Awaiting confirmation – not shown to the board</em>;
                },
              },
              {
                key: 'state',
                label: 'Status',
                width: '150px',
                render: (f) => {
                  const d = decisionFor(f);
                  return (
                    <Pill tone={d.state === 'confirmed' ? 'ok' : d.state === 'unknown' ? 'neutral' : 'warn'}>
                      {d.state === 'confirmed' ? 'Confirmed' : d.state === 'unknown' ? 'Unknown' : 'Open'}
                    </Pill>
                  );
                },
              },
            ]}
          />
          <p className="hx-empty" style={{ display: 'block', marginTop: 8 }}>
            Nothing was retyped: every confirmed value came from the source documents and was approved by a clinician.
          </p>
        </Panel>
      )}
      {data && section === 'registry' && (
        <div className="hx-grid">
          <Panel
            title="Cancer registry submission (draft)"
            actions={
              <button
                type="button"
                className="hx-btn primary"
                disabled={released || confirmed.length === 0}
                onClick={() => setReleased(true)}
              >
                {released ? 'Released for registry ✓' : 'Release confirmed values'}
              </button>
            }
          >
            <DataTable
              rowKey={(f) => f.id}
              rows={confirmed}
              empty="No values confirmed yet – confirm them in the minimal dataset first."
              columns={[
                { key: 'label', label: 'Registry item', width: '200px' },
                { key: 'value', label: 'Value', render: (f) => <strong>{decisionFor(f).value}</strong> },
                { key: 'coding', label: 'Coding' },
              ]}
            />
            <p className="hx-empty" style={{ display: 'block', marginTop: 8 }}>
              {released
                ? 'Prototype only – nothing is transmitted anywhere. Registry staff would validate before inclusion.'
                : 'Registry staff validate before inclusion; values left unknown are never filled in for them.'}
            </p>
          </Panel>
          <Panel title="Research dataset (OMOP export)">
            <DataTable
              rowKey={(f) => f.id}
              rows={fields}
              empty="Nothing to export yet."
              columns={[
                { key: 'label', label: 'Variable', width: '190px' },
                {
                  key: 'value',
                  label: 'Export value',
                  render: (f) =>
                    decisionFor(f).state === 'confirmed' ? decisionFor(f).value : <em>NULL (not confirmed)</em>,
                },
                {
                  key: 'prov',
                  label: 'Source',
                  width: '90px',
                  render: (f) =>
                    [...new Set(f.evidence.map((e) => data.documents.find((d) => d.id === e.document)?.flag ?? ''))].join(
                      ' · ',
                    ) || '–',
                },
              ]}
            />
          </Panel>
        </div>
      )}
    </HospitalShell>
  );
}

function FieldRow({
  field,
  document,
  decision,
  onDecide,
}: {
  field: Field;
  document: (id: string) => SourceDoc | undefined;
  decision: Decision;
  onDecide: (field: Field, state: Decision['state'], value?: string) => void;
}) {
  const [showEvidence, setShowEvidence] = useState(field.status !== 'ok');
  return (
    <section className="hx-panel">
      <header>
        <h3>
          {field.label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {field.group}</span>
        </h3>
        <div className="hx-panel-actions">
          <Pill tone={statusTone[field.status]}>{statusLabel[field.status]}</Pill>
          <Pill tone="neutral">{confidenceLabel[field.confidence]}</Pill>
          {decision.state === 'confirmed' && <Pill tone="ok">Confirmed</Pill>}
          {decision.state === 'unknown' && <Pill tone="neutral">Marked unknown</Pill>}
        </div>
      </header>
      <div className="hx-panel-body">
        {field.issue && <p style={{ margin: '0 0 6px' }}>{field.issue}</p>}
        <label style={{ display: 'block', marginBottom: 6 }}>
          Value for the record{' '}
          <select value={decision.value} onChange={(e) => onDecide(field, decision.state, e.target.value)}>
            {field.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <div className="chip-row" style={{ gap: 6 }}>
          <button type="button" className="hx-btn primary" onClick={() => onDecide(field, 'confirmed')}>
            Accept this value
          </button>
          <button type="button" className="hx-btn" onClick={() => onDecide(field, 'unknown', 'Unknown')}>
            Mark unknown
          </button>
          {decision.state !== 'pending' && (
            <button type="button" className="hx-btn" onClick={() => onDecide(field, 'pending', field.suggested)}>
              Reopen
            </button>
          )}
          <button type="button" className="hx-btn" onClick={() => setShowEvidence((s) => !s)}>
            {showEvidence ? 'Hide source sentences' : `Show source sentences (${field.evidence.length})`}
          </button>
          <span style={{ fontSize: 11, opacity: 0.7, alignSelf: 'center' }}>{field.coding}</span>
        </div>
        {showEvidence && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
            {field.evidence.map((e) => {
              const doc = document(e.document);
              return (
                <li key={e.quote} style={{ marginBottom: 6 }}>
                  <div>
                    <Pill tone="info">{doc?.flag}</Pill> “{e.quote}”
                  </div>
                  <div style={{ opacity: 0.75 }}>
                    {e.translation} — {doc?.kind}, {doc?.hospital} ({doc?.date})
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
