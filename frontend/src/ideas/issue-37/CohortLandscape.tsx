import { useMemo, useState } from 'react';
import type { NetworkApproach, NetworkCase } from '../../api';

const OUTCOME_TONE: Record<string, string> = {
  controlled: 'ok',
  progressed: 'crit',
  too_early: 'warn',
};

const OUTCOME_LABEL: Record<string, string> = {
  controlled: 'Controlled',
  progressed: 'Progressed',
  too_early: 'Too early to tell',
};

/**
 * A visual cohort landscape: one lane per treatment approach, one dot per comparable patient
 * across Europe, coloured by what happened to them. Two toggles make the strength of the
 * evidence tangible by letting the clinician see how the picture changes when thin or immature
 * evidence is removed – rather than asserting "small sample" in prose only.
 */
export function CohortLandscape({ approaches, cases }: { approaches: NetworkApproach[]; cases: NetworkCase[] }) {
  const [hideWeak, setHideWeak] = useState(false);
  const [matureOnly, setMatureOnly] = useState(false);

  const weakCategories = useMemo(() => new Set(approaches.filter((a) => a.n < 3).map((a) => a.category)), [approaches]);
  const hiddenWeakPatients = useMemo(
    () => approaches.filter((a) => weakCategories.has(a.category)).reduce((sum, a) => sum + a.n, 0),
    [approaches, weakCategories],
  );

  const lanes = useMemo(
    () =>
      approaches
        .filter((a) => !hideWeak || !weakCategories.has(a.category))
        .map((a) => {
          const laneCases = cases.filter((c) => c.approach_category === a.category);
          const shown = matureOnly ? laneCases.filter((c) => (c.followup_months ?? 0) >= 6) : laneCases;
          return { ...a, shown, excluded: laneCases.length - shown.length };
        }),
    [approaches, cases, hideWeak, matureOnly, weakCategories],
  );

  return (
    <div className="eu-landscape">
      <div className="eu-landscape-controls">
        <label>
          <input type="checkbox" checked={hideWeak} onChange={(e) => setHideWeak(e.target.checked)} /> Hide weak
          evidence (fewer than 3 patients)
        </label>
        <label>
          <input type="checkbox" checked={matureOnly} onChange={(e) => setMatureOnly(e.target.checked)} /> Mature
          follow-up only (≥ 6 months)
        </label>
        {hideWeak && hiddenWeakPatients > 0 && (
          <span className="eu-landscape-note">{hiddenWeakPatients} patient(s) hidden from thin approaches</span>
        )}
      </div>
      {lanes.length === 0 && <p className="hx-empty">No approach meets the current evidence filters.</p>}
      {lanes.map((lane) => (
        <div key={lane.category} className="eu-lane">
          <div className="eu-lane-header">
            <strong>{lane.approach}</strong>
            <span className="eu-lane-meta">
              n={lane.shown.length}
              {lane.excluded > 0 ? ` (${lane.excluded} hidden – follow-up <6mo)` : ''}
              {lane.median_pfs_months != null ? ` · median PFS ${lane.median_pfs_months}mo` : ''}
            </span>
          </div>
          <div className="eu-lane-dots" role="list">
            {lane.shown.map((c) => (
              <span
                key={c.id}
                role="listitem"
                className={`eu-dot eu-dot-${OUTCOME_TONE[c.outcome_category] ?? 'neutral'}`}
                title={`${c.hospital_name} (${c.country}) · ${OUTCOME_LABEL[c.outcome_category] ?? c.outcome_category} · ${c.outcome_detail}`}
              />
            ))}
            {lane.shown.length === 0 && <span className="hx-empty">None left after filters.</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
