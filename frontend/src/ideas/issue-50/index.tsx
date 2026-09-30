import { useEffect, useMemo, useState } from 'react';
import { api, type AgentResult } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import {
  Attention,
  ContextBanner,
  Drawer,
  Eyebrow,
  Panel,
  Status,
  Table,
  Workspace,
  useWorkspaceTheme,
  type Tone,
} from './Workspace';
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
      'Contradictions, implied values and gaps are listed first. Accept, correct or mark unknown – nothing is recorded until you do.',
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

const statusTone: Record<Field['status'], Tone> = {
  conflict: 'danger',
  implied: 'warning',
  missing: 'warning',
  ok: 'success',
};

const statusLabel: Record<Field['status'], string> = {
  conflict: 'Sources disagree',
  implied: 'Implied only',
  missing: 'Not documented',
  ok: 'Extracted',
};

const confidenceLabel: Record<Field['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  none: 'No value found',
  conflict: 'Conflicting sources',
};

const decisionTone: Record<Decision['state'], Tone> = {
  confirmed: 'success',
  unknown: 'neutral',
  pending: 'warning',
};

const decisionLabel: Record<Decision['state'], string> = {
  confirmed: 'Confirmed by clinician',
  unknown: 'Recorded as unknown',
  pending: 'Awaiting confirmation',
};

