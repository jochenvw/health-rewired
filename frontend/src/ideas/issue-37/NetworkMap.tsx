import { useMemo } from 'react';
import type { NetworkHospital } from '../../api';

export type NetworkPhase = 'idle' | 'querying' | 'responded';

const HOME_ID = 'DE-01';

/**
 * The signature visual for issue #37: a living map of the simulated European hospital network.
 * While `phase === 'querying'` each remote node pulses in turn along its link to "you" (this
 * hospital); once `phase === 'responded'` each node shows only an aggregated match count –
 * never a raw record. `pulseHome` re-animates the links outward, used to show a confirmed
 * outcome being fed back into the network.
 */
export function NetworkMap({
  hospitals,
  phase,
  flaggedCountry,
  pulseHome,
}: {
  hospitals: NetworkHospital[];
  phase: NetworkPhase;
  /** Country to highlight because it dominates the matches (geographic-bias flag). */
  flaggedCountry?: string | null;
  pulseHome?: boolean;
}) {
  const width = 560;
  const height = 320;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 66;

  const home = hospitals.find((h) => h.id === HOME_ID) ?? hospitals[0];
  const remote = hospitals.filter((h) => h.id !== home?.id);

  const positioned = useMemo(
    () =>
      remote.map((h, i) => {
        const angle = (i / remote.length) * Math.PI * 2 - Math.PI / 2;
        return { ...h, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      }),
    [remote, cx, cy, radius],
  );

  return (
    <svg
      className={`eu-map eu-map-${phase}${pulseHome ? ' eu-map-pulse' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Simulated European hospital network"
    >
      {positioned.map((h, i) => (
        <line
          key={`link-${h.id}`}
          x1={cx}
          y1={cy}
          x2={h.x}
          y2={h.y}
          className="eu-link"
          style={{ animationDelay: `${i * 110}ms` }}
        />
      ))}
      {home && (
        <g className="eu-node eu-node-home">
          <circle cx={cx} cy={cy} r={28} />
          <text x={cx} y={cy - 3}>
            You
          </text>
          <text x={cx} y={cy + 12} className="eu-node-sub">
            {home.name.split(' ')[0]}
          </text>
        </g>
      )}
      {positioned.map((h, i) => {
        const flagged = !!flaggedCountry && flaggedCountry === h.country;
        return (
          <g
            key={h.id}
            className={['eu-node', flagged ? 'eu-node-flagged' : ''].join(' ').trim()}
            style={{ animationDelay: `${i * 110}ms` }}
          >
            <circle cx={h.x} cy={h.y} r={phase === 'responded' && h.matched > 0 ? 19 : 14} />
            <text x={h.x} y={h.y + (phase === 'responded' ? -24 : 26)} className="eu-node-label">
              {h.name.length > 22 ? `${h.name.slice(0, 21)}…` : h.name}
            </text>
            {phase === 'responded' && (
              <text x={h.x} y={h.y + 4} className="eu-node-count">
                {h.matched > 0 ? `n=${h.matched}` : '–'}
              </text>
            )}
            <title>
              {h.name} · {h.country}
              {phase === 'responded'
                ? ` · ${h.matched} comparable patient(s) reported · only counts and summaries left this site`
                : phase === 'querying'
                  ? ' · searching locally…'
                  : ' · idle'}
            </title>
          </g>
        );
      })}
    </svg>
  );
}

/** Small stacked bar showing which countries the matches came from, to make geographic bias visible at a glance. */
export function CountryMixBar({ cases }: { cases: { country: string }[] }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of cases) map.set(c.country, (map.get(c.country) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);
  const total = cases.length || 1;
  const dominant = counts[0];
  const isBiased = !!dominant && dominant[1] / total > 0.6 && counts.length > 1 ? true : counts.length === 1 && total > 1;

  return (
    <div className="eu-country-mix">
      <div className="eu-country-bar" role="img" aria-label="Country mix of matched patients">
        {counts.map(([country, n]) => (
          <span
            key={country}
            className="eu-country-seg"
            style={{ width: `${(n / total) * 100}%` }}
            title={`${country}: ${n} patient(s)`}
          >
            {(n / total) * 100 >= 12 ? country : ''}
          </span>
        ))}
      </div>
      {isBiased && dominant && (
        <span className="eu-country-flag">
          ⚠ {dominant[1]} of {total} from {dominant[0]} alone – limited geographic diversity
        </span>
      )}
    </div>
  );
}
