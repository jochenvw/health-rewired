import { useEffect, useMemo, useState } from 'react';
import { api, request, type AgentResult, type PatientRecord } from '../../api';
import { RenderBlock } from '../../blocks/registry';
import { DataTable, HospitalShell, Panel, Pill } from '../../hospital/HospitalShell';
import type { IdeaMeta } from '../index';

export const meta: IdeaMeta = {
  id: '27',
  issue: 27,
  title: 'Patients like mine who were left out of trials',
  tagline:
    "What actually happened to patients who did or didn't meet a trial's criteria — with a traceable reason for every patient, not a black box.",
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
};

const outcomeOptions = ['lab trend', 'imaging', 'patient-reported symptoms'];

// Extra fake partner-site rows so the worklist feels like a multi-hospital pull, not 3 records.
// Clearly marked as awaiting integration — never given a real eligibility verdict.
const partnerRows = [
  {
    key: 'partner-augsburg',
    label: 'AUG-0442 · referral pending',
    status: 'unknown' as const,
    reasons: 'Record transfer from Augsburg Hospital not yet linked to this cohort feed',
    outcome: '',
    site: 'Augsburg (partner feed)',
    source: null as string | null,
  },
  {
    key: 'partner-regensburg',
    label: 'REG-1187 · referral pending',
    status: 'unknown' as const,
    reasons: 'Record transfer from Regensburg University Hospital not yet linked to this cohort feed',
    outcome: '',
    site: 'Regensburg (partner feed)',
    source: null as string | null,
  },
  {
    key: 'partner-munich2',
    label: 'MUC-2290 · consent pending',
    status: 'unknown' as const,
    reasons: 'Research-reuse consent for this record has not been confirmed yet',
    outcome: '',
    site: 'Klinikum Rewired München, Ward 4 (partner feed)',
    source: null as string | null,
  },
];

type Section = 'trials' | 'worklist' | 'assistant';

