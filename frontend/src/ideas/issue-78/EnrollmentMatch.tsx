import { useEffect, useRef } from 'react';
import { Pill } from '../../hospital/HospitalShell';
import type { Context, Criterion, Trial } from './index';

export type Inspection = { trialId: string; criterionId?: string };
type Props = {
  context: Context; chosen?: Trial; compare: string[];
  choose: (id: string) => void; toggleComparison: (id: string) => void; openScreening: () => void;
  inspection: Inspection | null; setInspection: (value: Inspection | null) => void;
  hiddenTrials: string[]; setHiddenTrials: (value: string[]) => void;
  missingOnly: boolean; setMissingOnly: (value: boolean) => void;
};

const statusLabel = { Match: 'Met', Conflict: 'Not met', Unknown: 'Unknown' };
const statusIcon = { Match: '✓', Conflict: '×', Unknown: '?' };

function CriterionStatus({ criterion }: { criterion: Criterion }) {
  return <span className={`tm78-match-status tm78-status-${criterion.status}`}>
    <span aria-hidden="true">{statusIcon[criterion.status]}</span>{statusLabel[criterion.status]}
  </span>;
}

function TrialEvidence({ trial }: { trial: Trial }) {
  return <details className="tm78-disclosure"><summary>Evidence, prior phases & provenance</summary>
    <small>Synthetic evidence only; no personalised prediction or live literature search.</small>
    {trial.evidence_track?.length ? trial.evidence_track.map((evidence, index) =>
      <div className="tm78-evidence" key={index}>
        <strong>Phase {evidence.phase} · {evidence.phase === trial.phase ? 'current phase' : 'prior phase'}</strong>
        <dl><dt>Result</dt><dd>{evidence.result}</dd>
          <dt>Population</dt><dd>{evidence.population} · n={evidence.sample_size ?? 'not supplied'}</dd>
          <dt>Limitations</dt><dd>{evidence.limitation}</dd><dt>Source</dt><dd>{evidence.source}</dd></dl>
      </div>) : <p>No evidence track supplied.</p>}
  </details>;
}

