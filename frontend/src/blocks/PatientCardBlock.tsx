import type { BlockProps } from './registry';

export function PatientCardBlock({ block }: BlockProps) {
  return (
    <div className="block-body">
      {block.body && <p className="prose">{block.body}</p>}
      <dl className="facts">
        {block.items.map((item, index) => (
          <div key={index} className="fact" title={item.source ?? undefined}>
            <dt>{item.label}</dt>
            <dd>{item.detail ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