export default function CohortExplorer() {
  const [section, setSection] = useState<Section>('worklist');
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialId, setTrialId] = useState('');
  const [outcome, setOutcome] = useState(outcomeOptions[0]);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<'build' | 'simulate' | null>(null);
  const [approved, setApproved] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PatientRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    request<Trial[]>('/api/ideas/27/trials')
      .then((data) => {
        setTrials(data);
        if (data[0]) setTrialId(data[0].trial_id);
      })
      .catch(() => setTrials([]));
  }, []);

  const selectedTrial = trials.find((t) => t.trial_id === trialId);

  const run = async (simulate: boolean) => {
    if (!selectedTrial) return;
    setLoading(simulate ? 'simulate' : 'build');
    setError(null);
    setApproved(false);
    setSelectedKey(null);
    setSelectedRecord(null);
    setNotice(null);
    try {
      setResult(
        await request<AgentResult>('/api/ideas/27/run', {
          method: 'POST',
          body: JSON.stringify({
            trial_id: selectedTrial.trial_id,
            treatment: selectedTrial.title,
            subgroup: selectedTrial.key_inclusion,
            outcome,
            simulate,
          }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
    } finally {
      setLoading(null);
    }
  };

  // Pre-select the first trial and build its cohort once, so the worklist has data the moment the
  // page opens — no empty screen or setup step.
  useEffect(() => {
    if (selectedTrial && !result && loading === null && !error) run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrial]);

  const cohortBlock = result?.blocks.find((b) => b.type === 'cohort');
  const outcomeBlock = result?.blocks.find((b) => b.type === 'evidence' && b.title.startsWith('What happened'));
  const reviewBlock = result?.blocks.find((b) => b.type === 'alert');

  const realRows = useMemo(
    () =>
      (cohortBlock?.items ?? []).map((item) => {
        const outcomeItem = outcomeBlock?.items.find((o) => o.source === item.source);
        return {
          key: item.source ?? item.label,
          label: item.label,
          status: item.status ?? 'unknown',
          reasons: item.detail ?? '',
          outcome: outcomeItem?.detail ?? '',
          site: 'Klinikum Rewired München (synthetic cohort)',
          source: item.source ?? null,
        };
      }),
    [cohortBlock, outcomeBlock],
  );

  const worklistRows = [...realRows, ...partnerRows];
  const counts = { eligible: 0, ineligible: 0, unknown: 0 } as Record<'eligible' | 'ineligible' | 'unknown', number>;
  for (const row of worklistRows) counts[row.status] += 1;

  const openRow = (row: (typeof worklistRows)[number]) => {
    setSelectedKey(row.key);
    if (!row.source) {
      setSelectedRecord(null);
      setNotice('This record is a placeholder for a partner-site pull — no data has been transferred yet.');
      return;
    }
    setNotice(null);
    const patientId = row.source.replace('patients/', '').replace('.json', '');
    api.patient(patientId).then(setSelectedRecord).catch(() => setSelectedRecord(null));
  };

  const toggleReviewed = (key: string) => {
    const next = new Set(reviewed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setReviewed(next);
  };

  return (
    <HospitalShell
      module="Research / trial eligibility"
      nav={[
        { id: 'trials', label: 'Synthetic trials', badge: trials.length || undefined },
        { id: 'worklist', label: 'Cohort worklist', badge: worklistRows.length },
        { id: 'assistant', label: 'AI assistant' },
      ]}
      active={section}
      onNav={(id) => setSection(id as Section)}
      toolbar={
        <>
          <label>
            Treatment / synthetic trial
            <select value={trialId} onChange={(e) => setTrialId(e.target.value)}>
              {trials.map((t) => (
                <option key={t.trial_id} value={t.trial_id}>
                  {t.trial_id} · {t.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {outcomeOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <span className="hx-spacer" />
          <button
            type="button"
            className="hx-btn primary"
            disabled={loading !== null || !selectedTrial}
            onClick={() => run(false)}
          >
            {loading === 'build' ? 'Building cohort…' : 'Propose & build cohort'}
          </button>
        </>
      }
    >
      {notice && <Panel title="Information">{notice}</Panel>}
      {error && (
        <Panel title="Error">
          <p className="error">{error}</p>
        </Panel>
      )}

      {section === 'trials' && (
        <Panel title="Synthetic trials open across the network">
          <DataTable
            rowKey={(t) => t.trial_id}
            rows={trials}
            selected={trialId}
            onSelect={(t) => {
              setTrialId(t.trial_id);
              setSection('worklist');
            }}
            columns={[
              { key: 'trial_id', label: 'Trial', render: (t) => <strong>{t.trial_id}</strong> },
              { key: 'title', label: 'Title' },
              { key: 'phase', label: 'Phase' },
              { key: 'cancer_type', label: 'Cancer type' },
              { key: 'site', label: 'Site' },
              {
                key: 'status',
                label: 'Status',
                render: (t) => <Pill tone={t.status === 'recruiting' ? 'ok' : 'neutral'}>{t.status}</Pill>,
              },
              { key: 'key_inclusion', label: 'Key inclusion' },
              { key: 'key_exclusion', label: 'Key exclusion' },
            ]}
          />
        </Panel>
      )}

      {section === 'worklist' && (
        <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(360px, 2fr) minmax(260px, 1fr)' }}>
          <Panel
            title={selectedTrial ? `Cohort worklist · ${selectedTrial.trial_id} — ${selectedTrial.title}` : 'Cohort worklist'}
          >
            <div className="cohort-stats">
              <div className="cohort-stat" data-status="eligible">
                <strong>{counts.eligible}</strong>
                <span>Eligible</span>
              </div>
              <div className="cohort-stat" data-status="ineligible">
                <strong>{counts.ineligible}</strong>
                <span>Ineligible</span>
              </div>
              <div className="cohort-stat" data-status="unknown">
                <strong>{counts.unknown}</strong>
                <span>Unknown</span>
              </div>
            </div>
            <DataTable
              rowKey={(r) => r.key}
              rows={worklistRows}
              selected={selectedKey}
              onSelect={openRow}
              empty={loading === 'build' ? 'Building cohort…' : 'Propose & build a cohort to see patients here.'}
              columns={[
                {
                  key: 'label',
                  label: 'Patient',
                  render: (r) => <strong>{r.label}</strong>,
                },
                {
                  key: 'status',
                  label: 'Verdict',
                  render: (r) => (
                    <Pill tone={r.status === 'eligible' ? 'ok' : r.status === 'ineligible' ? 'neutral' : 'warn'}>
                      {r.status}
                    </Pill>
                  ),
                },
                { key: 'reasons', label: 'Reason' },
                { key: 'outcome', label: 'Outcome (descriptive)' },
                { key: 'site', label: 'Site' },
              ]}
            />
          </Panel>
          <Panel title="Selected record">
            {!selectedRecord && <span className="hx-empty">Select a patient row to see the supporting record.</span>}
            {selectedRecord && (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>{selectedRecord.name}</strong> · {selectedRecord.age}y {selectedRecord.sex} · ECOG{' '}
                  {selectedRecord.ecog}
                </p>
                <p style={{ margin: '0 0 8px' }}>
                  {selectedRecord.diagnosis.primary} · {selectedRecord.diagnosis.stage}
                </p>
                <dl className="hx-facts">
                  {Object.entries(selectedRecord.diagnosis.biomarkers).map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  className="hx-btn"
                  onClick={() => selectedKey && toggleReviewed(selectedKey)}
                  disabled={!selectedKey}
                >
                  {selectedKey && reviewed.has(selectedKey) ? 'Marked reviewed ✓' : 'Mark reviewed'}
                </button>
              </>
            )}
          </Panel>
        </div>
      )}

      {section === 'assistant' && (
        <div className="hx-grid" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 2fr)' }}>
          <Panel title="Cohort question">
            <p className="hint">
              {selectedTrial
                ? `Subgroup (from trial criteria): ${selectedTrial.key_inclusion} · Excludes: ${selectedTrial.key_exclusion}`
                : 'Pick a trial in the toolbar above.'}
            </p>
            <div className="chip-row">
              <button className="hx-btn primary" type="button" onClick={() => run(false)} disabled={loading !== null || !selectedTrial}>
                {loading === 'build' ? 'Building cohort…' : 'Propose & build cohort'}
              </button>
            </div>
            {result && (
              <>
                <button type="button" className="hx-btn" onClick={() => setApproved(true)} disabled={approved}>
                  {approved ? 'Rules approved ✓' : 'Approve proposed rules'}
                </button>
                <button
                  className="hx-btn"
                  type="button"
                  onClick={() => run(true)}
                  disabled={loading !== null || !approved}
                  title={approved ? undefined : 'Approve the proposed rules first'}
                >
                  {loading === 'simulate' ? 'Simulating…' : 'Simulate new data & rerun'}
                </button>
              </>
            )}
            {reviewBlock && reviewBlock.items.length > 0 && (
              <Panel title={reviewBlock.title}>
                {reviewBlock.items.map((item, index) => {
                  const key = `${item.label}-${index}`;
                  return (
                    <p key={key} style={{ margin: '0 0 8px' }}>
                      <button
                        type="button"
                        className="hx-btn"
                        onClick={() => toggleReviewed(key)}
                        style={{ marginRight: 8 }}
                      >
                        {reviewed.has(key) ? 'Acknowledged ✓' : 'Acknowledge'}
                      </button>
                      {item.label}
                    </p>
                  );
                })}
              </Panel>
            )}
          </Panel>
          <Panel
            title={result ? result.headline : 'Assistant output'}
            actions={
              result && (
                <Pill tone={result.mode === 'copilot' ? 'ok' : 'neutral'}>
                  {result.mode === 'copilot' ? 'Live AI' : 'Demo mode'}
                </Pill>
              )
            }
          >
            {!result && <span className="hx-empty">Ask a question above to see rules, cohort and outcomes.</span>}
            {result && (
              <div className="result" aria-live="polite">
                {result.note && <p className="note">{result.note}</p>}
                {result.trace.length > 0 && (
                  <ol className="trace" aria-label="What the agent did">
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
        </div>
      )}
    </HospitalShell>
  );
}
