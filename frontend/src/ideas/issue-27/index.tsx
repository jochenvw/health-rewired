import { useEffect, useMemo, useState } from 'react';
import { request, type AgentResult, type UIItem } from '../../api';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import { Backstage, StoryGuide, type Stage, type StoryStep } from '../../hospital/Story';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '27',
  issue: 27,
  title: 'Patients like mine who were left out of trials',
  tagline:
    'One trial, one query, ten connected European hospitals: watch a real-world cohort get found, reviewed and invited.',
};

type Trial = {
  trial_id: string;
  title: string;
  phase: string;
  cancer_type: string;
  key_inclusion: string;
  key_exclusion: string;
  site: string;
  status: string;
  ecog_max?: string;
  require_biomarker?: string;
  require_value?: string;
  requires_regimen_keyword?: string;
  requires_stage_keyword?: string;
  excludes_stage_keyword?: string;
};

// The 10 connected centres in this scenario's synthetic European network. Munich is "home" (real
// synthetic patients from /sample-data); the rest are fabricated partner sites for the story.
const partnerSites = [
  'Fondazione Oncologica, Milan',
  'Amsterdam UMC',
  'UZ Leuven',
  "Vall d'Hebron, Barcelona",
  'Centre Léon Bérard, Lyon',
  'Medical University of Vienna',
  'Heidelberg University Hospital',
  'Rigshospitalet, Copenhagen',
  'M. Skłodowska-Curie Institute, Warsaw',
];
const homeSite = 'Klinikum Rewired München';