export function EnrollmentMatch({
  context, chosen, compare, choose, toggleComparison, openScreening,
  inspection, setInspection, hiddenTrials, setHiddenTrials, missingOnly, setMissingOnly,
}: Props) {
  const trials = [...context.trials, ...context.excluded_trials];
  const visible = trials.filter((trial) => !hiddenTrials.includes(trial.id));
  const inspectionTrial = trials.find((trial) => trial.id === inspection?.trialId);
  const inspected = inspectionTrial ?? chosen ?? trials[0];
  const criterion = inspectionTrial?.criteria.find((item) => item.id === inspection?.criterionId);
  const excluded = !!inspected && !context.trials.some((trial) => trial.id === inspected.id);
  const heading = useRef<HTMLHeadingElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const focusInspection = useRef(false);
  const rows = Object.entries(context.facts).filter(([, fact]) =>
    visible.some((trial) => trial.criteria.some((item) =>
      item.patient_label === fact.label && (!missingOnly || item.status === 'Unknown'))));

  useEffect(() => {
    if (focusInspection.current) {
      heading.current?.focus();
      focusInspection.current = false;
    }
  }, [inspection]);

  function inspect(value: Inspection, button: HTMLButtonElement) {
    origin.current = button;
    focusInspection.current = true;
    setInspection(value);
  }

  function backToOverview() {
    setInspection(inspected ? { trialId: inspected.id } : null);
    origin.current?.focus();
  }

  return <section className="tm78-enrollment" aria-label="Enrollment Match eligibility workspace">
    <div className="tm78-match-toolbar">
      <div><span className="tm78-eyebrow">Patient ↔ protocol</span><h2>Eligibility comparison</h2>
        <small>Screening priority, not a treatment recommendation. Inspect any cell to see why.</small></div>
      <div className="tm78-match-toolbar-actions">
        <label className="tm78-choice"><input type="checkbox" checked={missingOnly}
          onChange={(event) => setMissingOnly(event.target.checked)} />Missing information only</label>
        <div><button className="hx-btn primary" disabled={!chosen} onClick={openScreening}>Proceed to screening</button>
          <small>{chosen ? `Chosen: ${chosen.title} · eligibility not confirmed` : 'No screening candidate selected'}</small></div>
      </div>
    </div>
    <div className="tm78-match-legend" aria-label="Criterion status legend">
      <span className="tm78-status-Match">✓ Met · evidence supported</span>
      <span className="tm78-status-Conflict">× Not met · known conflict</span>
      <span className="tm78-status-Unknown">? Unknown · missing information</span>
    </div>
    {!!hiddenTrials.length && <div className="tm78-hidden-trials">
      <span className="tm78-eyebrow">Hidden columns</span>
      {trials.filter((trial) => hiddenTrials.includes(trial.id)).map((trial) =>
        <button className="hx-btn" key={trial.id} onClick={() => setHiddenTrials(hiddenTrials.filter((id) => id !== trial.id))}>
          Restore {trial.title}</button>)}
      <button className="hx-btn" onClick={() => setHiddenTrials([])}>Restore all columns</button>
    </div>}
    <div className="tm78-match-layout">
      <div className="tm78-match-canvas">
        <div className="tm78-matrix-scroll" tabIndex={0} role="region" aria-label="Scrollable patient and trial comparison">
          <table className="tm78-matrix">
            <caption>Synthetic snapshot · {context.snapshot_date}. Hidden columns do not change your screening candidate or Copilot comparison.</caption>
            <thead><tr><th scope="col">Characteristic</th><th scope="col">Patient</th>
              {visible.map((trial) => {
                const isExcluded = !context.trials.some((item) => item.id === trial.id);
                return <th scope="col" key={trial.id} className={chosen?.id === trial.id ? 'tm78-column-chosen' : ''}>
                  <div className="tm78-column-top"><small>Phase {trial.phase} · {trial.status}</small>
                    <button className="hx-btn tm78-hide" aria-label={`Hide ${trial.title} column`}
                      onClick={() => setHiddenTrials([...hiddenTrials, trial.id])}>Hide</button></div>
                  <button className="tm78-trial-heading" aria-controls="tm78-inspector"
                    aria-pressed={inspected?.id === trial.id && !criterion}
                    onClick={(event) => inspect({ trialId: trial.id }, event.currentTarget)}>{trial.title}</button>
                  <small>{trial.site}</small>
                  <div className="tm78-segments" aria-hidden="true">{trial.criteria.map((item) =>
                    <span key={item.id} className={`tm78-segment-${item.status}`} />)}</div>
                  <span className={`tm78-verdict ${isExcluded ? 'tm78-status-Conflict' : 'tm78-status-Unknown'}`}>
                    {isExcluded ? 'Excluded · cannot select' : trial.counts.Unknown ? 'Partial match' : 'Protocol review required'}</span>
                  <small>{trial.counts.Match} met · {trial.counts.Conflict} not met · {trial.counts.Unknown} unknown</small>
                  <label className="tm78-choice"><input type="radio" name="enrollment-screening-candidate"
                    aria-label={`Choose ${trial.title} for screening${isExcluded ? ' — excluded' : ''}`}
                    checked={chosen?.id === trial.id} disabled={isExcluded} onChange={() => choose(trial.id)} />
                    {chosen?.id === trial.id ? 'Chosen for screening' : 'Choose for screening'}</label>
                  {!isExcluded && <label className="tm78-choice"><input type="checkbox" checked={compare.includes(trial.id)}
                    aria-label={`Include ${trial.title} in Copilot review`}
                    disabled={!compare.includes(trial.id) && compare.length >= 4}
                    onChange={() => toggleComparison(trial.id)} />Include in Copilot review</label>}
                </th>;
              })}</tr></thead>
            <tbody>{rows.map(([key, fact]) => <tr key={key}>
              <th scope="row">{fact.label}</th><td className="tm78-patient-value">{fact.display}</td>
              {visible.map((trial) => <td key={trial.id} className={chosen?.id === trial.id ? 'tm78-column-chosen' : ''}>
                {trial.criteria.filter((item) => item.patient_label === fact.label).map((item) =>
                  <button key={item.id} className={`tm78-criterion-cell ${criterion?.id === item.id && inspected?.id === trial.id ? 'is-inspected' : ''}`}
                    aria-label={`${trial.title}: ${fact.label}, ${statusLabel[item.status]}. Inspect evidence`}
                    aria-controls="tm78-inspector" aria-pressed={criterion?.id === item.id && inspected?.id === trial.id}
                    onClick={(event) => inspect({ trialId: trial.id, criterionId: item.id }, event.currentTarget)}>
                    <CriterionStatus criterion={item} /><span className="tm78-eyebrow">{item.kind} criterion</span><span>{item.text}</span>
                  </button>)}
                {!trial.criteria.some((item) => item.patient_label === fact.label) &&
                  <span className="tm78-no-criterion">No criterion supplied</span>}
              </td>)}
            </tr>)}</tbody>
          </table>
          {!rows.length && <p className="tm78-empty">{visible.length ? 'No missing information in the visible columns. Full protocol review is still required.' :
            'All columns hidden. Restore a trial above to continue inspecting.'}</p>}
        </div>
        <div className="tm78-selection-bar">
          <label className="tm78-choice"><input type="radio" name="enrollment-screening-candidate"
            checked={!chosen} onChange={() => choose('')} />None — do not pursue a screening enquiry</label>
          <small>Choosing one trial never confirms eligibility. {compare.length} of 4 included in optional Copilot review.</small>
        </div>
      </div>
      <aside id="tm78-inspector" className="tm78-inspector" aria-label="Trial and evidence inspector">
        <span className="tm78-eyebrow">Inspectable by design · {inspected?.title ?? 'No trial'}</span>
        <h2 tabIndex={-1} ref={heading}>{criterion ? criterion.patient_label : inspected?.title ?? 'Select a trial'}</h2>
        {inspected && (criterion ? <>
          <CriterionStatus criterion={criterion} />
          <div className="tm78-inspector-values">
            <div><span className="tm78-eyebrow">Patient</span><strong>{criterion.patient_value || criterion.evidence}</strong></div>
            <div><span className="tm78-eyebrow">Requires · {criterion.kind}</span><strong>{criterion.text}</strong></div>
          </div>
          <dl><dt>Patient evidence</dt><dd>{criterion.evidence}</dd><dt>Record source</dt><dd>{criterion.source}</dd>
            <dt>Protocol source</dt><dd>{criterion.protocol_source}</dd></dl>
          {criterion.status !== 'Match' && <div className="tm78-attention">
            <strong>{criterion.status === 'Unknown' ? 'Evidence required · cannot mark as met' : 'Known conflict · trial excluded'}</strong>
            <p>{criterion.status === 'Unknown' ? 'Request current evidence during screening. Draft requests and human acknowledgements never resolve an Unknown criterion.' :
              'This protocol cannot be chosen for screening. A clinician cannot override the conflict here.'}</p>
          </div>}
          <button className="hx-btn" onClick={backToOverview}>Back to trial overview</button>
        </> : <>
          <div className="tm78-section-meta"><span>Phase {inspected.phase}</span><span>{inspected.design}</span></div>
          <p>{inspected.description}</p>
          <h3>Study treatment</h3><p>{inspected.treatment || 'Fictional demo regimen · details pending'}</p>
          <div className="tm78-arms">{inspected.arms?.map((arm, index) =>
            <div key={arm}><span className="tm78-arm-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
              <div><span className="tm78-eyebrow">Arm {String.fromCharCode(65 + index)}</span><strong>{arm}</strong></div></div>)}</div>
          <h3>What this means for this patient</h3><p>{inspected.practical_meaning}</p>
          <small>All regimens and treatment names are fictional demo names · not clinical advice.</small>
          <div className="tm78-counts"><Pill tone="ok">{inspected.counts.Match} met</Pill>
            <Pill tone="crit">{inspected.counts.Conflict} not met</Pill><Pill tone="warn">{inspected.counts.Unknown} unknown</Pill></div>
          <details><summary>Why this screening priority</summary><p>{inspected.priority_reason}</p>
            <small>Not a predicted benefit or treatment recommendation.</small></details>
          <TrialEvidence trial={inspected} />
          {excluded && <p className="tm78-attention">Excluded: known conflicts prevent screening selection.</p>}
        </>)}
        <div className="tm78-inspector-gate">
          <span className="tm78-eyebrow">Screening candidate</span><strong>{chosen?.title ?? 'None selected'}</strong>
          <p>{chosen ? `${chosen.counts.Unknown} unknown criteria remain. Eligibility is not confirmed.` : 'No screening enquiry will be prepared.'}</p>
          <button className="hx-btn primary" disabled={!chosen} onClick={openScreening}>Request missing information</button>
          <small>Clinician approval required for all draft requests and patient sharing. Nothing is sent automatically.</small>
          <button className="hx-btn" disabled>Enrolment unavailable · prototype</button>
        </div>
      </aside>
    </div>
  </section>;
}
