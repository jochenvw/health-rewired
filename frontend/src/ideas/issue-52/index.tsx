import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, HospitalShell, Panel, Pill, Tabs } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './issue-52.css';

export const meta: IdeaMeta = {
  id: '52',
  issue: 52,
  title: 'Say the tumour board decision in words the patient and the GP understand',
  tagline:
    'After the MDT: an explanation in the patient’s own language and reading level, a matching GP letter and questions to check understanding – every sentence traceable, nothing sent without your approval.',
};

type CaseRow = {
  patient_id: string;
  name: string;
  age: number;
  diagnosis: string;
  board: string;
  decision: string;
  consultation: string;
  language: string;
  language_label: string;
  reading_level: string;
  interpreter_needed: boolean;
};

type CaseSource = { id: string; title: string; path: string; text: string };
type CaseOption = { name: string; benefit: string; drawback: string; source_id: string };

type CaseDetail = {
  patient_id: string;
  name: string;
  age: number;
  sex: string;
  diagnosis: string;
  stage: string;
  board: string;
  decision: string;
  consultation: string;
  communication: {
    preferred_language?: string;
    preferred_language_label?: string;
    health_literacy?: string;
    reading_level?: string;
    interpreter_needed?: boolean;
    support_person?: string;
  };
  options: CaseOption[];
  sources: CaseSource[];
  timeline: { date: string; event: string }[];
  open_questions: string[];
};

type Sentence = { id: string; text: string; source_id: string; source_title: string; risk?: string | null };
type Question = { question: string; expected_answer: string };

type Explanation = {
  mode: 'copilot' | 'fallback';
  patient_id: string;
  language: string;
  language_label: string;
  reading_level: string;
  headline: string;
  patient_sentences: Sentence[];
  gp_sentences: Sentence[];
  questions: Question[];
  trace: { tool: string; arguments?: string | null }[];
  note?: string | null;
};