// Small seeded PRNG so the fabricated network numbers stay stable per trial across re-renders,
// without needing a backend call — purely illustrative and always synthetic.
function seeded(trialId: string) {
  let seed = 0;
  for (let i = 0; i < trialId.length; i++) seed = (seed * 31 + trialId.charCodeAt(i)) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type NetworkCandidate = {
  key: string;
  label: string;
  site: string;
  age: number;
  metCriteria: string;
  missing: string;
  matchReason: string;
};

function buildNetwork(trial: Trial) {
  const rng = seeded(trial.trial_id);
  const screened = partnerSites.map((site) => ({
    site,
    screened: 60 + Math.floor(rng() * 220),
    matches: 2 + Math.floor(rng() * 8),
  }));
  const missingOptions = [
    'Biomarker result pending',
    'ECOG not recorded this cycle',
    'Prior-line count unconfirmed',
    '',
    '',
  ];
  const candidates: NetworkCandidate[] = [];
  screened.forEach(({ site, matches }, siteIndex) => {
    for (let i = 0; i < matches; i++) {
      const code = `${site.slice(0, 3).toUpperCase()}-${(100 + siteIndex * 11 + i * 3).toString().padStart(3, '0')}`;
      candidates.push({
        key: code,
        label: code,
        site,
        age: 38 + Math.floor(rng() * 42),
        metCriteria: trial.key_inclusion,
        missing: missingOptions[Math.floor(rng() * missingOptions.length)],
        matchReason: `Structured query match: ${trial.cancer_type} · ${trial.requires_regimen_keyword || trial.require_biomarker || 'key criterion'} on file`,
      });
    }
  });
  return { screened, candidates: candidates.slice(0, 9) };
}

const story: StoryStep[] = [
  {
    id: 'trial',
    title: 'A trial needs patients',
    explain: 'A trial coordinator opens a synthetic trial and its eligibility criteria, in plain text, as written today.',
  },
  {
    id: 'query',
    title: 'AI structures the query',
    explain:
      'The assistant turns the free-text criteria into a structured query — diagnosis, biomarkers, ECOG, exclusions. Adjust and approve it.',
  },
  {
    id: 'network',
    title: 'Ask the connected hospitals',
    explain: 'The approved query goes out to the network. Data never leaves each hospital — only counts and pseudonymised matches come back.',
  },
  {
    id: 'candidates',
    title: 'Review candidates',
    explain: 'The AI pre-selects and ranks candidates with reasons, and shows who was left out and why — with their real-world outcomes.',
  },
  {
    id: 'contact',
    title: 'Contact physicians',
    explain: 'Select candidates to invite. The assistant drafts a short letter to each treating physician for you to review and send.',
  },
  {
    id: 'tracker',
    title: 'Opt-in tracker',
    explain: 'The payoff: watch invitations turn into interest, consent and screening over the following weeks — and the cohort keeps learning.',
  },
];

type Section = (typeof story)[number]['id'];

export default function EuropeanCohortNetwork() {
  const [section, setSection] = useState<Section>('trial');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialId, setTrialId] = useState('');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [buildingCohort, setBuildingCohort] = useState(false);
  const [queryFields, setQueryFields] = useState<Record<string, string>>({});
  const [queryApproved, setQueryApproved] = useState(false);
  const [networkStarted, setNetworkStarted] = useState(false);
  const [networkFinished, setNetworkFinished] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lettersSent, setLettersSent] = useState(false);
  const [trackerStarted, setTrackerStarted] = useState(false);

  useEffect(() => {
    request<Trial[]>('/api/ideas/27/trials')
      .then((data) => {
        setTrials(data);
        if (data[0]) setTrialId(data[0].trial_id);
      })
      .catch(() => setTrials([]));
  }, []);

  const selectedTrial = trials.find((t) => t.trial_id === trialId);
  const network = useMemo(() => (selectedTrial ? buildNetwork(selectedTrial) : { screened: [], candidates: [] }), [selectedTrial]);

  // One call to the idea's agent router — the live Copilot SDK agent decides how far to go in a
  // single turn (sometimes only proposing rules, sometimes proposing *and* building the cohort),
  // so callers merge new blocks into whatever was returned before rather than assuming a fixed shape.
  const callAgent = async (): Promise<AgentResult | null> => {
    if (!selectedTrial) return null;
    try {
      return await request<AgentResult>('/api/ideas/27/run', {
        method: 'POST',
        body: JSON.stringify({
          trial_id: selectedTrial.trial_id,
          treatment: selectedTrial.title,
          subgroup: selectedTrial.key_inclusion,
          outcome: 'lab trend',
          simulate: false,
        }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
      return null;
    }
  };

  const mergeResults = (base: AgentResult, extra: AgentResult): AgentResult => {
    const already = new Set(base.blocks.map((b) => b.type));
    return {
      ...base,
      mode: extra.mode,
      note: extra.note ?? base.note,
      trace: [...base.trace, ...extra.trace],
      blocks: [...base.blocks, ...extra.blocks.filter((b) => !already.has(b.type))],
    };
  };

  const runQuery = async (): Promise<AgentResult | null> => {
    if (!selectedTrial) return null;
    setLoadingQuery(true);
    setError(null);
    setResult(null);
    setQueryApproved(false);
    setNetworkStarted(false);
    setNetworkFinished(false);
    const res = await callAgent();
    if (res) {
      setResult(res);
      setQueryFields({
        Diagnosis: selectedTrial.cancer_type,
        Biomarker: selectedTrial.require_biomarker
          ? `${selectedTrial.require_biomarker} = ${selectedTrial.require_value ?? ''}`
          : 'Not structured for this trial',
        'ECOG max': selectedTrial.ecog_max ?? 'Not specified',
        'Requires regimen': selectedTrial.requires_regimen_keyword || '—',
        'Requires stage': selectedTrial.requires_stage_keyword || '—',
        Excludes: [selectedTrial.excludes_stage_keyword, selectedTrial.key_exclusion].filter(Boolean).join('; '),
      });
    }
    setLoadingQuery(false);
    return res;
  };

  // The live agent sometimes only proposes rules in one turn; ask again (a few tries) until the
  // cohort classification is in, so "Review candidates" always has data once the network has replied.
  const ensureCohortBuilt = async (base: AgentResult) => {
    let current = base;
    setBuildingCohort(true);
    for (let attempt = 0; attempt < 3 && !current.blocks.some((b) => b.type === 'cohort'); attempt++) {
      const extra = await callAgent();
      if (!extra) break;
      current = mergeResults(current, extra);
      setResult(current);
    }
    setBuildingCohort(false);
  };

  const goTo = async (id: string) => {
    const next = id as Section;
    setSection(next);
    if (!selectedTrial) return;
    if (next === 'query' && !result && !loadingQuery) {
      await runQuery();
    } else if (next === 'network' || next === 'candidates') {
      const base = result ?? (await runQuery());
      if (base && !base.blocks.some((b) => b.type === 'cohort')) await ensureCohortBuilt(base);
    }
    if (next === 'network' && !networkStarted) setNetworkStarted(true);
    if (next === 'tracker' && !trackerStarted) setTrackerStarted(true);
  };

  const cohortBlock = result?.blocks.find((b) => b.type === 'cohort');
  const evidenceBlock = result?.blocks.find((b) => b.type === 'evidence');
  const actionsBlock = result?.blocks.find((b) => b.type === 'actions');

  const outcomeFor = (item: UIItem) => evidenceBlock?.items.find((o) => o.source === item.source)?.detail;

  const localEligible = (cohortBlock?.items ?? []).filter((i) => i.status === 'eligible');
  const localLeftOut = (cohortBlock?.items ?? []).filter((i) => i.status !== 'eligible');

  const preSelected = useMemo(() => {
    const s = new Set<string>();
    localEligible.forEach((i) => s.add(i.source ?? i.label));
    network.candidates.slice(0, 5).forEach((c) => s.add(c.key));
    return s;
  }, [localEligible, network.candidates]);

  useEffect(() => {
    if (selected.size === 0 && preSelected.size > 0) setSelected(preSelected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelected]);

  const toggleSelected = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const invited = [
    ...localEligible.map((i) => ({ key: i.source ?? i.label, label: i.label, site: homeSite })),
    ...network.candidates.map((c) => ({ key: c.key, label: c.key, site: c.site })),
  ].filter((row) => selected.has(row.key));

  const hospitalStages: Stage[] = network.screened.map(({ site, screened, matches }) => ({
    label: site,
    detail: `${screened} records screened · ${matches} pseudonymised matches · data stays on site`,
    ms: 550,
  }));

  const trackerStages: Stage[] = [
    { label: 'Day 2 — invitations reach treating physicians', detail: `${invited.length} letters delivered`, ms: 800 },
    {
      label: 'Day 5 — physicians confirm patient interest',
      detail: `${Math.max(1, Math.round(invited.length * 0.7))} patients interested (simulated)`,
      ms: 800,
    },
    {
      label: 'Day 12 — consent discussions completed',
      detail: `${Math.max(1, Math.round(invited.length * 0.55))} consented · ${Math.max(0, Math.round(invited.length * 0.15))} declined (simulated)`,
      ms: 800,
    },
    {
      label: 'Day 19 — screening scheduled across centres',
      detail: `${Math.max(1, Math.round(invited.length * 0.5))} entering screening (simulated)`,
      ms: 900,
    },
  ];

  const trackerRows = invited.map((row, index) => {
    const pattern = index % 4;
    return {
      ...row,
      interested: pattern !== 3,
      status: pattern === 0 ? 'Consented' : pattern === 1 ? 'Screening' : pattern === 2 ? 'Declined' : 'Awaiting reply',
    };
  });

  const centresContributing = new Set(invited.map((r) => r.site)).size;

  return (
    <HospitalShell
      module="Research · European Oncology Network"
      guide={<StoryGuide steps={story} current={section} onGo={goTo} />}
      nav={story.map((s) => ({ id: s.id, label: s.title }))}
      active={section}
      onNav={goTo}
      toolbar={
        <>
          <label>
            Synthetic trial
            <select
              value={trialId}
              onChange={(e) => {
                setTrialId(e.target.value);
                setResult(null);
                setQueryApproved(false);
                setSelected(new Set());
              }}
            >
              {trials.map((t) => (
                <option key={t.trial_id} value={t.trial_id}>
                  {t.trial_id} · {t.title}
                </option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          {result && (
            <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>
              {result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
            </Pill>
          )}
        </>
      }
    >
      {error && (
        <Panel title="Error">
          <p className="error">{error}</p>
        </Panel>
      )}

      {section === 'trial' && selectedTrial && (
        <Panel title="Synthetic trials open across the network">
          <DataTable
            rowKey={(t) => t.trial_id}
            rows={trials}
            selected={trialId}
            onSelect={(t) => setTrialId(t.trial_id)}
            columns={[
              { key: 'trial_id', label: 'Trial', render: (t) => <strong>{t.trial_id}</strong> },
              { key: 'title', label: 'Title' },
              { key: 'phase', label: 'Phase' },
              { key: 'cancer_type', label: 'Cancer type' },
              {
                key: 'status',
                label: 'Status',
                render: (t) => <Pill tone={t.status === 'recruiting' ? 'ok' : 'neutral'}>{t.status}</Pill>,
              },
            ]}
          />
          <p style={{ margin: '14px 0 0' }}>
            <strong>Key inclusion:</strong> {selectedTrial.key_inclusion}
            <br />
            <strong>Key exclusion:</strong> {selectedTrial.key_exclusion}
          </p>
        </Panel>
      )}

      {section === 'query' && (
        <Panel title={`Structured query · ${selectedTrial?.trial_id ?? ''}`}>
          {loadingQuery && <p>Reading the trial's free-text criteria…</p>}
          {!loadingQuery && Object.keys(queryFields).length > 0 && (
            <>
              <table className="hx-table">
                <tbody>
                  {Object.entries(queryFields).map(([field, value]) => (
                    <tr key={field}>
                      <td style={{ width: '160px' }}>
                        <strong>{field}</strong>
                      </td>
                      <td>
                        <input
                          style={{ width: '100%' }}
                          value={value}
                          onChange={(e) => setQueryFields({ ...queryFields, [field]: e.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {actionsBlock && (
                <ul className="evidence" style={{ marginTop: 12 }}>
                  {actionsBlock.items.map((item, index) => (
                    <li key={index}>
                      <strong>{item.label}</strong>
                      {item.detail && <p>{item.detail}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="hx-btn primary" onClick={() => setQueryApproved(true)} disabled={queryApproved}>
                {queryApproved ? 'Query approved ✓' : 'Approve structured query'}
              </button>
            </>
          )}
          {!loadingQuery && Object.keys(queryFields).length === 0 && (
            <button type="button" className="hx-btn primary" onClick={runQuery} disabled={!selectedTrial}>
              Structure the query with AI
            </button>
          )}
        </Panel>
      )}

      {section === 'network' && (
        <Panel title={`Asking the network · ${homeSite} + ${partnerSites.length} partner centres`}>
          <Backstage
            title="Behind the scenes — federated query"
            stages={hospitalStages}
            running={networkStarted}
            onFinished={() => setNetworkFinished(true)}
            note="Simulated for this prototype: only aggregate counts and pseudonymised matches ever leave a hospital."
          />
          {networkFinished && (
            <p className="note" style={{ marginTop: 12 }}>
              {network.screened.reduce((a, s) => a + s.matches, 0) + localEligible.length} pseudonymised matches across{' '}
              {partnerSites.length + 1} centres. Continue to review and rank the candidates.
            </p>
          )}
        </Panel>
      )}

      {section === 'candidates' && (
        <div className="hx-grid" style={{ gridTemplateColumns: '1fr' }}>
          <Panel title="Pre-selected candidates (ranked, pseudonymised)">
            {buildingCohort && !cohortBlock && <p>Finalising classification against the trial's structured criteria…</p>}
            <div className="cohort-stats">
              <div className="cohort-stat" data-status="eligible">
                <strong>{localEligible.length + network.candidates.length}</strong>
                <span>Matched candidates</span>
              </div>
              <div className="cohort-stat" data-status="unknown">
                <strong>{localLeftOut.length}</strong>
                <span>Left out (this site)</span>
              </div>
              <div className="cohort-stat" data-status="ineligible">
                <strong>{partnerSites.length + 1}</strong>
                <span>Centres queried</span>
              </div>
            </div>
            <DataTable
              rowKey={(r) => r.key}
              rows={[
                ...localEligible.map((i) => ({
                  key: i.source ?? i.label,
                  label: i.label,
                  site: homeSite,
                  detail: i.detail ?? '',
                  outcome: outcomeFor(i) ?? '',
                })),
                ...network.candidates.map((c) => ({
                  key: c.key,
                  label: `${c.key} · ${c.age}y`,
                  site: c.site,
                  detail: `${c.matchReason}${c.missing ? ` · Missing: ${c.missing}` : ''}`,
                  outcome: '',
                })),
              ]}
              columns={[
                {
                  key: 'sel',
                  label: '',
                  width: '32px',
                  render: (r) => (
                    <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggleSelected(r.key)} />
                  ),
                },
                { key: 'label', label: 'Candidate', render: (r) => <strong>{r.label}</strong> },
                { key: 'site', label: 'Site' },
                { key: 'detail', label: 'Why matched' },
                { key: 'outcome', label: 'Real-world outcome so far' },
              ]}
            />
          </Panel>
          <Panel title="Left out — and why (hint of an external control arm)">
            <p className="note">
              These patients did not meet the trial's criteria, or their eligibility could not be confirmed. Their
              real-world outcomes are shown for comparison only — this is descriptive, not a validated external
              control arm; that needs separate methodological and governance review.
            </p>
            <DataTable
              rowKey={(r) => r.key}
              rows={localLeftOut.map((i) => ({
                key: i.source ?? i.label,
                label: i.label,
                status: i.status ?? 'unknown',
                reason: i.detail ?? '',
                outcome: outcomeFor(i) ?? '',
              }))}
              empty="No excluded patients recorded at this site for this trial."
              columns={[
                { key: 'label', label: 'Patient', render: (r) => <strong>{r.label}</strong> },
                {
                  key: 'status',
                  label: 'Verdict',
                  render: (r) => <Pill tone={r.status === 'unknown' ? 'warn' : 'neutral'}>{r.status}</Pill>,
                },
                { key: 'reason', label: 'Reason' },
                { key: 'outcome', label: 'Outcome (descriptive, not causal)' },
              ]}
            />
          </Panel>
        </div>
      )}

      {section === 'contact' && (
        <Panel title={`Draft invitations · ${invited.length} candidates selected`}>
          {invited.length === 0 && <span className="hx-empty">Go back to Review candidates and select at least one patient.</span>}
          {invited.map((row) => (
            <div key={row.key} className="hx-panel" style={{ marginBottom: 12, border: '1px solid var(--border)' }}>
              <div className="hx-panel-body">
                <p style={{ margin: '0 0 6px' }}>
                  <strong>To:</strong> Treating physician, {row.site}
                </p>
                <p style={{ margin: 0 }}>
                  Dear colleague — your patient {row.label} may be eligible for {selectedTrial?.title} (
                  {selectedTrial?.trial_id}). Please let us know if your patient wishes to be considered; no data is
                  shared beyond this invitation until you and your patient agree to screening. (Synthetic demo letter.)
                </p>
                <Pill tone={lettersSent ? 'ok' : 'neutral'}>{lettersSent ? 'Sent ✓' : 'Draft ready'}</Pill>
              </div>
            </div>
          ))}
          {invited.length > 0 && (
            <button type="button" className="hx-btn primary" onClick={() => setLettersSent(true)} disabled={lettersSent}>
              {lettersSent ? 'Invitations sent ✓' : 'Send invitations'}
            </button>
          )}
        </Panel>
      )}

      {section === 'tracker' && (
        <Panel title="Opt-in tracker">
          <Backstage
            title="Behind the scenes — replies arriving over the following weeks"
            stages={trackerStages}
            running={trackerStarted}
            note="Simulated timeline for this prototype; a real deployment would update this table as replies arrive."
          />
          <DataTable
            rowKey={(r) => r.key}
            rows={trackerRows}
            columns={[
              { key: 'label', label: 'Candidate', render: (r) => <strong>{r.label}</strong> },
              { key: 'site', label: 'Site' },
              {
                key: 'interested',
                label: 'Interested',
                render: (r) => <Pill tone={r.interested ? 'ok' : 'neutral'}>{r.interested ? 'Yes' : 'Pending'}</Pill>,
              },
              {
                key: 'status',
                label: 'Consent / screening',
                render: (r) => (
                  <Pill tone={r.status === 'Consented' || r.status === 'Screening' ? 'ok' : r.status === 'Declined' ? 'neutral' : 'warn'}>
                    {r.status}
                  </Pill>
                ),
              },
            ]}
          />
          <p className="note" style={{ marginTop: 12 }}>
            <strong>
              {trackerRows.filter((r) => r.status === 'Consented' || r.status === 'Screening').length} candidates in 3
              simulated weeks across {centresContributing} centres.
            </strong>{' '}
            As screening visits and outcomes are recorded, they flow back into this cohort automatically — the
            question stays open, and the cohort keeps learning.
          </p>
        </Panel>
      )}
    </HospitalShell>
  );
}
