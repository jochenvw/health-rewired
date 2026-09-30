import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AgentResult, PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';
import './workspace.css';

export const meta: IdeaMeta = {
  id: '55',
  issue: 55,
  title: 'From a DNA result to a matching trial anywhere in Europe',
  tagline:
    'For the oncologist preparing the molecular tumour board: the alteration explained, and which European trials fit – criterion by criterion.',
};

type Criterion = {
  id: string;
  kind: 'inclusion' | 'exclusion';
  text_local: string;
  text_en: string;
  status: 'met' | 'not_met' | 'unknown';
  fact: string;
  observed?: string | null;
  source?: string | null;
};

type Trial = {
  id: string;
  country: string;
  city: string;
  site: string;
  language: string;
  title_local: string;
  title_en: string;
  phase: string;
  drug: string;
  status: string;
  contact?: string;
  travel_from_munich?: string;
  criteria: Criterion[];
  verdict: 'match' | 'excluded' | 'blocked';
};

type Missing = {
  fact: string;
  label: string;
  hint: string;
  suggested: number;
  suggested_source: string;
  trial_id: string;
  criterion: string;
};

type Screening = {
  screened: number;
  countries: string[];
  languages: string[];
  registry_snapshot: string;
  drug_availability: Record<string, string>[];
  shortlist: Trial[];
  screened_out: { id: string; country: string; city: string; title_en: string; phase: string; screen_out: string }[];
  missing: Missing[];
};

type CaseData = { patient: PatientRecord; dna_report: string; dna_report_source: string; screening: Screening };

// Idea-local API helper, so this idea stays in its own files.
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/ideas/55${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

type Section = 'report' | 'trials' | 'referral';

const story: StoryStep[] = [
  {
    id: 'report',
    title: 'DNA report has arrived',
    explain: 'Whole-genome sequencing came back for Nora Lindqvist. Let the assistant explain what the alteration means.',
  },
  {
    id: 'trials',
    title: 'Search Europe',
    explain: 'The assistant compares her record with trial criteria written in German, Italian, Dutch and Spanish.',
  },
  {
    id: 'missing',
    title: 'Fill the missing value',
    explain: 'One trial is blocked because a value is unknown – not because she fails it. Add the value and watch the result change.',
  },
  {
    id: 'referral',
    title: 'Referral package',
    explain: 'Choose the trial you want to pursue. The assistant drafts the package in the receiving centre’s language.',
  },
  {
    id: 'approve',
    title: 'Your decision',
    explain: 'Nothing is sent automatically. You approve the package for the molecular tumour board.',
  },
];

const interpretStages: Stage[] = [
  { label: 'Opening the whole-genome sequencing report', detail: 'genomics/P-004-wgs-report.md', ms: 700 },
  { label: 'Linking variants to knowledge sources', detail: 'ERBB2, TP53, APC · ESCAT tiering (synthetic)', ms: 900 },
  { label: 'Checking the clinical record for context', detail: 'RAS/BRAF status, prior lines, cardiac assessment', ms: 800 },
  { label: 'Writing the explanation for the tumour board' },
];

const screeningStages: Stage[] = [
  { label: 'Querying the European trial registry', detail: '12 trials · Germany, Italy, Netherlands, Spain', ms: 800 },
  { label: 'Translating eligibility criteria', detail: 'German, Italian, Dutch, Spanish → working English', ms: 900 },
  { label: 'Matching criteria against the patient record', detail: '9 trials screened out on tumour type or alteration', ms: 900 },
  { label: 'Checking drug availability by country', detail: 'Fictional availability per country', ms: 700 },
  { label: 'Marking every criterion met, not met or unknown', ms: 700 },
];

const referralStages: Stage[] = [
  { label: 'Collecting the evidence for each criterion', detail: 'With the source file for every value', ms: 800 },
  { label: 'Reading the cross-border referral template', detail: 'referrals/referral-package-template.md', ms: 700 },
  { label: 'Drafting the cover letter in the site language', ms: 900 },
];

const verdictLabel = { match: 'Match', excluded: 'Excluded', blocked: 'Blocked – value unknown' };
const verdictBadge = { match: 'match', excluded: 'excluded', blocked: 'blocked' } as const;
const statusLabel = { met: 'Met', not_met: 'Not met', unknown: 'Unknown' };
const statusBadge = { met: 'match', not_met: 'excluded', unknown: 'blocked' } as const;

/** Small monospaced operational label above a section (design language §5). */
function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="eu55-eyebrow">{children}</span>;
}