// Idea-local fetch helper, so this idea never touches the shared api.ts.
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/ideas/52${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

const languages = [
  { code: 'nl', label: 'Nederlands (Dutch)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'en', label: 'English' },
];

const readingLevels = [
  { code: 'simple', label: 'Simple – short sentences (~B1)' },
  { code: 'detailed', label: 'Detailed – full explanation, numbers' },
];

type WorkRow = {
  patient_id: string;
  name: string;
  diagnosis: string;
  consultation: string;
  language_label: string;
  decision: string;
  interpreter_needed: boolean;
  status: string;
  demo: boolean;
};

// Other consultations on the same list, so the screen looks like a real afternoon.
const otherConsultations: WorkRow[] = [
  {
    patient_id: 'X-518',
    name: 'Bernd Schuster',
    diagnosis: 'Gastric ca. cT3N1',
    consultation: 'Post-MDT · 09:40',
    language_label: 'Deutsch',
    decision: 'Perioperative FLOT, surgery after 4 cycles',
    interpreter_needed: false,
    status: 'Explanation signed',
    demo: false,
  },
  {
    patient_id: 'X-522',
    name: 'Aisha Osman',
    diagnosis: 'Breast ca. cT2N1',
    consultation: 'Post-MDT · 10:30',
    language_label: 'Soomaali',
    decision: 'Neoadjuvant chemotherapy, sentinel node after response',
    interpreter_needed: true,
    status: 'Waiting for draft',
    demo: false,
  },
  {
    patient_id: 'X-530',
    name: 'Pawel Nowak',
    diagnosis: 'Rectal ca. ypT2N0',
    consultation: 'Post-op result · 15:10',
    language_label: 'Polski',
    decision: 'No adjuvant chemotherapy, follow-up schedule',
    interpreter_needed: false,
    status: 'Waiting for draft',
    demo: false,
  },
];

const story: StoryStep[] = [
  {
    id: 'worklist',
    title: 'Post-MDT consultations',
    explain: 'Patients who were discussed at this week’s tumour board and still have to hear the outcome. Open Sanne de Vries.',
  },
  {
    id: 'mdt',
    title: 'What the board decided',
    explain: 'The MDT conclusion with the pathology and MRI reports behind it – and what this patient can read and understand.',
  },
  {
    id: 'explanation',
    title: 'Draft in her language',
    explain: 'The assistant writes the explanation in Dutch at her reading level. Every sentence keeps a link to the report it came from.',
  },
  {
    id: 'approve',
    title: 'Edit and approve',
    explain: 'Change any sentence, check its source, and approve sentence by sentence. Nothing reaches the patient before you do.',
  },
  {
    id: 'gp',
    title: 'Letter to the GP',
    explain: 'The same decision as a German letter for the GP, built from the same sources – so both versions say the same thing.',
  },
  {
    id: 'check',
    title: 'Check understanding',
    explain: 'Three questions to ask during the consultation, then send the approved explanation to the patient portal.',
  },
];

const stages: Stage[] = [
  { label: 'Opening the MDT conclusion', detail: 'Board decision, options, benefits and drawbacks', ms: 700 },
  { label: 'Reading the pathology and imaging reports', detail: 'Restaging MRI, endoscopy, biopsies', ms: 800 },
  { label: 'Reading the patient profile', detail: 'Preferred language, health literacy, support person', ms: 600 },
  { label: 'Writing sentence by sentence, each linked to its source', ms: 900 },
  { label: 'Flagging sentences that are easily misunderstood', ms: 800 },
  { label: 'Writing the matching GP letter and comprehension questions' },
];

type Section = 'worklist' | 'mdt' | 'explanation' | 'gp' | 'check';

export default function MDTExplanation() {
  const [section, setSection] = useState<Section>('worklist');
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [patientId, setPatientId] = useState('P-010');
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [language, setLanguage] = useState('nl');
  const [readingLevel, setReadingLevel] = useState('simple');
  const [draft, setDraft] = useState<Explanation | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sentToPortal, setSentToPortal] = useState(false);
  const [letterFiled, setLetterFiled] = useState(false);
  const [asked, setAsked] = useState<Record<number, 'understood' | 'repeat'>>({});

  useEffect(() => {
    call<CaseRow[]>('/cases').then(setCases).catch(() => setCases([]));
  }, []);

  useEffect(() => {
    setDetail(null);
    setDraft(null);
    setSentToPortal(false);
    setLetterFiled(false);
    setAsked({});
    call<CaseDetail>(`/case/${patientId}`)
      .then((data) => {
        setDetail(data);
        setOpenSource(data.sources[0]?.id ?? null);
        if (data.communication.preferred_language) setLanguage(data.communication.preferred_language);
        if (data.communication.reading_level) setReadingLevel(data.communication.reading_level);
      })
      .catch(() => setError('Could not open this case.'));
  }, [patientId]);

  const runDraft = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRuns((n) => n + 1);
    setDraft(null);
    setEdits({});
    setApproved(new Set());
    setSentToPortal(false);
    setLetterFiled(false);
    try {
      setDraft(await call<Explanation>('/explain', { patient_id: patientId, language, reading_level: readingLevel }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant could not be reached.');
    } finally {
      setLoading(false);
    }
  }, [patientId, language, readingLevel]);

  const go = (id: string) => {
    const target = (id === 'approve' ? 'explanation' : id) as Section;
    setSection(target);
    if (['explanation', 'approve', 'gp', 'check'].includes(id) && !draft && !loading) void runDraft();
  };

  const patientSentences = draft?.patient_sentences ?? [];
  const allApproved = patientSentences.length > 0 && patientSentences.every((s) => approved.has(s.id));
  const storyStep = section === 'explanation' && approved.size > 0 ? 'approve' : section;
  const textOf = (s: Sentence) => edits[s.id] ?? s.text;
  const workRows: WorkRow[] = [
    ...cases.map((c) => ({
      patient_id: c.patient_id,
      name: c.name,
      diagnosis: c.diagnosis,
      consultation: c.consultation,
      language_label: c.language_label,
      decision: c.decision,
      interpreter_needed: c.interpreter_needed,
      status: 'Not drafted',
      demo: true,
    })),
    ...otherConsultations,
  ];
  const sourceById = useMemo(
    () => new Map((detail?.sources ?? []).map((source) => [source.id, source])),
    [detail],
  );

  return (
    <HospitalShell
      module="Tumour board · post-MDT communication"
      guide={<StoryGuide steps={story} current={storyStep} onGo={go} nextLabel={section === 'worklist' ? 'Open Sanne de Vries' : undefined} />}
      nav={[
        { id: 'worklist', label: 'Post-MDT list', badge: cases.length + otherConsultations.length },
        { id: 'mdt', label: 'Board decision & reports', badge: detail?.sources.length },
        { id: 'explanation', label: 'Patient explanation', badge: approved.size || undefined },
        { id: 'gp', label: 'GP letter' },
        { id: 'check', label: 'Understanding check' },
      ]}
      active={section}
      onNav={(id) => go(id)}
      patient={
        section === 'worklist' || !detail
          ? null
          : {
              id: detail.patient_id,
              name: detail.name,
              age: detail.age,
              sex: detail.sex,
              diagnosis: `${detail.diagnosis} · ${detail.stage}`,
              ward: 'Colorectal outpatient clinic',
            }
      }
      toolbar={
        <>
          <label>
            Patient{' '}
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {cases.map((c) => (
                <option key={c.patient_id} value={c.patient_id}>
                  {c.name} ({c.patient_id})
                </option>
              ))}
            </select>
          </label>
          <label>
            Language{' '}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reading level{' '}
            <select value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
              {readingLevels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button
            type="button"
            className="hx-btn primary"
            disabled={loading}
            onClick={() => {
              setSection('explanation');
              void runDraft();
            }}
          >
            {loading ? (
              <>
                <span className="hx-spinner" aria-hidden /> Drafting…
              </>
            ) : draft ? (
              'Draft again'
            ) : (
              'Draft explanation'
            )}
          </button>
        </>
      }
    >
      {error && <Panel title="Information">{error}</Panel>}

      {section === 'worklist' && (
        <Panel title="Patients discussed at the tumour board who still have to hear the outcome">
          <DataTable
            rowKey={(r) => r.patient_id}
            rows={workRows}
            selected={patientId}
            onSelect={(r) => {
              if (!r.demo) {
                setError('This consultation is not part of the synthetic demo data. Open one of the two highlighted patients.');
                return;
              }
              setError(null);
              setPatientId(r.patient_id);
              setSection('mdt');
            }}
            columns={[
              { key: 'consultation', label: 'Consultation', width: '210px' },
              { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
              { key: 'diagnosis', label: 'Diagnosis' },
              { key: 'decision', label: 'Board outcome' },
              {
                key: 'language_label',
                label: 'Reads',
                render: (r) => (
                  <>
                    <Pill tone="info">{r.language_label}</Pill> {r.interpreter_needed && <Pill tone="warn">Interpreter</Pill>}
                  </>
                ),
              },
              {
                key: 'status',
                label: 'Explanation',
                render: (r) => <Pill tone={r.status === 'Explanation signed' ? 'ok' : 'warn'}>{r.status}</Pill>,
              },
            ]}
          />
        </Panel>
      )}

      {section === 'mdt' && (detail ? <BoardDecision detail={detail} /> : <Panel title="Board decision"><Working label="Opening the case" /></Panel>)}

      {section === 'explanation' && (
        <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(360px, 3fr) minmax(280px, 2fr)' }}>
          <Panel
            title={draft ? draft.headline : 'Explanation for the patient'}
            actions={
              draft && (
                <>
                  <Pill tone={draft.mode === 'copilot' ? 'ok' : 'neutral'}>{draft.mode === 'copilot' ? 'Live AI' : 'Demo mode'}</Pill>
                  <Pill tone="info">{draft.language_label}</Pill>
                  <Pill tone="info">{draft.reading_level === 'simple' ? 'Simple' : 'Detailed'}</Pill>
                  <Pill tone={allApproved ? 'ok' : 'warn'}>
                    {approved.size}/{patientSentences.length} approved
                  </Pill>
                  <button
                    type="button"
                    className="hx-btn primary"
                    disabled={!allApproved || sentToPortal}
                    onClick={() => {
                      setSentToPortal(true);
                      setSection('check');
                    }}
                  >
                    {sentToPortal ? 'Sent to patient portal ✓' : 'Send approved text to patient portal'}
                  </button>
                </>
              )
            }
          >
            <Backstage
              key={runs}
              title="Behind the scenes – what the assistant is doing"
              stages={stages}
              running={runs > 0}
              holdLast
              release={!loading}
              note="The steps are shown for explanation; the draft itself comes from the Copilot SDK agent (or the prepared demo draft)."
            />
            {!draft && !loading && runs === 0 && (
              <span className="hx-empty">Click “Draft explanation” – nothing is sent to the patient until you approve every sentence.</span>
            )}
            {draft?.note && <p className="note">{draft.note}</p>}
            {draft && (
              <>
                {detail && (
                  <ol className="x52-timeline" aria-label="Care journey">
                    {detail.timeline.map((event) => (
                      <li key={event.date}>
                        <strong>{event.date}</strong>
                        {event.event}
                      </li>
                    ))}
                  </ol>
                )}
                {patientSentences.map((sentence, index) => (
                  <div
                    key={sentence.id}
                    className={['x52-sentence', approved.has(sentence.id) ? 'approved' : '', editing === sentence.id ? 'editing' : ''].join(' ').trim()}
                  >
                    <span className="x52-num">{index + 1}</span>
                    <div>
                      {editing === sentence.id ? (
                        <textarea
                          autoFocus
                          rows={2}
                          value={textOf(sentence)}
                          onChange={(e) => setEdits({ ...edits, [sentence.id]: e.target.value })}
                          onBlur={() => setEditing(null)}
                        />
                      ) : (
                        <span className="x52-sentence-text" onClick={() => setEditing(sentence.id)}>
                          {textOf(sentence)}
                        </span>
                      )}
                      <div className="x52-sentence-meta">
                        <button type="button" className="hx-btn" onClick={() => setOpenSource(sentence.source_id)}>
                          Source: {sentence.source_title}
                        </button>
                        {edits[sentence.id] !== undefined && edits[sentence.id] !== sentence.text && <Pill tone="info">Edited by you</Pill>}
                        {sentence.risk && <Pill tone="warn">May be misunderstood: {sentence.risk}</Pill>}
                      </div>
                    </div>
                    <div className="x52-sentence-actions">
                      {approved.has(sentence.id) ? (
                        <Pill tone="ok">Approved</Pill>
                      ) : (
                        <button
                          type="button"
                          className="hx-btn"
                          onClick={() => setApproved(new Set(approved).add(sentence.id))}
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {patientSentences.length > 0 && (
                  <p style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="hx-btn"
                      onClick={() => setApproved(new Set(patientSentences.map((s) => s.id)))}
                    >
                      Approve all remaining sentences
                    </button>
                  </p>
                )}
              </>
            )}
          </Panel>
          <SourcePanel detail={detail} openSource={openSource} onOpen={setOpenSource} sourceById={sourceById} />
        </div>
      )}

      {section === 'gp' && (
        <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(360px, 3fr) minmax(280px, 2fr)' }}>
          <Panel
            title="Letter to the GP (German) – same decision, medical wording"
            actions={
              draft && (
                <>
                  <Pill tone="ok">Built from the same sources as the patient text</Pill>
                  <button type="button" className="hx-btn primary" disabled={letterFiled} onClick={() => setLetterFiled(true)}>
                    {letterFiled ? 'Letter filed & sent ✓' : 'Approve and send to GP'}
                  </button>
                </>
              )
            }
          >
            {!draft && <Working label="Drafting the GP letter" hint="AI answers can take up to a minute" />}
            {draft && (
              <div className="x52-letter">
                {draft.gp_sentences.map((sentence) => (
                  <p key={sentence.id}>
                    {textOf(sentence)}{' '}
                    <button type="button" className="hx-btn" onClick={() => setOpenSource(sentence.source_id)}>
                      {sentence.source_title}
                    </button>
                  </p>
                ))}
              </div>
            )}
          </Panel>
          <SourcePanel detail={detail} openSource={openSource} onOpen={setOpenSource} sourceById={sourceById} />
        </div>
      )}

      {section === 'check' && (
        <div className="hx-grid">
          <Panel title="Questions to check understanding during the consultation">
            {!draft && <Working label="Drafting the questions" hint="AI answers can take up to a minute" />}
            {draft?.questions.map((question, index) => (
              <div key={index} className="x52-sentence">
                <span className="x52-num">{index + 1}</span>
                <div>
                  <strong>{question.question}</strong>
                  <div className="x52-sentence-meta">Answer you expect: {question.expected_answer}</div>
                </div>
                <div className="x52-sentence-actions">
                  {asked[index] ? (
                    <Pill tone={asked[index] === 'understood' ? 'ok' : 'warn'}>
                      {asked[index] === 'understood' ? 'Understood' : 'Explain again'}
                    </Pill>
                  ) : (
                    <>
                      <button type="button" className="hx-btn" onClick={() => setAsked({ ...asked, [index]: 'understood' })}>
                        Understood
                      </button>
                      <button type="button" className="hx-btn" onClick={() => setAsked({ ...asked, [index]: 'repeat' })}>
                        Explain again
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Panel>
          <Panel
            title={sentToPortal ? 'Sent to the patient portal' : 'Patient portal preview (not sent yet)'}
            actions={<Pill tone={sentToPortal ? 'ok' : 'warn'}>{sentToPortal ? 'Approved by you' : 'Awaiting your approval'}</Pill>}
          >
            <div className="x52-portal">
              <h4>{detail ? `${detail.name} – ${detail.board}` : 'Patient portal'}</h4>
              {patientSentences
                .filter((s) => approved.has(s.id))
                .map((s) => (
                  <p key={s.id}>{textOf(s)}</p>
                ))}
              {approved.size === 0 && <p className="hx-empty">No sentence approved yet – the portal stays empty.</p>}
            </div>
            <p style={{ marginTop: 10 }}>
              <Pill tone={letterFiled ? 'ok' : 'neutral'}>{letterFiled ? 'GP letter sent' : 'GP letter not sent yet'}</Pill>{' '}
              <Pill tone="neutral">Treatment choice stays with the patient and the doctor</Pill>
            </p>
          </Panel>
        </div>
      )}
    </HospitalShell>
  );
}

function BoardDecision({ detail }: { detail: CaseDetail }) {
  const [tab, setTab] = useState(detail.sources[0]?.id ?? 'mdt');
  return (
    <>
      <div className="hx-grid">
        <Panel title={`Board outcome · ${detail.board}`}>
          <p style={{ marginTop: 0 }}>
            <strong>{detail.decision}</strong>
          </p>
          <DataTable
            rowKey={(o) => o.name}
            rows={detail.options}
            columns={[
              { key: 'name', label: 'Option', render: (o) => <strong>{o.name}</strong> },
              { key: 'benefit', label: 'Benefit for the patient' },
              { key: 'drawback', label: 'Disadvantage / burden' },
              { key: 'source_id', label: 'Source', render: (o) => <Pill tone="info">{o.source_id}</Pill> },
            ]}
          />
          {detail.open_questions.map((question) => (
            <p key={question} style={{ margin: '8px 0 0' }}>
              <Pill tone="crit">Open</Pill> {question}
            </p>
          ))}
        </Panel>
        <Panel title="How this patient can be reached">
          <dl className="hx-facts">
            <dt>Consultation</dt>
            <dd>{detail.consultation}</dd>
            <dt>Preferred language</dt>
            <dd>
              <Pill tone="info">{detail.communication.preferred_language_label}</Pill>
            </dd>
            <dt>Reading level</dt>
            <dd>{detail.communication.reading_level === 'simple' ? 'Simple (~B1)' : 'Detailed'}</dd>
            <dt>Health literacy</dt>
            <dd>{detail.communication.health_literacy}</dd>
            <dt>Interpreter</dt>
            <dd>{detail.communication.interpreter_needed ? <Pill tone="warn">Needed</Pill> : 'Not needed'}</dd>
            <dt>Support</dt>
            <dd>{detail.communication.support_person}</dd>
          </dl>
        </Panel>
      </div>
      <Panel title="Source reports the explanation must stay consistent with">
        <Tabs active={tab} onChange={setTab} tabs={detail.sources.map((s) => ({ id: s.id, label: s.title }))} />
        <div className="x52-source">{detail.sources.find((s) => s.id === tab)?.text}</div>
      </Panel>
      <Panel title="Care journey so far">
        <ol className="x52-timeline">
          {detail.timeline.map((event) => (
            <li key={event.date}>
              <strong>{event.date}</strong>
              {event.event}
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

function SourcePanel({
  detail,
  openSource,
  onOpen,
  sourceById,
}: {
  detail: CaseDetail | null;
  openSource: string | null;
  onOpen: (id: string) => void;
  sourceById: Map<string, CaseSource>;
}) {
  const source = openSource ? sourceById.get(openSource) : undefined;
  return (
    <Panel title={source ? `Source · ${source.title}` : 'Source'}>
      <div className="chip-row">
        {(detail?.sources ?? []).map((s) => (
          <button key={s.id} type="button" className="chip" onClick={() => onOpen(s.id)}>
            {s.title}
          </button>
        ))}
      </div>
      {source ? (
        <>
          <p className="note">sample-data/{source.path} · synthetic</p>
          <div className="x52-source">{source.text}</div>
        </>
      ) : (
        <span className="hx-empty">Click “Source” next to a sentence to see where it comes from.</span>
      )}
    </Panel>
  );
}
