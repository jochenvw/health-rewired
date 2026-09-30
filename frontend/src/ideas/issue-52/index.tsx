import { useCallback, useEffect, useMemo, useState } from 'react';
import type { IdeaMeta } from '../index';
import {
  Attention,
  Backstage,
  Badge,
  DataTable,
  GuideRail,
  InspectionDrawer,
  Panel,
  Tabs,
  Working,
  Workspace,
  useTheme,
  type GuideStep,
  type Stage,
} from './Workspace';

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
    status: 'Approved and sent',
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
    status: 'Not drafted',
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
    status: 'Not drafted',
    demo: false,
  },
];

const story: GuideStep[] = [
  {
    id: 'worklist',
    title: 'Post-MDT consultations',
    explain: 'Patients discussed at this week’s tumour board who still have to hear the outcome. Open Sanne de Vries.',
  },
  {
    id: 'mdt',
    title: 'What the board decided',
    explain:
      'The MDT conclusion with the pathology and MRI reports behind it – and what this patient can read and understand.',
  },
  {
    id: 'explanation',
    title: 'Draft in her language',
    explain:
      'The assistant writes the explanation in Dutch at her reading level. Every sentence keeps a link to the report it came from.',
  },
  {
    id: 'approve',
    title: 'Edit and approve',
    explain: 'Rewrite any sentence, open its source, and approve sentence by sentence. Nothing reaches the patient before you do.',
  },
  {
    id: 'gp',
    title: 'Letter to the GP',
    explain: 'The same decision as a German letter for the GP, built from the same sources – so both versions say the same thing.',
  },
  {
    id: 'check',
    title: 'Check understanding',
    explain: 'Three questions to ask during the consultation, then the approved explanation goes to the patient portal.',
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
  const [theme, setTheme] = useTheme();
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
  const [inspect, setInspect] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentToPortal, setSentToPortal] = useState(false);
  const [letterFiled, setLetterFiled] = useState(false);
  const [asked, setAsked] = useState<Record<number, 'understood' | 'repeat'>>({});

  useEffect(() => {
    call<CaseRow[]>('/cases')
      .then(setCases)
      .catch(() => setError('The post-MDT list could not be loaded. Start the API with `npm run dev`.'));
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
        if (data.communication.preferred_language) setLanguage(data.communication.preferred_language);
        if (data.communication.reading_level) setReadingLevel(data.communication.reading_level);
      })
      .catch(() => setError(`The record for ${patientId} could not be opened.`));
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

  // Guided-story steps must also trigger the fetch, or jumping ahead lands on an empty panel.
  const go = (id: string) => {
    const target = (id === 'approve' ? 'explanation' : id) as Section;
    setSection(target);
    setNotice(null);
    if (['explanation', 'approve', 'gp', 'check'].includes(id) && !draft && !loading) void runDraft();
  };

  const patientSentences = draft?.patient_sentences ?? [];
  const remaining = patientSentences.filter((s) => !approved.has(s.id)).length;
  const allApproved = patientSentences.length > 0 && remaining === 0;
  const flagged = patientSentences.filter((s) => s.risk).length;
  const storyStep = section === 'explanation' && approved.size > 0 ? 'approve' : section;
  const textOf = (s: Sentence) => edits[s.id] ?? s.text;
  const editedCount = patientSentences.filter((s) => edits[s.id] !== undefined && edits[s.id] !== s.text).length;
  const sourceById = useMemo(() => new Map((detail?.sources ?? []).map((s) => [s.id, s])), [detail]);
  const inspected: CaseSource | undefined = inspect ? sourceById.get(inspect) : undefined;

  const workRows: WorkRow[] = [
    ...cases.map((c) => ({
      patient_id: c.patient_id,
      name: c.name,
      diagnosis: c.diagnosis,
      consultation: c.consultation,
      language_label: c.language_label,
      decision: c.decision,
      interpreter_needed: c.interpreter_needed,
      status: c.patient_id === patientId && sentToPortal ? 'Approved and sent' : 'Not drafted',
      demo: true,
    })),
    ...otherConsultations,
  ];

  const moduleLabel =
    section === 'worklist'
      ? 'Consultation list'
      : section === 'mdt'
        ? 'Board decision'
        : section === 'explanation'
          ? 'Patient explanation'
          : section === 'gp'
            ? 'GP letter'
            : 'Understanding check';

  return (
    <Workspace
      product="Post-MDT communication"
      module={moduleLabel}
      organisation="Klinikum Rewired München · Colorectal cancer care"
      location="Outpatient clinic 3B"
      theme={theme}
      onTheme={setTheme}
      banner={
        section === 'worklist' || !detail
          ? null
          : {
              name: detail.name,
              sub: `${detail.patient_id} · ${detail.age} y · ${detail.sex} · ${detail.board}`,
              facts: [
                { label: 'Diagnosis', value: detail.diagnosis },
                { label: 'Stage', value: detail.stage },
                {
                  label: 'Reads',
                  value: (
                    <>
                      {detail.communication.preferred_language_label ?? 'Not recorded'}
                      {detail.communication.interpreter_needed && <> · interpreter</>}
                    </>
                  ),
                },
                {
                  label: 'Reading level',
                  value: detail.communication.reading_level === 'simple' ? 'Simple (~B1)' : 'Detailed',
                },
                { label: 'Consultation', value: detail.consultation },
              ],
              action: (
                <button type="button" className="x52-btn" onClick={() => setSection('mdt')}>
                  Open complete board record
                </button>
              ),
            }
      }
      guide={
        <GuideRail
          steps={story}
          current={storyStep}
          onGo={go}
          nextLabel={section === 'worklist' ? 'Open the board decision' : undefined}
        />
      }
      nav={[
        { id: 'worklist', label: 'Consultation list', detail: 'Board outcomes to deliver', count: workRows.length },
        { id: 'mdt', label: 'Board decision', detail: 'Conclusion and source reports', count: detail?.sources.length },
        {
          id: 'explanation',
          label: 'Patient explanation',
          detail: draft ? `${approved.size}/${patientSentences.length} approved` : 'Not drafted',
          count: flagged || undefined,
        },
        { id: 'gp', label: 'GP letter', detail: letterFiled ? 'Sent' : 'Not sent' },
        { id: 'check', label: 'Understanding check', detail: sentToPortal ? 'Portal updated' : 'Portal empty' },
      ]}
      active={section}
      onNav={go}
      toolbar={
        <>
          <label className="x52-field">
            <span>Patient</span>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              {cases.map((c) => (
                <option key={c.patient_id} value={c.patient_id}>
                  {c.name} ({c.patient_id})
                </option>
              ))}
            </select>
          </label>
          <label className="x52-field">
            <span>Written for</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="x52-field">
            <span>Reading level</span>
            <select value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
              {readingLevels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <span className="x52-toolbar-end">
            {loading && <Working label="Assistant is drafting" hint="it can take up to a minute" />}
            <button
              type="button"
              className="x52-btn primary"
              disabled={loading}
              onClick={() => {
                setSection('explanation');
                void runDraft();
              }}
            >
              {loading ? 'Drafting…' : draft ? 'Draft again in this language' : 'Draft explanation for this patient'}
            </button>
          </span>
        </>
      }
      drawer={
        <InspectionDrawer
          open={Boolean(inspected)}
          title={inspected?.title ?? ''}
          subtitle={inspected ? `sample-data/${inspected.path} · synthetic` : undefined}
          onClose={() => setInspect(null)}
        >
          <p className="x52-muted" style={{ fontSize: 13, marginTop: 0 }}>
            The full report the sentence was written from. Every claim in the patient text and in the GP letter has to
            be traceable to one of these documents.
          </p>
          <div className="x52-source">{inspected?.text}</div>
        </InspectionDrawer>
      }
    >
      {error && (
        <Attention tone="danger" status="Blocked" title="Something did not load">
          {error}
        </Attention>
      )}
      {notice && (
        <Attention tone="warn" status="Not available" title="This consultation is outside the demo data">
          {notice}
        </Attention>
      )}

      {section === 'worklist' && (
        <>
          <Attention
            tone="warn"
            status="Human review required"
            title="Patients are waiting for an explanation they can actually read"
            action={
              <button type="button" className="x52-btn primary" onClick={() => go('mdt')}>
                Open the board decision
              </button>
            }
          >
            Two cases carry a full synthetic record in this prototype. The assistant drafts; you edit, approve and send.
          </Attention>
          <Panel eyebrow="Today · post-MDT queue" title="Board outcomes still to be delivered">
            <DataTable
              caption="Patients discussed at the tumour board who have not yet heard the outcome"
              rowKey={(r) => r.patient_id}
              rows={workRows}
              selected={patientId}
              onSelect={(r) => {
                if (!r.demo) {
                  setNotice(
                    `${r.name} is inline demo context only – open Sanne de Vries or Giulia Moretti for the full record.`,
                  );
                  return;
                }
                setNotice(null);
                setPatientId(r.patient_id);
                setSection('mdt');
              }}
              columns={[
                { key: 'consultation', label: 'Consultation', width: '180px' },
                { key: 'name', label: 'Patient', render: (r) => <strong>{r.name}</strong> },
                { key: 'diagnosis', label: 'Diagnosis' },
                { key: 'decision', label: 'Board outcome' },
                {
                  key: 'language_label',
                  label: 'Reads',
                  render: (r) => (
                    <>
                      <Badge tone="info">{r.language_label}</Badge>{' '}
                      {r.interpreter_needed && <Badge tone="warn">Interpreter</Badge>}
                    </>
                  ),
                },
                {
                  key: 'status',
                  label: 'Explanation',
                  render: (r) => <Badge tone={r.status === 'Approved and sent' ? 'ok' : 'warn'}>{r.status}</Badge>,
                },
              ]}
            />
          </Panel>
        </>
      )}

      {section === 'mdt' &&
        (detail ? (
          <BoardDecision detail={detail} onInspect={setInspect} onDraft={() => go('explanation')} />
        ) : (
          <Panel eyebrow="Opening the record" title="Board decision">
            <Working label="Opening the board record" />
          </Panel>
        ))}

      {section === 'explanation' && (
        <>
          {draft && (
            <Attention
              tone={allApproved ? 'ok' : 'warn'}
              status={allApproved ? 'Approved by you' : 'Human review required'}
              title={
                allApproved
                  ? 'Every sentence is approved – the text can go to the patient portal'
                  : `${remaining} of ${patientSentences.length} sentences still need your approval`
              }
              action={
                <button
                  type="button"
                  className="x52-btn primary"
                  disabled={!allApproved || sentToPortal}
                  onClick={() => {
                    setSentToPortal(true);
                    setSection('check');
                  }}
                >
                  {sentToPortal ? 'Sent to patient portal ✓' : 'Send approved text to patient portal'}
                </button>
              }
            >
              The assistant drafts; nothing is shown to the patient until you approve it.
              {flagged > 0 && (
                <>
                  {' '}
                  {flagged} sentence{flagged === 1 ? ' is' : 's are'} flagged as easily misunderstood.
                </>
              )}
            </Attention>
          )}
          <div className="x52-grid work">
            <div className="x52-stack">
              <Panel
                eyebrow="Claim → source → approval"
                title={draft ? draft.headline : 'Explanation for the patient'}
                actions={
                  draft && (
                    <>
                      <Badge tone={draft.mode === 'copilot' ? 'ok' : 'neutral'}>
                        {draft.mode === 'copilot' ? 'Copilot SDK agent' : 'Prepared demo draft'}
                      </Badge>
                      <Badge tone="info">{draft.language_label}</Badge>
                      <Badge tone="info">{draft.reading_level === 'simple' ? 'Simple (~B1)' : 'Detailed'}</Badge>
                      <Badge tone={allApproved ? 'ok' : 'warn'}>
                        {approved.size}/{patientSentences.length} approved
                      </Badge>
                    </>
                  )
                }
              >
                <Backstage
                  key={runs}
                  title="What the assistant is doing"
                  stages={stages}
                  running={runs > 0}
                  holdLast
                  release={!loading}
                  note="The stages are shown so the work is visible. The draft itself comes from the Copilot SDK agent, or from the prepared demo draft when no token is configured."
                />
                {!draft && !loading && runs === 0 && (
                  <p className="x52-empty">
                    Use “Draft explanation for this patient”. Nothing is sent until you approve every sentence.
                  </p>
                )}
                {draft?.note && (
                  <Attention tone="warn" status="Demo path" title="The live assistant was not used">
                    {draft.note}
                  </Attention>
                )}
                {draft && (
                  <div className="x52-sentences">
                    {patientSentences.map((sentence, index) => (
                      <div
                        key={sentence.id}
                        className={[
                          'x52-sentence',
                          approved.has(sentence.id) ? 'approved' : '',
                          editing === sentence.id ? 'editing' : '',
                        ]
                          .join(' ')
                          .trim()}
                      >
                        <span className="x52-num">{index + 1}</span>
                        <div>
                          {editing === sentence.id ? (
                            <textarea
                              autoFocus
                              rows={2}
                              aria-label={`Sentence ${index + 1}`}
                              value={textOf(sentence)}
                              onChange={(e) => setEdits({ ...edits, [sentence.id]: e.target.value })}
                              onBlur={() => setEditing(null)}
                            />
                          ) : (
                            <button
                              type="button"
                              className="x52-sentence-text"
                              onClick={() => setEditing(sentence.id)}
                              aria-label={`Edit sentence ${index + 1}`}
                            >
                              {textOf(sentence)}
                            </button>
                          )}
                          <div className="x52-sentence-meta">
                            <button
                              type="button"
                              className="x52-btn source"
                              onClick={() => setInspect(sentence.source_id)}
                            >
                              Source · {sentence.source_title}
                            </button>
                            {edits[sentence.id] !== undefined && edits[sentence.id] !== sentence.text && (
                              <Badge tone="accent">Rewritten by you</Badge>
                            )}
                          </div>
                          {sentence.risk && (
                            <p className="x52-risk">
                              <strong>May be misunderstood:</strong> {sentence.risk}
                            </p>
                          )}
                        </div>
                        <div className="x52-sentence-actions">
                          {approved.has(sentence.id) ? (
                            <>
                              <Badge tone="ok">Approved</Badge>
                              <button
                                type="button"
                                className="x52-btn quiet"
                                onClick={() => {
                                  const next = new Set(approved);
                                  next.delete(sentence.id);
                                  setApproved(next);
                                }}
                              >
                                Undo
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="x52-btn"
                              onClick={() => setApproved(new Set(approved).add(sentence.id))}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {patientSentences.length > 0 && !allApproved && (
                  <p style={{ marginTop: 14, marginBottom: 0 }}>
                    <button
                      type="button"
                      className="x52-btn"
                      onClick={() => setApproved(new Set(patientSentences.map((s) => s.id)))}
                    >
                      Approve the remaining {remaining} sentence{remaining === 1 ? '' : 's'}
                    </button>
                  </p>
                )}
              </Panel>
              {detail && <CareJourney timeline={detail.timeline} />}
            </div>
            <div className="x52-stack">
              <Panel eyebrow="How the draft was reached" title="Reasoning path">
                <ol className="x52-reason">
                  <li>
                    <span>Trying to answer</span>
                    How do we tell this patient the board outcome so that she can take part in the decision?
                  </li>
                  <li>
                    <span>Considered</span>
                    {detail
                      ? `${detail.sources.map((s) => s.title).join('; ')}, plus her recorded language, reading level and support person.`
                      : 'The MDT conclusion and its source reports, plus the patient profile.'}
                  </li>
                  <li>
                    <span>This showed</span>
                    {detail?.decision ?? 'The board outcome and the options with their benefits and burdens.'}
                  </li>
                  <li className="uncertain">
                    <span>But this remains uncertain</span>
                    A negative biopsy of a scar cannot exclude deeper residual tumour, and probabilities such as “1 in
                    4” are easily heard as certainties. Those sentences are flagged rather than smoothed over.
                  </li>
                  <li className="conclusion">
                    <span>So the current conclusion is</span>
                    A sentence-level draft in her language and reading level, each sentence traceable to one report,
                    and a GP letter built from the same sources.
                  </li>
                  <li>
                    <span>Next</span>
                    You edit and approve every sentence. The treatment choice stays between the patient and her doctor.
                  </li>
                </ol>
              </Panel>
              <Panel eyebrow="Approval record" title="What you have changed">
                <dl className="x52-facts">
                  <dt>Approved</dt>
                  <dd>
                    {approved.size} of {patientSentences.length || '–'} sentences
                  </dd>
                  <dt>Rewritten</dt>
                  <dd>
                    {editedCount} sentence{editedCount === 1 ? '' : 's'}
                  </dd>
                  <dt>Flagged</dt>
                  <dd>{flagged} easily misunderstood</dd>
                  <dt>Portal</dt>
                  <dd>{sentToPortal ? <Badge tone="ok">Sent</Badge> : <Badge tone="warn">Nothing sent</Badge>}</dd>
                  <dt>GP letter</dt>
                  <dd>{letterFiled ? <Badge tone="ok">Sent</Badge> : <Badge tone="warn">Not sent</Badge>}</dd>
                </dl>
                {draft && draft.trace.length > 0 && (
                  <details style={{ marginTop: 14 }}>
                    <summary className="x52-eyebrow" style={{ cursor: 'pointer' }}>
                      Tools the assistant called
                    </summary>
                    <ul className="x52-trace">
                      {draft.trace.map((step, index) => (
                        <li key={index}>
                          <code>{step.tool}</code>
                          {step.arguments ? ` · ${step.arguments.slice(0, 60)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}

      {section === 'gp' && (
        <>
          <Attention
            tone={letterFiled ? 'ok' : 'warn'}
            status={letterFiled ? 'Sent to the practice' : 'Human review required'}
            title={
              letterFiled
                ? 'The GP received the same decision the patient was told'
                : 'The GP letter needs its own approval before it is sent'
            }
            action={
              <button
                type="button"
                className="x52-btn primary"
                disabled={!draft || letterFiled}
                onClick={() => setLetterFiled(true)}
              >
                {letterFiled ? 'Approved and sent ✓' : 'Approve and send to GP'}
              </button>
            }
          >
            The letter stays German whatever the patient reads, and is written from the same reports, so the two
            versions cannot drift apart.
          </Attention>
          <div className="x52-grid work">
            <Panel
              variant="report"
              eyebrow="Claim → source"
              title="Letter to the general practitioner (German)"
              actions={draft && <Badge tone="info">Same sources as the patient text</Badge>}
            >
              {!draft && <Working label="Drafting the GP letter" hint="the assistant can take up to a minute" />}
              {draft && (
                <div className="x52-letter">
                  {draft.gp_sentences.map((sentence) => (
                    <p key={sentence.id}>
                      {textOf(sentence)}{' '}
                      <button type="button" className="x52-btn source" onClick={() => setInspect(sentence.source_id)}>
                        Source · {sentence.source_title}
                      </button>
                    </p>
                  ))}
                </div>
              )}
            </Panel>
            <Panel eyebrow="Side by side" title="What the patient is being told">
              {patientSentences.length === 0 ? (
                <p className="x52-empty">Draft the patient explanation first.</p>
              ) : (
                <>
                  <p className="x52-muted" style={{ fontSize: 13, marginTop: 0 }}>
                    Only approved sentences appear here – this is what the GP letter has to agree with.
                  </p>
                  {patientSentences
                    .filter((s) => approved.has(s.id))
                    .map((s) => (
                      <p key={s.id} style={{ fontSize: 13 }}>
                        {textOf(s)}
                      </p>
                    ))}
                  {approved.size === 0 && <p className="x52-empty">No sentence approved yet.</p>}
                </>
              )}
            </Panel>
          </div>
        </>
      )}

      {section === 'check' && (
        <>
          <Attention
            tone={sentToPortal ? 'ok' : 'warn'}
            status={sentToPortal ? 'Portal updated' : 'Nothing sent'}
            title={
              sentToPortal
                ? 'The approved explanation is in the patient portal, in her own language'
                : 'The portal stays empty until you approve and send the explanation'
            }
          >
            Ask the three questions during the consultation. The treatment choice stays between the patient and her
            doctor; the assistant adds no prognosis and no independent advice.
          </Attention>
          <div className="x52-grid">
            <Panel eyebrow="During the consultation" title="Questions to check understanding">
              {!draft && <Working label="Drafting the questions" hint="the assistant can take up to a minute" />}
              {draft?.questions.map((question, index) => (
                <div key={index} className="x52-sentence">
                  <span className="x52-num">{index + 1}</span>
                  <div>
                    <strong>{question.question}</strong>
                    <div className="x52-sentence-meta">
                      <span className="x52-eyebrow">Answer you expect</span>
                      <span style={{ fontSize: 13 }}>{question.expected_answer}</span>
                    </div>
                  </div>
                  <div className="x52-sentence-actions">
                    {asked[index] ? (
                      <Badge tone={asked[index] === 'understood' ? 'ok' : 'warn'}>
                        {asked[index] === 'understood' ? 'Understood' : 'Explain again'}
                      </Badge>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="x52-btn"
                          onClick={() => setAsked({ ...asked, [index]: 'understood' })}
                        >
                          Understood
                        </button>
                        <button
                          type="button"
                          className="x52-btn"
                          onClick={() => setAsked({ ...asked, [index]: 'repeat' })}
                        >
                          Explain again
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
            <Panel
              eyebrow={sentToPortal ? 'What the patient sees at home' : 'Preview · not sent'}
              title={detail ? `Patient portal · ${detail.name}` : 'Patient portal'}
              actions={
                <Badge tone={sentToPortal ? 'ok' : 'warn'}>{sentToPortal ? 'Approved by you' : 'Awaiting approval'}</Badge>
              }
            >
              <div className="x52-portal">
                <h4>{detail ? detail.board : 'Tumour board'}</h4>
                <p className="x52-eyebrow">{draft?.language_label}</p>
                {patientSentences
                  .filter((s) => approved.has(s.id))
                  .map((s) => (
                    <p key={s.id}>{textOf(s)}</p>
                  ))}
                {approved.size === 0 && <p className="x52-empty">No sentence approved yet – the portal stays empty.</p>}
              </div>
            </Panel>
          </div>
        </>
      )}
    </Workspace>
  );
}

function CareJourney({ timeline }: { timeline: { date: string; event: string }[] }) {
  return (
    <Panel eyebrow="Context" title="Care journey so far">
      <ol className="x52-timeline">
        {timeline.map((event, index) => (
          <li key={event.date} className={index === timeline.length - 1 ? 'last' : undefined}>
            <strong>{event.date}</strong>
            {event.event}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function BoardDecision({
  detail,
  onInspect,
  onDraft,
}: {
  detail: CaseDetail;
  onInspect: (id: string) => void;
  onDraft: () => void;
}) {
  const [tab, setTab] = useState(detail.sources[0]?.id ?? 'mdt');
  const source = detail.sources.find((s) => s.id === tab);
  return (
    <>
      {detail.open_questions.map((question) => (
        <Attention
          key={question}
          tone="warn"
          status="Open question"
          title={question}
          action={
            <button type="button" className="x52-btn primary" onClick={onDraft}>
              Draft the explanation
            </button>
          }
        />
      ))}
      <div className="x52-grid">
        <Panel eyebrow="Current conclusion" title={detail.board}>
          <p className="x52-decision">{detail.decision}</p>
          <DataTable
            caption="Options the board considered, with what each means for the patient"
            rowKey={(o) => o.name}
            rows={detail.options}
            columns={[
              { key: 'name', label: 'Option', render: (o) => <strong>{o.name}</strong> },
              { key: 'benefit', label: 'Benefit for the patient' },
              { key: 'drawback', label: 'Disadvantage or burden' },
              {
                key: 'source_id',
                label: 'Source',
                render: (o) => (
                  <button type="button" className="x52-btn source" onClick={() => onInspect(o.source_id)}>
                    Open
                  </button>
                ),
              },
            ]}
          />
        </Panel>
        <Panel eyebrow="How this patient can be reached" title="Communication profile">
          <dl className="x52-facts">
            <dt>Consultation</dt>
            <dd>{detail.consultation}</dd>
            <dt>Preferred language</dt>
            <dd>
              <Badge tone="info">{detail.communication.preferred_language_label ?? 'Not recorded'}</Badge>
            </dd>
            <dt>Reading level</dt>
            <dd>{detail.communication.reading_level === 'simple' ? 'Simple (~B1)' : 'Detailed'}</dd>
            <dt>Health literacy</dt>
            <dd>{detail.communication.health_literacy ?? 'Not recorded'}</dd>
            <dt>Interpreter</dt>
            <dd>{detail.communication.interpreter_needed ? <Badge tone="warn">Needed</Badge> : 'Not needed'}</dd>
            <dt>Support</dt>
            <dd>{detail.communication.support_person ?? 'Not recorded'}</dd>
          </dl>
        </Panel>
      </div>
      <Panel
        variant="report"
        eyebrow="Provenance · the explanation must stay consistent with these"
        title="Source reports"
        actions={
          source && (
            <button type="button" className="x52-btn" onClick={() => onInspect(source.id)}>
              Open in inspection drawer
            </button>
          )
        }
      >
        <Tabs active={tab} onChange={setTab} tabs={detail.sources.map((s) => ({ id: s.id, label: s.title }))} />
        <p className="x52-eyebrow">sample-data/{source?.path} · synthetic</p>
        <div className="x52-source">{source?.text}</div>
      </Panel>
      <CareJourney timeline={detail.timeline} />
    </>
  );
}