/** Status badge: always carries text, never colour alone. */
function Badge({ kind, children }: { kind: 'match' | 'blocked' | 'excluded' | 'info' | 'running'; children: ReactNode }) {
  return <span className={`eu55-badge eu55-badge-${kind}`}>{children}</span>;
}

/**
 * Attention strip: what needs a person, what unlocks the next step, and the action that focuses
 * the required input. Stays visible until genuinely resolved.
 */
function Attention({
  tone,
  eyebrow,
  children,
  who,
  action,
}: {
  tone: 'blocking' | 'warning' | 'resolved';
  eyebrow: string;
  children: ReactNode;
  who?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`eu55-attention ${tone === 'warning' ? '' : tone}`} aria-live="polite">
      <div style={{ flex: '1 1 320px' }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <p>{children}</p>
      </div>
      {action}
      {who && <p className="eu55-attention-who">{who}</p>}
    </section>
  );
}

/** The agent's public account of its work – never private model deliberation. */
function ReasoningPath({ steps }: { steps: { label: string; text: ReactNode }[] }) {
  return (
    <ol className="eu55-reasoning">
      {steps.map((step) => (
        <li key={step.label}>
          <b>{step.label}</b>
          {step.text}
        </li>
      ))}
    </ol>
  );
}

/** Right-side inspection drawer with Escape handling and focus restoration. */
function Drawer({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="eu55-drawer-backdrop" onClick={onClose} />
      <aside className="eu55 eu55-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div style={{ flex: 1 }}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2>{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="hx-btn" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="eu55-drawer-body">{children}</div>
      </aside>
    </>
  );
}

