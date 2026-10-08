import type { Trial } from './index';
import { SourceReference } from './SourceReference';

export function Intervention({ trial }: { trial: Trial }) {
  return <p className="tm78-intervention">{trial.arms?.join(' vs ') || trial.treatment} · {trial.drug_class || 'Drug class not supplied'} · {trial.schedule || 'Schedule not supplied'}</p>;
}

export function TrialEvidence({ trial }: { trial: Trial }) {
  const profile = trial.illustrative_profile;
  const symbols = { high: '●●●', moderate: '●●○', limited: '●○○', unknown: '?' };
  return <section className="tm78-visible-evidence" aria-label={`${trial.title} illustrative evidence track`}>
    <strong>Illustrative benefit {symbols[profile?.benefit ?? 'unknown']} {profile?.benefit ?? 'unknown'} · toxicity {symbols[profile?.toxicity ?? 'unknown']} {profile?.toxicity ?? 'unknown'}</strong>
    <small>Invented qualitative study profile — never a predicted patient outcome.</small>
    <small>Source: {profile?.source || 'Synthetic profile not supplied'}</small>
    <div className="tm78-evidence-track">{(['I', 'II', 'III'] as const).map((phase) => {
      const entries = trial.evidence_track?.filter((item) => item.phase.split('/').includes(phase)) ?? [];
      return <div key={phase}><strong>Phase {phase}</strong>{entries.length ? entries.map((entry, index) =>
        <div key={index}><span>{entry.result}</span><small>Subgroup: {entry.population} · {entry.sample_size == null ? 'n not supplied' : `n=${entry.sample_size}`}</small>
          <small>Source: {entry.source}</small><details><summary>Limitations</summary>{entry.limitation}</details></div>) :
        <small>No results supplied; no subgroup evidence available.</small>}</div>;
    })}</div>
    <SourceReference source={profile?.rationale || 'No personalised response prediction is provided.'} />
  </section>;
}