export default function RecordOnceReuseEverywhere() {
  const [theme, setTheme] = useWorkspaceTheme();
  const [section, setSection] = useState<Section>('sources');
  const [data, setData] = useState<Case | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [inspect, setInspect] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState(0);
  const [review, setReview] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [released, setReleased] = useState(false);

  useEffect(() => {
    api
      .idea<Case>(50, 'case')
      .then(setData)
      .catch(() => setError('The synthetic case could not be loaded. The API may not be running.'));
  }, []);

  const fields = useMemo(() => {
    const order = { conflict: 0, missing: 1, implied: 2, ok: 3 };
    return [...(data?.fields ?? [])].sort((a, b) => order[a.status] - order[b.status]);
  }, [data]);

  const decisionFor = (field: Field): Decision => decisions[field.id] ?? { state: 'pending', value: field.suggested };
  const confirmed = fields.filter((f) => decisionFor(f).state === 'confirmed');
  const pending = fields.filter((f) => decisionFor(f).state === 'pending');
  const needsJudgement = fields.filter((f) => f.status !== 'ok');
  const documentById = (id: string) => data?.documents.find((d) => d.id === id);
  const inspected = fields.find((f) => f.id === inspect) ?? null;

  const extract = async () => {
    if (loading) return;
    setSection('dataset');
    setError(null);
    setLoading(true);
    setExtracted(true);
    setRuns((n) => n + 1);
    setReview(null);
    try {
      setReview(await api.idea<AgentResult>(50, 'review', { method: 'POST', body: '{}' }));
    } catch {
      setError('The assistant could not be reached. The extracted dataset below is unaffected.');
    } finally {
      setLoading(false);
    }
  };

  const decide = (field: Field, state: Decision['state'], value?: string) =>
    setDecisions((d) => ({ ...d, [field.id]: { state, value: value ?? decisionFor(field).value } }));

  const storyStep = section === 'dataset' ? (extracted ? 'confirm' : 'extract') : section;
  const goTo = (id: string) => {
    if (id === 'extract' || (id === 'confirm' && !extracted)) {
      void extract();
      return;
    }
    setSection(id === 'confirm' ? 'dataset' : (id as Section));
  };

  return (
    <Workspace
      theme={theme}
      onTheme={setTheme}
      product="Record ReWireD"
      module="Minimal dataset reconciliation"
      organisation="Klinikum Rewired München"
      location="Gastrointestinal tumour board · MDT office"
      headerFacts={[
        { label: 'Coordinator', value: 'S. Keller' },
        { label: 'Board', value: 'Thu 08:00' },
        { label: 'Sources', value: `${data?.documents.length ?? 0} documents · 4 languages` },
      ]}
      banner={
        <ContextBanner
          identity={data ? String(data.patient.name) : 'Loading patient…'}
          subIdentity={data ? `${data.patient.id} · ${data.patient.age} y · ${data.patient.sex}` : '—'}
          facts={[
            { label: 'Diagnosis', value: data ? String(data.patient.diagnosis) : '—' },
            { label: 'Dataset', value: 'Health ReWireD minimal dataset' },
            {
              label: 'Confirmed',
              value: `${confirmed.length} of ${fields.length || '—'}`,
            },
            {
              label: 'Needs judgement',
              value: extracted ? `${needsJudgement.length} values` : 'Not assessed yet',
            },
          ]}
          action={
            <button type="button" className="rr-btn quiet" onClick={() => setSection('sources')}>
              Open source documents
            </button>
          }
        />
      }
      guide={<StoryGuide steps={story} current={storyStep} onGo={goTo} nextLabel={section === 'sources' ? 'Read all four records' : undefined} />}
      workspaces={[
        {
          id: 'sources',
          label: 'Incoming documents',
          count: data?.documents.length ?? 0,
          state: 'NL · FR · IT · DE, free text',
        },
        {
          id: 'dataset',
          label: 'Minimal dataset',
          count: extracted ? `${confirmed.length}/${fields.length}` : '—',
          state: extracted ? `${pending.length} awaiting confirmation` : 'Not extracted yet',
        },
        {
          id: 'mdt',
          label: 'MDT overview',
          count: confirmed.length,
          state: confirmed.length ? 'Shows confirmed values' : 'Nothing confirmed yet',
        },
        {
          id: 'registry',
          label: 'Registry & research',
          count: confirmed.length,
          state: released ? 'Released (prototype)' : 'Draft, not transmitted',
        },
      ]}
      active={section}
      onNavigate={(id) => setSection(id as Section)}
      toolbar={
        <>
          <div className="rr-toolbar-dataset">
            <Eyebrow>Working set</Eyebrow>
            <strong>Metastatic colorectal cancer · 8 dataset items · 4 sending hospitals</strong>
          </div>
          <div className="rr-progress">
            <span>
              {confirmed.length} of {fields.length || 0} confirmed
            </span>
            <span
              className="rr-meter"
              role="img"
              aria-label={`${confirmed.length} of ${fields.length || 0} dataset values confirmed`}
            >
              <span style={{ width: `${fields.length ? (confirmed.length / fields.length) * 100 : 0}%` }} />
            </span>
          </div>
          <button type="button" className="rr-btn primary" onClick={() => void extract()} disabled={loading}>
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Reading the records…
              </>
            ) : extracted ? (
              'Read the records again'
            ) : (
              'Read the records'
            )}
          </button>
        </>
      }
      drawer={
        inspected && (
          <Drawer eyebrow="Inspectable by design" title={inspected.label} onClose={() => setInspect(null)}>
            <dl className="rr-dl">
              <dt>Proposed</dt>
              <dd>{inspected.suggested}</dd>
              <dt>Recorded</dt>
              <dd>
                {decisionFor(inspected).state === 'pending' ? (
                  <em>Nothing recorded yet</em>
                ) : (
                  decisionFor(inspected).value
                )}
              </dd>
              <dt>Coding</dt>
              <dd className="rr-mono">{inspected.coding}</dd>
              <dt>Confidence</dt>
              <dd>{confidenceLabel[inspected.confidence]}</dd>
              <dt>State</dt>
              <dd>{statusLabel[inspected.status]}</dd>
            </dl>
            {inspected.issue && <p className="rr-note">{inspected.issue}</p>}
            <div>
              <Eyebrow>Claim → evidence → source</Eyebrow>
              <Quotes field={inspected} documentById={documentById} />
            </div>
            {inspected.evidence.map((item) => {
              const doc = documentById(item.document);
              if (!doc) return null;
              return (
                <details key={`${item.document}-${item.quote}`}>
                  <summary>
                    Full {doc.kind.toLowerCase()} · {doc.language} · {doc.hospital}
                  </summary>
                  <div>
                    <pre className="rr-reader">{doc.text}</pre>
                  </div>
                </details>
              );
            })}
          </Drawer>
        )
      }
    >
      {error && (
        <Attention
          tone="danger"
          status="Retrieval failed"
          headline="Part of this screen could not be loaded"
          detail={error}
          action={
            <button type="button" className="rr-btn small" onClick={() => void extract()}>
              Try again
            </button>
          }
        />
      )}
      {!data && !error && (
        <Panel eyebrow="Loading" title="Patient file">
          <Working label="Loading the synthetic case" />
        </Panel>
      )}

      {data && section === 'sources' && (
        <>
          <Attention
            tone="warning"
            status="Nothing structured yet"
            headline="Four free-text documents, four languages, no shared dataset"
            detail="Stage, performance status, molecular results and previous treatments exist only as sentences. Today they are retyped for the board, the registry and every study."
            action={
              <button type="button" className="rr-btn primary" onClick={() => void extract()} disabled={loading}>
                {loading ? (
                  <>
                    <span className="hx-spinner" aria-hidden /> Reading…
                  </>
                ) : (
                  'Read all four records'
                )}
              </button>
            }
          />
          <div className="rr-split">
            <Panel eyebrow="Received records" title="Documents held for this patient">
              <Table
                caption="Documents received from the sending hospitals"
                rowKey={(d: SourceDoc) => d.id}
                rows={data.documents}
                selected={openDoc}
                onSelect={(d) => setOpenDoc(d.id)}
                columns={[
                  { key: 'date', label: 'Received', width: '104px', render: (d) => <span className="rr-mono">{d.date}</span> },
                  { key: 'flag', label: 'Language', width: '96px', render: (d) => <span className="rr-lang">{d.flag}</span> },
                  { key: 'kind', label: 'Document', render: (d) => <strong>{d.kind}</strong> },
                  { key: 'hospital', label: 'Sending hospital', render: (d) => d.hospital },
                  { key: 'format', label: 'Format', width: '90px', render: () => <em>Free text</em> },
                ]}
              />
              <p className="rr-note">Select a row to read the original wording. No value in this table is machine-readable.</p>
            </Panel>
            <Panel
              eyebrow="Original source"
              title={documentById(openDoc ?? '')?.kind ?? 'No document selected'}
              actions={
                openDoc && (
                  <>
                    <span className="rr-lang">{documentById(openDoc)?.flag}</span>
                    <Status tone="info">{documentById(openDoc)?.language}</Status>
                  </>
                )
              }
            >
              {openDoc ? (
                <>
                  <p className="rr-mono" style={{ margin: '0 0 8px' }}>
                    {documentById(openDoc)?.path}
                  </p>
                  <pre className="rr-reader">{documentById(openDoc)?.text}</pre>
                </>
              ) : (
                <p className="rr-empty">Open one of the documents on the left to see exactly what was sent.</p>
              )}
            </Panel>
          </div>
        </>
      )}

      {data && section === 'dataset' && (
        <>
          {!extracted ? (
            <Panel eyebrow="Current task" title="Minimal dataset for the tumour board">
              <p className="rr-empty">
                Select “Read the records”. The assistant reads all four documents and proposes each value with the
                sentence it came from – you decide what is recorded.
              </p>
            </Panel>
          ) : (
            <>
              <Attention
                tone={pending.length === 0 ? 'success' : 'warning'}
                status={pending.length === 0 ? 'All values decided' : 'Human review required'}
                headline={
                  pending.length === 0
                    ? `${confirmed.length} values confirmed, ${fields.length - confirmed.length} recorded as unknown`
                    : `${pending.length} of ${fields.length} values still need a clinician`
                }
                detail={
                  pending.length === 0
                    ? 'The MDT overview, the registry draft and the research export now reflect exactly what a person confirmed.'
                    : 'A KRAS contradiction, an implied performance score and a missing MSI result are listed first. Nothing reaches the board, the registry or research until you accept, correct or mark each value unknown.'
                }
                action={
                  pending.length > 0 ? (
                    <button type="button" className="rr-btn small" onClick={() => setInspect(pending[0].id)}>
                      Inspect {pending[0].label.toLowerCase()}
                    </button>
                  ) : (
                    <button type="button" className="rr-btn small" onClick={() => setSection('mdt')}>
                      Open MDT overview
                    </button>
                  )
                }
              />
              <Panel
                eyebrow="Extraction activity"
                title="What the assistant did with the four records"
                actions={
                  review && (
                    <Status tone={review.mode === 'copilot' ? 'success' : 'neutral'}>
                      {review.mode === 'copilot' ? 'Live Copilot agent' : 'Demo mode – no token configured'}
                    </Status>
                  )
                }
              >
                <Backstage
                  key={runs}
                  title="Live activity"
                  stages={extractStages}
                  running={extracted}
                  holdLast
                  release={!loading}
                  note="Values and quotes come from the four synthetic reports; the account below is the Copilot SDK agent’s public summary (or its deterministic demo fallback)."
                />
                <div style={{ marginTop: 16 }}>
                  <Eyebrow>Reasoning path · public summary</Eyebrow>
                  <ol className="rr-reasoning" style={{ marginTop: 8 }}>
                    <ReasoningStep label="Trying to answer" text="Which minimal-dataset values can be taken from these records for Thursday's board?" />
                    <ReasoningStep label="Considered" text="Four free-text documents in Dutch, French, Italian and German from four hospitals." />
                    <ReasoningStep
                      label="This showed"
                      text={`${fields.length - needsJudgement.length} values stated plainly in at least one report, each with a quotable sentence.`}
                    />
                    <ReasoningStep
                      label="But this remains uncertain"
                      text={needsJudgement.map((f) => f.label).join('; ') || 'Nothing.'}
                    />
                    <ReasoningStep
                      label="So the current conclusion is"
                      text="The dataset is proposed, not recorded. No value was invented where the records are silent."
                    />
                    <ReasoningStep label="Next" text="A clinician accepts, corrects or marks unknown each value below." />
                  </ol>
                </div>
                {loading && (
                  <p className="rr-note">
                    <Working label="The assistant is reading four languages" hint="AI answers can take up to a minute" />
                  </p>
                )}
                {review && (
                  <div style={{ marginTop: 16 }}>
                    <Eyebrow>Assistant account</Eyebrow>
                    <h4 style={{ margin: '3px 0 10px', fontSize: 15 }}>{review.headline}</h4>
                    {review.note && <p className="rr-note" style={{ marginTop: 0 }}>{review.note}</p>}
                    <div className="blocks">
                      {review.blocks.map((block, index) => (
                        <RenderBlock key={index} block={block} />
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
              <Panel
                eyebrow="Current task · human decision"
                title="Minimal dataset for the tumour board"
                actions={
                  <>
                    <Status tone={pending.length === 0 ? 'success' : 'warning'}>
                      {pending.length === 0 ? 'All decided' : `${pending.length} open`}
                    </Status>
                    <Status tone="info">{confirmed.length} confirmed</Status>
                  </>
                }
              >
                <div className="rr-values">
                  {fields.map((field) => (
                    <ValueCard
                      key={field.id}
                      field={field}
                      decision={decisionFor(field)}
                      documentById={documentById}
                      onDecide={decide}
                      onInspect={() => setInspect(field.id)}
                    />
                  ))}
                </div>
              </Panel>
            </>
          )}
        </>
      )}

      {data && section === 'mdt' && (
        <>
          <Attention
            tone={confirmed.length === 0 ? 'warning' : 'success'}
            status={confirmed.length === 0 ? 'Board view empty' : 'Reused without retyping'}
            headline={
              confirmed.length === 0
                ? 'No value has been confirmed yet'
                : `${confirmed.length} confirmed values are on the board sheet`
            }
            detail={
              confirmed.length === 0
                ? 'Go to the minimal dataset and accept, correct or mark each value unknown. The board only ever sees values a person confirmed.'
                : 'Every value below came from a source document and was approved by a clinician. Unconfirmed items stay visibly open rather than being guessed.'
            }
            action={
              <button type="button" className="rr-btn small" onClick={() => setSection('dataset')}>
                Open minimal dataset
              </button>
            }
          />
          <Panel eyebrow="Tumour board sheet" title="Gastrointestinal tumour board · Thursday 08:00">
            <Table
              caption="Values available to the tumour board"
              rowKey={(f: Field) => f.id}
              rows={fields}
              columns={[
                { key: 'label', label: 'Dataset item', width: '210px', render: (f) => <strong>{f.label}</strong> },
                {
                  key: 'value',
                  label: 'Value shown to the board',
                  render: (f) => {
                    const d = decisionFor(f);
                    if (d.state === 'confirmed') return d.value;
                    if (d.state === 'unknown') return <em>Unknown – recorded as not documented</em>;
                    return <em>Not shown – awaiting confirmation</em>;
                  },
                },
                {
                  key: 'state',
                  label: 'Status',
                  width: '190px',
                  render: (f) => <Status tone={decisionTone[decisionFor(f).state]}>{decisionLabel[decisionFor(f).state]}</Status>,
                },
                {
                  key: 'inspect',
                  label: 'Provenance',
                  width: '120px',
                  render: (f) => (
                    <button
                      type="button"
                      className="rr-btn quiet small"
                      aria-label={`Inspect evidence for ${f.label}`}
                      onClick={() => setInspect(f.id)}
                    >
                      Inspect
                    </button>
                  ),
                },
              ]}
            />
          </Panel>
        </>
      )}

      {data && section === 'registry' && (
        <>
          <Attention
            tone="warning"
            status="Prototype – nothing is transmitted"
            headline="Confirmed values are staged for the cancer registry and research"
            detail="Registry staff validate before inclusion. Values a clinician left unknown are exported as unknown; they are never filled in on their behalf."
            action={
              <button
                type="button"
                className="rr-btn primary"
                disabled={released || confirmed.length === 0}
                onClick={() => setReleased(true)}
              >
                {released ? 'Released to registry queue ✓' : 'Release confirmed values'}
              </button>
            }
          />
          <div className="rr-split">
            <Panel
              eyebrow="Cancer registry"
              title="Registry submission (draft)"
              actions={<Status tone={released ? 'success' : 'neutral'}>{released ? 'Queued (prototype)' : 'Draft'}</Status>}
            >
              <Table
                caption="Confirmed values staged for the cancer registry"
                rowKey={(f: Field) => f.id}
                rows={confirmed}
                empty="No values confirmed yet – confirm them in the minimal dataset first."
                columns={[
                  { key: 'label', label: 'Registry item', width: '190px', render: (f) => <strong>{f.label}</strong> },
                  { key: 'value', label: 'Value', render: (f) => decisionFor(f).value },
                  { key: 'coding', label: 'Coding', render: (f) => <span className="rr-mono">{f.coding}</span> },
                ]}
              />
              <p className="rr-note">
                {released
                  ? 'This prototype queues nothing and sends nothing. In production a registry officer would validate each row before inclusion.'
                  : 'Releasing is an explicit action, and only values a clinician confirmed are included.'}
              </p>
            </Panel>
            <Panel eyebrow="Research dataset" title="OMOP-style export">
              <Table
                caption="Research export with source provenance"
                rowKey={(f: Field) => f.id}
                rows={fields}
                columns={[
                  { key: 'label', label: 'Variable', width: '180px', render: (f) => <strong>{f.label}</strong> },
                  {
                    key: 'value',
                    label: 'Export value',
                    render: (f) =>
                      decisionFor(f).state === 'confirmed' ? decisionFor(f).value : <em>NULL – not confirmed</em>,
                  },
                  {
                    key: 'prov',
                    label: 'Source',
                    width: '110px',
                    render: (f) => (
                      <span className="rr-mono">
                        {[...new Set(f.evidence.map((e) => documentById(e.document)?.flag ?? ''))].join(' · ') || '–'}
                      </span>
                    ),
                  },
                ]}
              />
              <p className="rr-note">
                Unconfirmed variables export as NULL rather than as a plausible guess, so a study can tell missing data
                from recorded data.
              </p>
            </Panel>
          </div>
        </>
      )}
    </Workspace>
  );
}

function ReasoningStep({ label, text }: { label: string; text: string }) {
  return (
    <li>
      <div>
        <strong>{label}</strong>
        <span>{text}</span>
      </div>
    </li>
  );
}

function Quotes({ field, documentById }: { field: Field; documentById: (id: string) => SourceDoc | undefined }) {
  if (field.evidence.length === 0) return <p className="rr-empty">No sentence in any record supports a value here.</p>;
  return (
    <ul className="rr-quotes">
      {field.evidence.map((item, index) => {
        const doc = documentById(item.document);
        return (
          <li key={`${item.document}-${index}`}>
            <p className="rr-quote-original">
              <span className="rr-lang">{doc?.flag}</span>
              <span>“{item.quote}”</span>
            </p>
            <p className="rr-quote-translation">{item.translation}</p>
            <span className="rr-quote-source">
              {doc?.kind} · {doc?.hospital} · {doc?.date} · {doc?.path}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ValueCard({
  field,
  decision,
  documentById,
  onDecide,
  onInspect,
}: {
  field: Field;
  decision: Decision;
  documentById: (id: string) => SourceDoc | undefined;
  onDecide: (field: Field, state: Decision['state'], value?: string) => void;
  onInspect: () => void;
}) {
  const [showQuotes, setShowQuotes] = useState(field.status !== 'ok');
  const selectId = `rr-value-${field.id}`;
  return (
    <article className="rr-value" data-status={field.status}>
      <header>
        <div className="rr-panel-head-text">
          <Eyebrow>{field.group}</Eyebrow>
          <h4>{field.label}</h4>
        </div>
        <div className="rr-value-badges">
          <Status tone={statusTone[field.status]}>{statusLabel[field.status]}</Status>
          <Status>{confidenceLabel[field.confidence]}</Status>
          <Status tone={decisionTone[decision.state]}>{decisionLabel[decision.state]}</Status>
        </div>
      </header>
      {field.issue && <p className="rr-value-issue">{field.issue}</p>}
      <label className="rr-field-label" htmlFor={selectId}>
        <Eyebrow>Value to record</Eyebrow>
        <select id={selectId} value={decision.value} onChange={(e) => onDecide(field, 'pending', e.target.value)}>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <div className="rr-actions">
        <button type="button" className="rr-btn primary" onClick={() => onDecide(field, 'confirmed')}>
          Confirm this value
        </button>
        <button type="button" className="rr-btn" onClick={() => onDecide(field, 'unknown', 'Unknown')}>
          Record as unknown
        </button>
        {decision.state !== 'pending' && (
          <button type="button" className="rr-btn" onClick={() => onDecide(field, 'pending', field.suggested)}>
            Reopen for review
          </button>
        )}
        <button type="button" className="rr-btn quiet" onClick={() => setShowQuotes((s) => !s)}>
          {showQuotes ? 'Hide source sentences' : `Show source sentences (${field.evidence.length})`}
        </button>
        <button type="button" className="rr-btn quiet" onClick={onInspect}>
          Open evidence & provenance
        </button>
        <span className="rr-mono">{field.coding}</span>
      </div>
      {showQuotes && <Quotes field={field} documentById={documentById} />}
    </article>
  );
}