export default function EuropeanTrialMatch() {
  const [section, setSection] = useState<Section>('report');
  const [data, setData] = useState<CaseData | null>(null);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [entered, setEntered] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const [interpretation, setInterpretation] = useState<AgentResult | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretStarted, setInterpretStarted] = useState(false);
  const [interpretRun, setInterpretRun] = useState(0);

  const [screenStarted, setScreenStarted] = useState(false);
  const [screenRun, setScreenRun] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const [trialId, setTrialId] = useState<string | null>(null);
  const [referral, setReferral] = useState<AgentResult | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftRun, setDraftRun] = useState(0);
  const [approved, setApproved] = useState(false);
  const [inspect, setInspect] = useState<'report' | 'criterion' | null>(null);
  const [inspectCriterion, setInspectCriterion] = useState<{ trial: Trial; criterion: Criterion } | null>(null);

  const closeDrawer = useCallback(() => {
    setInspect(null);
    setInspectCriterion(null);
  }, []);

  const inspectCriterionRow = useCallback((trial: Trial, criterion: Criterion) => {
    setInspectCriterion({ trial, criterion });
    setInspect('criterion');
  }, []);

  useEffect(() => {
    call<CaseData>('/case')
      .then((result) => {
        setData(result);
        setScreening(result.screening);
      })
      .catch(() => setNotice('Could not load the synthetic case. Is the backend running?'));
  }, []);

  const startScreening = () => {
    setSection('trials');
    setScreenRun((n) => n + 1);
    setScreenStarted(true);
  };

  const explain = async () => {
    setSection('report');
    setInterpreting(true);
    setInterpretStarted(true);
    setInterpretRun((n) => n + 1);
    setInterpretation(null);
    try {
      setInterpretation(await call<AgentResult>('/interpret', {}));
    } catch {
      setNotice('The assistant could not be reached.');
    } finally {
      setInterpreting(false);
    }
  };

  const addValue = async (fact: string, value: string) => {
    const next = { ...answers, [fact]: value };
    setAnswers(next);
    setEntered((current) => ({ ...current, [fact]: value }));
    try {
      const updated = await call<Screening>('/match', { answers: next });
      setScreening(updated);
      const now = updated.shortlist.filter((t) => t.verdict === 'match').map((t) => `${t.city} (${t.country})`);
      setNotice(`Value added to the working record. Matching trials now: ${now.join(', ') || 'none'}.`);
    } catch {
      setNotice('Could not re-check the trials.');
    }
  };

  const draft = async (id: string) => {
    setTrialId(id);
    setSection('referral');
    setDrafting(true);
    setDraftStarted(true);
    setDraftRun((n) => n + 1);
    setReferral(null);
    setApproved(false);
    try {
      setReferral(await call<AgentResult>('/referral', { trial_id: id, answers }));
    } catch {
      setNotice('The assistant could not draft the package.');
    } finally {
      setDrafting(false);
    }
  };

  const shortlist = screening?.shortlist ?? [];
  const matches = shortlist.filter((t) => t.verdict === 'match');
  const blocked = shortlist.filter((t) => t.verdict === 'blocked');
  const open = shortlist.find((t) => t.id === selected) ?? shortlist[0] ?? null;
  const chosen = shortlist.find((t) => t.id === trialId) ?? null;

  const storyStep = useMemo(() => {
    if (section === 'referral') return approved ? 'approve' : 'referral';
    if (section === 'trials') return blocked.length > 0 ? 'missing' : 'trials';
    return 'report';
  }, [section, approved, blocked.length]);

  return (
    <HospitalShell
      module="Molecular tumour board preparation"
      guide={
        <div className="eu55 eu55-guide">
          <StoryGuide
            steps={story}
            current={storyStep}
            onGo={(id) => {
              if (id === 'report') setSection('report');
              else if (id === 'trials' || id === 'missing') startScreening();
              else setSection('referral');
            }}
            nextLabel={section === 'report' ? 'Search European trials' : undefined}
          />
        </div>
      }
      nav={[
        { id: 'report', label: 'DNA report' },
        { id: 'trials', label: 'European trials', badge: shortlist.length || undefined },
        { id: 'referral', label: 'Referral package', badge: matches.length || undefined },
      ]}
      active={section}
      onNav={(id) => (id === 'trials' ? startScreening() : setSection(id as Section))}
      patient={
        data
          ? {
              id: data.patient.id,
              name: data.patient.name,
              age: data.patient.age,
              sex: data.patient.sex,
              diagnosis: `${data.patient.diagnosis.primary} · ${data.patient.diagnosis.stage} · ECOG ${data.patient.ecog}`,
              ward: 'Molecular Oncology · MTB 17-03-2026',
            }
          : null
      }
      toolbar={
        <>
          <span>
            <strong>WGS report 14-03-2026</strong> · ERBB2 (HER2) amplification · Tier I
          </span>
          <span className="hx-spacer" />
          <button type="button" className="hx-btn" onClick={explain} disabled={interpreting}>
            {interpreting ? (
              <>
                <span className="hx-spinner" aria-hidden /> Explaining…
              </>
            ) : (
              'Explain this DNA result'
            )}
          </button>
          <button type="button" className="hx-btn primary" onClick={startScreening}>
            Search European trials
          </button>
        </>
      }
    >
      <div className="eu55">
      {notice && (
        <Attention tone="resolved" eyebrow="Working record updated">
          {notice}
        </Attention>
      )}

      {section === 'report' &&
        (data ? (
          <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(340px, 1fr)' }}>
            <Panel
              title="Whole-genome sequencing result"
              actions={
                <button type="button" className="hx-btn" onClick={() => setInspect('report')}>
                  Open complete report
                </button>
              }
            >
              <Eyebrow>Reported 14-03-2026 · {data.dna_report_source}</Eyebrow>
              <DataTable
                rowKey={(r) => r.k}
                rows={Object.entries(data.patient.diagnosis.biomarkers).map(([k, v]) => ({ k, v }))}
                rowTone={(r) => (r.k.startsWith('HER2') ? 'warn' : undefined)}
                columns={[
                  { key: 'k', label: 'Finding', width: '200px', render: (r) => <strong>{r.k}</strong> },
                  { key: 'v', label: 'Result' },
                ]}
              />
              <div className="eu55-section" style={{ marginTop: 12 }}>
                <Eyebrow>Current conclusion</Eyebrow>
                <p style={{ margin: '0 0 8px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <Badge kind="info">Actionable · Tier I</Badge>
                  <span>
                    ERBB2 (HER2) amplification, copy number 11.4. RAS and BRAF wild-type keep HER2-directed trials open.
                  </span>
                </p>
                <p className="eu55-note">
                  Evidence and full laboratory text stay one action away –{' '}
                  <button type="button" className="eu55-linkish" onClick={() => setInspect('report')}>
                    open the complete report
                  </button>
                  .
                </p>
              </div>
            </Panel>
            <Panel
              title={interpretation ? interpretation.headline : 'Assistant – what does this alteration mean?'}
              actions={
                <Badge kind={interpreting ? 'running' : interpretation ? 'info' : 'info'}>
                  {interpreting
                    ? 'Assistant working'
                    : interpretation
                      ? interpretation.mode === 'copilot'
                        ? 'Live assistant'
                        : 'Deterministic demo path'
                      : 'Not run yet'}
                </Badge>
              }
            >
              <Eyebrow>Public account of the assistant's work</Eyebrow>
              <Backstage
                key={interpretRun}
                title="Behind the scenes – reading the DNA report"
                stages={interpretStages}
                running={interpretStarted}
                holdLast
                release={!interpreting}
                note="The steps are shown for explanation; the answer comes from the Copilot SDK agent (or the demo fallback)."
              />
              {!interpretStarted && (
                <span className="hx-empty">
                  Click “Explain this DNA result”. The assistant reads the report, links the variant to knowledge sources and says
                  what is still missing.
                </span>
              )}
              {interpretation && (
                <div className="blocks">
                  {interpretation.note && <p className="note">{interpretation.note}</p>}
                  {interpretation.blocks.map((block, index) => (
                    <RenderBlock key={index} block={block} />
                  ))}
                </div>
              )}
              {interpretation && (
                <ReasoningPath
                  steps={[
                    { label: 'Trying to answer', text: 'Which alteration in this report could open a treatment option?' },
                    { label: 'Considered', text: 'The WGS report, the clinical summary and the tier of each alteration.' },
                    { label: 'This showed', text: 'ERBB2 (HER2) amplification, RAS and BRAF wild-type – HER2-directed trials stay open.' },
                    {
                      label: 'But this remains uncertain',
                      text: 'Cardiac function (LVEF) is not in the record, and HER2-directed trials usually require it.',
                    },
                    { label: 'So the current conclusion is', text: 'Screen the European registry for HER2-directed trials.' },
                    { label: 'Next', text: 'The molecular tumour board judges clinical relevance; nothing is sent anywhere.' },
                  ]}
                />
              )}
              <p style={{ marginTop: 12 }}>
                <button type="button" className="hx-btn primary" onClick={startScreening}>
                  Search European trials for this alteration →
                </button>
              </p>
            </Panel>
          </div>
        ) : (
          <Panel title="Molecular tumour board preparation">
            <Working label="Loading the synthetic case" />
          </Panel>
        ))}

      {section === 'trials' &&
        (screening ? (
          <>
            <Backstage
              key={screenRun}
              title="Behind the scenes – screening the European registry"
              stages={screeningStages}
              running={screenStarted}
              note={`Synthetic registry snapshot ${screening.registry_snapshot} · ${screening.screened} trials · ${screening.countries.join(
                ', ',
              )} · criteria written in ${screening.languages.join(', ')}`}
            />
            <Panel
              title={`Shortlist · ${shortlist.length} trials in ${new Set(shortlist.map((t) => t.country)).size} countries`}
              actions={
                <div className="eu55-counts">
                  <span className="eu55-count">
                    <Badge kind="info">{screening.screened} screened</Badge>
                  </span>
                  <span className="eu55-count">
                    <Badge kind="match">{matches.length} match</Badge>
                  </span>
                  <span className="eu55-count">
                    <Badge kind="blocked">{blocked.length} blocked</Badge>
                  </span>
                  <span className="eu55-count">
                    <Badge kind="excluded">{shortlist.filter((t) => t.verdict === 'excluded').length} excluded</Badge>
                  </span>
                </div>
              }
            >
              <DataTable
                rowKey={(t) => t.id}
                rows={shortlist}
                selected={open?.id}
                onSelect={(t) => setSelected(t.id)}
                rowTone={(t) => (t.verdict === 'excluded' ? 'crit' : t.verdict === 'blocked' ? 'warn' : undefined)}
                columns={[
                  { key: 'country', label: 'Country', width: '130px', render: (t) => `${t.country} · ${t.city}` },
                  {
                    key: 'title',
                    label: 'Trial (site language)',
                    render: (t) => (
                      <>
                        <strong>{t.title_local}</strong>
                        <div className="hx-stage-detail">
                          {t.title_en} · {t.id} · phase {t.phase}
                        </div>
                      </>
                    ),
                  },
                  { key: 'drug', label: 'Treatment', width: '170px' },
                  {
                    key: 'verdict',
                    label: 'Result',
                    width: '160px',
                    render: (t) => <Badge kind={verdictBadge[t.verdict]}>{verdictLabel[t.verdict]}</Badge>,
                  },
                  {
                    key: 'go',
                    label: '',
                    width: '130px',
                    render: (t) =>
                      t.verdict === 'match' ? (
                        <button type="button" className="hx-btn primary" onClick={() => draft(t.id)}>
                          Refer…
                        </button>
                      ) : (
                        ''
                      ),
                  },
                ]}
              />
            </Panel>

            {screening.missing.length > 0 && (
              <Panel title="Needs a person before this can be decided">
                <Eyebrow>Unknown is kept as unknown – never assumed either way</Eyebrow>
                {screening.missing.map((m) => (
                  <div key={m.fact} className="eu55-attention blocking" style={{ marginBottom: 10 }}>
                    <div style={{ flex: '1 1 320px' }}>
                      <p style={{ margin: '0 0 6px' }}>
                        <Badge kind="blocked">Unknown</Badge> {m.criterion} – required by <strong>{m.trial_id}</strong>. {m.hint}
                      </p>
                      <p className="eu55-attention-who">Needs the oncologist to enter the documented value.</p>
                    </div>
                    <div className="eu55-field">
                      <label>
                        {m.label}{' '}
                        <input
                          style={{ width: 90 }}
                          value={entered[m.fact] ?? ''}
                          onChange={(e) => setEntered((current) => ({ ...current, [m.fact]: e.target.value }))}
                          placeholder="e.g. 62"
                          inputMode="decimal"
                        />
                      </label>
                      <button
                        type="button"
                        className="hx-btn"
                        onClick={() => addValue(m.fact, entered[m.fact] ?? '')}
                        disabled={!(entered[m.fact] ?? '').trim()}
                      >
                        Add to the record
                      </button>
                      <button type="button" className="hx-btn primary" onClick={() => addValue(m.fact, String(m.suggested))}>
                        Use {m.suggested} from {m.suggested_source}
                      </button>
                    </div>
                  </div>
                ))}
                <p className="eu55-note">
                  Adding a value changes only this working record and re-runs the screening; it writes nothing back to the patient
                  file and sends nothing to any centre.
                </p>
              </Panel>
            )}

            {open && <TrialDetail trial={open} onRefer={() => draft(open.id)} onInspect={inspectCriterionRow} />}

            <Panel title={`Screened out – ${screening.screened_out.length} trials, with the reason`}>
              <Eyebrow>Nothing disappears silently</Eyebrow>
              <DataTable
                rowKey={(t) => t.id}
                rows={screening.screened_out}
                columns={[
                  { key: 'country', label: 'Country', width: '130px', render: (t) => `${t.country} · ${t.city}` },
                  { key: 'title_en', label: 'Trial' },
                  { key: 'phase', label: 'Phase', width: '80px' },
                  { key: 'screen_out', label: 'Why not this patient' },
                ]}
              />
            </Panel>
            <Panel title="Drug availability by country (fictional)">
              <Eyebrow>Synthetic data · not a regulatory source</Eyebrow>
              <DataTable
                rowKey={(r) => String(r.drug)}
                rows={screening.drug_availability}
                columns={[
                  { key: 'drug', label: 'Drug' },
                  { key: 'DE', label: 'Germany' },
                  { key: 'IT', label: 'Italy' },
                  { key: 'NL', label: 'Netherlands' },
                  { key: 'ES', label: 'Spain' },
                ]}
              />
            </Panel>
          </>
        ) : (
          <Panel title="European trials">
            <Working label="Loading the synthetic trial registry" />
          </Panel>
        ))}

      {section === 'referral' && (
        <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(260px, 1fr) minmax(380px, 2fr)' }}>
          <Panel title="Choose the trial to pursue">
            <Eyebrow>Oncologist and patient decide · the board judges relevance</Eyebrow>
            {matches.length === 0 && (
              <span className="hx-empty">No trial matches yet. Add the missing value on the European trials screen.</span>
            )}
            {matches.map((t) => (
              <div key={t.id} style={{ marginBottom: 12 }}>
                <strong>
                  {t.city}, {t.country}
                </strong>
                <div className="hx-stage-detail">
                  {t.title_local} · {t.id} · {t.drug}
                </div>
                <div className="hx-stage-detail">{t.travel_from_munich}</div>
                <button
                  type="button"
                  className="hx-btn primary"
                  style={{ marginTop: 6 }}
                  onClick={() => draft(t.id)}
                  disabled={drafting}
                >
                  {drafting && trialId === t.id ? (
                    <>
                      <span className="hx-spinner" aria-hidden /> Drafting in {t.language}…
                    </>
                  ) : (
                    `Draft package in ${t.language}`
                  )}
                </button>
              </div>
            ))}
          </Panel>
          <Panel
            title={referral ? referral.headline : 'Referral package (draft)'}
            actions={
              <>
                <Badge kind={drafting ? 'running' : referral ? 'info' : 'info'}>
                  {drafting
                    ? 'Drafting'
                    : referral
                      ? referral.mode === 'copilot'
                        ? 'Live assistant · draft'
                        : 'Deterministic demo path · draft'
                      : 'Not drafted yet'}
                </Badge>
                {referral && (
                  <button type="button" className="hx-btn primary" disabled={approved} onClick={() => setApproved(true)}>
                    {approved ? 'Approved for the tumour board ✓' : 'Approve for molecular tumour board'}
                  </button>
                )}
              </>
            }
          >
            <Eyebrow>Draft · nothing is sent automatically</Eyebrow>
            <Backstage
              key={draftRun}
              title={`Behind the scenes – preparing the package for ${chosen?.city ?? 'the receiving centre'}`}
              stages={referralStages}
              running={draftStarted}
              holdLast
              release={!drafting}
              note="Nothing leaves the hospital: the package stays a draft until you approve it, and the receiving team decides final eligibility."
            />
            {!draftStarted && <span className="hx-empty">Choose a matching trial on the left to see the drafted package.</span>}
            {approved && (
              <p className="note">
                Approved for handoff at the molecular tumour board on 17-03-2026 – still not sent. The coordinator sends it after the
                board and after the patient agrees.
              </p>
            )}
            {referral && (
              <div className="blocks">
                {referral.note && <p className="note">{referral.note}</p>}
                {referral.blocks.map((block, index) => (
                  <RenderBlock key={index} block={block} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
      </div>

      {inspect === 'report' && data && (
        <Drawer title="Whole-genome sequencing report" eyebrow="Inspectable by design" onClose={closeDrawer}>
          <p className="eu55-provenance">Source: {data.dna_report_source} · synthetic</p>
          <pre>{data.dna_report}</pre>
        </Drawer>
      )}
      {inspect === 'criterion' && inspectCriterion && (
        <Drawer title="Criterion → evidence → source" eyebrow="Inspectable by design" onClose={closeDrawer}>
          <dl className="eu55-facts">
            <dt>Trial</dt>
            <dd>
              {inspectCriterion.trial.id} · {inspectCriterion.trial.site}
            </dd>
            <dt>Criterion</dt>
            <dd>
              {inspectCriterion.criterion.text_local}
              <div className="eu55-provenance">{inspectCriterion.criterion.text_en}</div>
            </dd>
            <dt>Type</dt>
            <dd>{inspectCriterion.criterion.kind === 'inclusion' ? 'Inclusion' : 'Exclusion'}</dd>
            <dt>Status</dt>
            <dd>
              <Badge kind={statusBadge[inspectCriterion.criterion.status]}>{statusLabel[inspectCriterion.criterion.status]}</Badge>
            </dd>
            <dt>What we know</dt>
            <dd>{inspectCriterion.criterion.observed ?? 'Not recorded – kept as unknown, never assumed'}</dd>
            <dt>Source</dt>
            <dd className="eu55-provenance">{inspectCriterion.criterion.source ?? 'No source in the record'}</dd>
            <dt>Scrutiny</dt>
            <dd>
              {inspectCriterion.criterion.status === 'unknown'
                ? 'Unknown does not mean ineligible. The receiving trial team decides once the value is documented.'
                : 'Screening is deterministic in this prototype; the receiving trial team decides final eligibility.'}
            </dd>
          </dl>
        </Drawer>
      )}
    </HospitalShell>
  );
}

function TrialDetail({
  trial,
  onRefer,
  onInspect,
}: {
  trial: Trial;
  onRefer: () => void;
  onInspect: (trial: Trial, criterion: Criterion) => void;
}) {
  return (
    <Panel
      title={`${trial.id} · ${trial.site}`}
      actions={
        <>
          <Badge kind={verdictBadge[trial.verdict]}>{verdictLabel[trial.verdict]}</Badge>
          {trial.verdict === 'match' && (
            <button type="button" className="hx-btn primary" onClick={onRefer}>
              Prepare referral in {trial.language}
            </button>
          )}
        </>
      }
    >
      <Eyebrow>Criterion → evidence → source</Eyebrow>
      <div style={{ marginBottom: 8 }}>
        <strong>{trial.title_local}</strong>
        <div className="hx-stage-detail">
          {trial.title_en} · phase {trial.phase} · {trial.drug} · {trial.status} · {trial.travel_from_munich}
        </div>
      </div>
      <DataTable
        rowKey={(c) => c.id}
        rows={trial.criteria}
        rowTone={(c) => (c.status === 'not_met' ? 'crit' : c.status === 'unknown' ? 'warn' : undefined)}
        columns={[
          { key: 'kind', label: 'Type', width: '90px', render: (c) => (c.kind === 'inclusion' ? 'Inclusion' : 'Exclusion') },
          {
            key: 'text',
            label: `Criterion (${trial.language})`,
            render: (c) => (
              <>
                {c.text_local}
                <div className="hx-stage-detail">{c.text_en}</div>
              </>
            ),
          },
          {
            key: 'status',
            label: 'Result',
            width: '110px',
            render: (c) => <Badge kind={statusBadge[c.status]}>{statusLabel[c.status]}</Badge>,
          },
          {
            key: 'observed',
            label: 'What we know · source',
            render: (c) => (
              <>
                {c.observed ? (
                  <>
                    {c.observed}
                    <div className="eu55-provenance">{c.source}</div>
                  </>
                ) : (
                  <em>Not in the record – shown as unknown, never assumed</em>
                )}
                <div>
                  <button type="button" className="eu55-linkish" onClick={() => onInspect(trial, c)}>
                    Inspect
                  </button>
                </div>
              </>
            ),
          },
        ]}
      />
    </Panel>
  );
}
