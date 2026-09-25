import { useEffect, useMemo, useState } from 'react';
import type { AgentResult, PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, Working, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';

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

const verdictTone = { match: 'ok', excluded: 'crit', blocked: 'warn' } as const;
const verdictLabel = { match: 'Match', excluded: 'Excluded', blocked: 'Blocked – value unknown' };
const statusTone = { met: 'ok', not_met: 'crit', unknown: 'warn' } as const;
const statusLabel = { met: 'Met', not_met: 'Not met', unknown: 'Unknown' };

export default function EuropeanTrialMatch() {
  const [section, setSection] = useState<Section>('report');
  const [data, setData] = useState<CaseData | null>(null);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [entered, setEntered] = useState('');
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
    setEntered(value);
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
    if (section === 'trials') return blocked.length > 0 ? 'trials' : 'missing';
    return 'report';
  }, [section, approved, blocked.length]);

  return (
    <HospitalShell
      module="Molecular tumour board preparation"
      guide={
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
      {notice && <Panel title="Information">{notice}</Panel>}

      {section === 'report' &&
        (data ? (
          <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(320px, 1fr) minmax(340px, 1fr)' }}>
            <Panel title={`Whole-genome sequencing · ${data.dna_report_source}`}>
              <DataTable
                rowKey={(r) => r.k}
                rows={Object.entries(data.patient.diagnosis.biomarkers).map(([k, v]) => ({ k, v }))}
                rowTone={(r) => (r.k.startsWith('HER2') ? 'warn' : undefined)}
                columns={[
                  { key: 'k', label: 'Finding', width: '200px', render: (r) => <strong>{r.k}</strong> },
                  { key: 'v', label: 'Result' },
                ]}
              />
              <p style={{ margin: '10px 0 8px' }}>
                <Pill tone="warn">Actionable</Pill> ERBB2 (HER2) amplification, copy number 11.4 · <Pill tone="info">Tier I</Pill> ·
                RAS and BRAF wild-type keep HER2-directed trials open.
              </p>
              <details>
                <summary>Full laboratory report (synthetic)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.5 }}>{data.dna_report}</pre>
              </details>
            </Panel>
            <Panel
              title={interpretation ? interpretation.headline : 'Assistant – what does this alteration mean?'}
              actions={
                interpretation && (
                  <Pill tone={interpretation.mode === 'copilot' ? 'ok' : 'neutral'}>
                    {interpretation.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
                  </Pill>
                )
              }
            >
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
                <>
                  <Pill tone="ok">{matches.length} match</Pill>
                  <Pill tone="warn">{blocked.length} blocked</Pill>
                  <Pill tone="crit">{shortlist.filter((t) => t.verdict === 'excluded').length} excluded</Pill>
                </>
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
                    render: (t) => <Pill tone={verdictTone[t.verdict]}>{verdictLabel[t.verdict]}</Pill>,
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
              <Panel title="Missing before this can be decided">
                {screening.missing.map((m) => (
                  <div key={m.fact} style={{ marginBottom: 10 }}>
                    <p style={{ margin: '0 0 6px' }}>
                      <Pill tone="warn">Unknown</Pill> {m.criterion} – required by <strong>{m.trial_id}</strong>. {m.hint}
                    </p>
                    <div className="chip-row" style={{ alignItems: 'center', gap: 8 }}>
                      <label>
                        {m.label}{' '}
                        <input
                          style={{ width: 90 }}
                          value={entered}
                          onChange={(e) => setEntered(e.target.value)}
                          placeholder="e.g. 62"
                          inputMode="decimal"
                        />
                      </label>
                      <button type="button" className="hx-btn" onClick={() => addValue(m.fact, entered)} disabled={!entered.trim()}>
                        Add to the record
                      </button>
                      <button type="button" className="hx-btn primary" onClick={() => addValue(m.fact, String(m.suggested))}>
                        Use {m.suggested}% from the cardiology echo
                      </button>
                    </div>
                  </div>
                ))}
              </Panel>
            )}

            {open && <TrialDetail trial={open} onRefer={() => draft(open.id)} />}

            <Panel title={`Screened out – ${screening.screened_out.length} trials, with the reason`}>
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
              referral && (
                <>
                  <Pill tone={referral.mode === 'copilot' ? 'ok' : 'neutral'}>
                    {referral.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
                  </Pill>
                  <button type="button" className="hx-btn primary" disabled={approved} onClick={() => setApproved(true)}>
                    {approved ? 'Approved for the tumour board ✓' : 'Approve for molecular tumour board'}
                  </button>
                </>
              )
            }
          >
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
    </HospitalShell>
  );
}

function TrialDetail({ trial, onRefer }: { trial: Trial; onRefer: () => void }) {
  return (
    <Panel
      title={`${trial.id} · ${trial.site}`}
      actions={
        <>
          <Pill tone={verdictTone[trial.verdict]}>{verdictLabel[trial.verdict]}</Pill>
          {trial.verdict === 'match' && (
            <button type="button" className="hx-btn primary" onClick={onRefer}>
              Prepare referral in {trial.language}
            </button>
          )}
        </>
      }
    >
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
            render: (c) => <Pill tone={statusTone[c.status]}>{statusLabel[c.status]}</Pill>,
          },
          {
            key: 'observed',
            label: 'What we know · source',
            render: (c) =>
              c.observed ? (
                <>
                  {c.observed}
                  <div className="hx-stage-detail">{c.source}</div>
                </>
              ) : (
                <em>Not in the record – shown as unknown, never assumed</em>
              ),
          },
        ]}
      />
    </Panel>
  );
}
