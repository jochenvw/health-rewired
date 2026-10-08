import type { Trial } from './index';

export function SourceReference({ source }: { source: string }) {
  return <details className="tm78-source"><summary>Synthetic source — illustrative</summary>
    <span>{source || 'Issue 78 synthetic demonstration snapshot; no external evidence verified.'}</span>
    <small>Internal demonstration reference, not a real publication, registry entry or clinical record.</small>
  </details>;
}

export function TrialCentres({ trial }: { trial: Trial }) {
  return <div className="tm78-centres">
    <details><summary>Registry details · synthetic</summary><small>Synthetic registry identifier: {trial.registry_id} · fictional, not a live registry</small></details>
    {trial.centres?.map((centre) => <small key={`${centre.name}-${centre.city}`}>
      {centre.nearest ? 'Nearest centre · ' : ''}{centre.name} · {centre.city} · {centre.distance_km} km
    </small>)}
    <SourceReference source={`${trial.registry_id} · synthetic trial catalogue and illustrative centre distances`} />
  </div>;
}
